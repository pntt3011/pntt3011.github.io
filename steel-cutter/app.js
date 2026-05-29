import initWasm, { compute_cutting_plan_numeric } from '../shared/lib/pkg/steel_cutting_wasm.js';



/* ── DOM refs ── */
let elements = {};

/* ── State ── */
const state = {
    selectedRows: [],
    wasmReady: false,
    computeCuttingPlan: null,
};

// Boot logic
async function boot() {
    // 1. Initialize elements (only after DOM is ready)
    elements = {
        datasetStatus: document.getElementById("datasetStatus"),
        projectName: document.getElementById("projectName"),
        materialLengthCm: document.getElementById("materialLengthCm"),
        bundleSize: document.getElementById("bundleSize"),
        customLengthInput: document.getElementById("customLengthInput"),
        addRowQtyInput: document.getElementById("addRowQtyInput"),
        selectedListBody: document.getElementById("selectedListBody"),
        calculateButton: document.getElementById("calculateButton"),
        resultList: document.getElementById("resultList"),
        resultsSection: document.getElementById("resultsSection"),
        selectedRowTemplate: document.getElementById("selectedRowTemplate"),
        resultCardTemplate: document.getElementById("resultCardTemplate"),
    };

    // 2. Run app initialization
    try {
        await init();
    } catch (error) {
        console.error("Initialization failed:", error);
        setStatus("error", `Lỗi khởi tạo: ${error.message}`);
    }
}

// Start the boot sequence
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
} else {
    boot();
}

/* ── Bootstrap ── */
async function init() {
    bindEvents();
    await loadWasm();
    setStatus("ready", "Sẵn sàng");
    state.selectedRows = [];
    renderResults([]);
}

async function loadWasm() {
    await initWasm();
    state.computeCuttingPlan = compute_cutting_plan_numeric;
    state.wasmReady = true;
}

/* ── Events ── */
function bindEvents() {
    // Keyboard: Enter on length moves focus to qty (or adds if both present)
    elements.customLengthInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            const len = numberValue(elements.customLengthInput);
            const qty = numberValue(elements.addRowQtyInput);
            if (len != null && len > 0 && qty != null && qty > 0) {
                e.preventDefault();
                addSelectedLength();
            } else {
                e.preventDefault();
                elements.addRowQtyInput.focus();
            }
        }
    });

    // Keyboard: Enter on qty adds the item if both present (or switches to length if length is empty)
    elements.addRowQtyInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            const len = numberValue(elements.customLengthInput);
            const qty = numberValue(elements.addRowQtyInput);
            if (len != null && len > 0 && qty != null && qty > 0) {
                e.preventDefault();
                addSelectedLength();
            } else if (len == null) {
                e.preventDefault();
                elements.customLengthInput.focus();
            }
        }
    });

    // Calculate
    elements.calculateButton.addEventListener("click", calculate);

    // Stock-length input
    elements.materialLengthCm.addEventListener("input", updateCalculateState);
    elements.bundleSize.addEventListener("input", updateCalculateState);
}

/* ── Status ── */
function setStatus(kind, text) {
    elements.datasetStatus.className = `status-pill status-pill--${kind}`;
    elements.datasetStatus.textContent = text;
}

// syncCustomAddRow removed in favor of Enter key auto-add flow

function addSelectedLength() {
    const len = numberValue(elements.customLengthInput);
    const qty = numberValue(elements.addRowQtyInput);
    if (len == null || qty == null || qty < 1) return;

    const key = String(len);
    if (state.selectedRows.some(row => row.key === key)) {
        highlightRow(key);
        // clear inputs for custom flow
        elements.customLengthInput.value = "";
        elements.addRowQtyInput.value = "";
        elements.customLengthInput.focus();
        return;
    }

    state.selectedRows.push({
        key,
        lengthOfDetailCm: len,
        qty_needed: qty,
    });

    state.selectedRows.sort((a, b) => b.lengthOfDetailCm - a.lengthOfDetailCm);

    renderSelectedRows();
    updateCalculateState();

    // clear inputs after add (custom-entry flow)
    elements.customLengthInput.value = "";
    elements.addRowQtyInput.value = "";
    elements.customLengthInput.focus();
}

function highlightRow(key) {
    const rows = elements.selectedListBody.querySelectorAll("tr[data-key]");
    for (const row of rows) {
        if (row.dataset.key === key) {
            row.classList.add("row-highlight");
            setTimeout(() => row.classList.remove("row-highlight"), 1200);
            break;
        }
    }
}

/* ── Render cut-list table ── */
function renderSelectedRows() {
    if (state.selectedRows.length === 0) {
        elements.selectedListBody.innerHTML = "";
        return;
    }

    elements.selectedListBody.innerHTML = "";
    state.selectedRows.forEach((row, index) => {
        const fragment = elements.selectedRowTemplate.content.cloneNode(true);
        const tr = fragment.querySelector("tr");
        tr.dataset.key = row.key;

        fragment.querySelector(".row-num-cell").textContent = String(index + 1);
        fragment.querySelector(".length-cell").textContent = String(row.lengthOfDetailCm);

        const qtyInput = fragment.querySelector(".qty-input");
        qtyInput.value = String(row.qty_needed);
        qtyInput.addEventListener("input", (e) => {
            row.qty_needed = Math.max(1, Math.trunc(Number(e.target.value) || 1));
            updateCalculateState();
        });
        qtyInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                // Find the next row's qty input
                const trElement = qtyInput.closest("tr");
                const nextTr = trElement.nextElementSibling;
                if (nextTr) {
                    const nextInput = nextTr.querySelector(".qty-input");
                    if (nextInput) nextInput.focus();
                } else {
                    // Last row: focus the add-row length input
                    elements.customLengthInput.focus();
                }
            }
        });

        fragment.querySelector(".remove-btn").addEventListener("click", () => {
            state.selectedRows = state.selectedRows.filter(item => item.key !== row.key);
            renderSelectedRows();
            updateCalculateState();
        });

        elements.selectedListBody.appendChild(fragment);
    });
}

/* ── Calculate button state ── */
function updateCalculateState() {
    const ready = state.wasmReady &&
        state.selectedRows.length > 0 &&
        numberValue(elements.materialLengthCm) != null &&
        numberValue(elements.bundleSize) != null;
    elements.calculateButton.disabled = !ready;
}

/* ── Optimize ── */
async function calculate() {
    const stockLength = numberValue(elements.materialLengthCm);
    const bundleSize = numberValue(elements.bundleSize) || 10;
    if (!state.computeCuttingPlan || stockLength == null || state.selectedRows.length === 0) return;

    const input = {
        lengths: state.selectedRows.map(row => row.lengthOfDetailCm),
        quantities: state.selectedRows.map(row => row.qty_needed),
        stock_length: stockLength,
        bundle_size: bundleSize
    };

    try {
        const result = state.computeCuttingPlan(input);
        renderResults(result, stockLength);

        // Auto-scroll to results exactly after the browser has completed the next layout reflow and repaint
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const rect = elements.resultsSection.getBoundingClientRect();
                if (rect.top > 0) {
                    elements.resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
                }
            });
        });
    } catch (err) {
        console.error(err);
        elements.resultList.innerHTML = `<p class="meta-line status-pill--error">Lỗi: ${err}</p>`;
    }
}

/* ── Render results ── */
function renderResults(result, stockLength = 0) {
    if (!result || !Array.isArray(result.patterns) || result.patterns.length === 0) {
        elements.resultList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="9" y1="3" x2="9" y2="21"></line>
                        <line x1="15" y1="3" x2="15" y2="21"></line>
                        <line x1="3" y1="9" x2="21" y2="9"></line>
                        <line x1="3" y1="15" x2="21" y2="15"></line>
                    </svg>
                </div>
                <h4>Kế hoạch cắt phôi tối ưu</h4>
                <p>Nhập thông tin chiều dài phôi và các chi tiết ở cột bên trái, sau đó nhấn <strong>"Tính Toán"</strong> để xem sơ đồ tối ưu hóa.</p>
            </div>
        `;
        return;
    }

    elements.resultList.innerHTML = "";
    const fragment = elements.resultCardTemplate.content.cloneNode(true);

    fragment.querySelector("h3").textContent = "Kế hoạch cắt đề xuất";

    const exportBtn = fragment.querySelector(".export-btn");
    if (exportBtn) {
        exportBtn.addEventListener("click", () => exportToExcel(result, stockLength));
    }

    // Summary calculation
    let totalBars = 0;
    let totalWaste = 0;
    for (const p of result.patterns) {
        totalBars += p.qty;
        totalWaste += (p.qty * p.waste);
    }

    const meta = fragment.querySelector(".result-meta");
    meta.innerHTML = `
        <strong>${totalBars}</strong> phôi sử dụng &nbsp;·&nbsp; 
        <strong>${totalWaste}</strong> mm dư thừa &nbsp;·&nbsp;
        <strong>${result.percentage_wasted.toFixed(2)}</strong> % dư thừa
    `;

    const list = fragment.querySelector(".pattern-list");
    let patternIndex = 1;

    for (const pattern of result.patterns) {
        const item = document.createElement("li");
        item.className = "pattern-group";

        // Pattern Header: "Pattern 1 × 198"
        const header = document.createElement("div");
        header.className = "pattern-header";
        const secondarySuffix = pattern.is_secondary ? ' <small>(cắt cơ)</small>' : '';
        header.innerHTML = `<strong>Mẫu cắt ${patternIndex++}${secondarySuffix}</strong> <span class="pattern-qty">× ${pattern.qty}</span>`;
        item.appendChild(header);

        const subList = document.createElement("ul");
        subList.className = "pattern-sublist";

        result.lengths.forEach((len, idx) => {
            const count = pattern.counts[idx];
            if (count > 0) {
                const li = document.createElement("li");
                li.textContent = `${len}mm × ${count}`;
                subList.appendChild(li);
            }
        });

        item.appendChild(subList);

        // Footer: Waste and Length info
        const footer = document.createElement("div");
        footer.className = "pattern-footer";
        footer.innerHTML = `
            <span class="waste-tag">dư ${pattern.waste} mm trong ${stockLength} mm</span>
        `;
        item.appendChild(footer);

        list.appendChild(item);
    }

    elements.resultList.appendChild(fragment);
}

/* ── Utilities ── */

function numberValue(input) {
    const v = Number(input.value);
    return (input.value !== "" && Number.isFinite(v)) ? v : null;
}

/* ── Help Modal Handlers ── */
// Help modal removed per request

/* ── Export to Excel Handlers ── */
function exportToExcel(result, stockLength) {
    if (!result || !Array.isArray(result.patterns) || typeof XLSX === "undefined") {
        console.error("XLSX library is not loaded or results are empty.");
        return;
    }

    const rows = [];

    // Summary metadata
    rows.push(["TIÊU ĐỀ", "KẾ HOẠCH CẮT PHÔI TỐI ƯU"]);
    // Insert project name if provided
    const project = elements.projectName && elements.projectName.value ? elements.projectName.value.trim() : "";
    if (project) {
        rows.push(["LỆNH SẢN XUẤT", project]);
    }
    rows.push([]);
    rows.push(["TỔNG HỢP"]);

    let totalBars = 0;
    let totalWaste = 0;
    for (const p of result.patterns) {
        totalBars += p.qty;
        totalWaste += (p.qty * p.waste);
    }

    rows.push(["Tổng số phôi sử dụng", totalBars, "cây phôi"]);
    rows.push(["Tổng lượng dư thừa (hao hụt)", totalWaste, "mm"]);
    rows.push(["Tỷ lệ dư thừa", Number(result.percentage_wasted.toFixed(2)), "%"]);
    rows.push([]);

    // Details header
    rows.push(["CHI TIẾT KẾ HOẠCH CẮT"]);

    const detailHeaders = [
        "Mẫu cắt"
    ];
    result.lengths.forEach(len => {
        detailHeaders.push(`${len} mm`);
    });
    detailHeaders.push("Dư thừa (mm)", "Chiều dài phôi gốc (mm)", "Số lượng phôi");
    rows.push(detailHeaders);

    // Data rows
    let patternIndex = 1;
    for (const pattern of result.patterns) {
        const patternName = `Mẫu cắt ${patternIndex++}${pattern.is_secondary ? ' (cắt cơ)' : ''}`;

        const rowData = [
            patternName
        ];

        result.lengths.forEach((len, idx) => {
            const count = pattern.counts[idx];
            rowData.push(count || 0);
        });

        rowData.push(pattern.waste, stockLength, pattern.qty);
        rows.push(rowData);
    }

    // Create Sheet
    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Create Workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "KeHoachCat");
    const thinBorder = {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } }
    };

    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            const cell = ws[cellAddress];
            if (!cell) continue;

            cell.s = cell.s || {};

            const val = String(cell.v || "").trim();

            // 1. Identify and bold headers
            const isSectionHeader = ["TỔNG HỢP", "CHI TIẾT KẾ HOẠCH CẮT"].includes(val);
            const isTitleLabel = (C === 0 && ["TIÊU ĐỀ", "LỆNH SẢN XUẤT", "LSX", "DỰ ÁN"].includes(val));

            let isDetailsHeader = false;
            if (R > 0) {
                const firstCellInRow = ws[XLSX.utils.encode_cell({ r: R, c: 0 })];
                if (firstCellInRow && String(firstCellInRow.v || "").trim() === "Mẫu cắt") {
                    isDetailsHeader = true;
                }
            }

            if (isSectionHeader || isTitleLabel || isDetailsHeader) {
                cell.s.font = { bold: true };
            }

            // 2. Identify tables and apply borders
            let inSummaryTable = false;
            let summaryHeaderRow = -1;
            for (let r = 0; r <= range.e.r; ++r) {
                const c = ws[XLSX.utils.encode_cell({ r: r, c: 0 })];
                if (c && String(c.v || "").trim() === "TỔNG HỢP") {
                    summaryHeaderRow = r;
                    break;
                }
            }
            if (summaryHeaderRow !== -1 && R > summaryHeaderRow && R <= summaryHeaderRow + 3) {
                inSummaryTable = true;
            }

            let inDetailsTable = false;
            let detailsHeaderRow = -1;
            for (let r = 0; r <= range.e.r; ++r) {
                const c = ws[XLSX.utils.encode_cell({ r: r, c: 0 })];
                if (c && String(c.v || "").trim() === "Mẫu cắt") {
                    detailsHeaderRow = r;
                    break;
                }
            }
            if (detailsHeaderRow !== -1 && R >= detailsHeaderRow && R <= range.e.r) {
                inDetailsTable = true;
            }

            if (inSummaryTable || inDetailsTable) {
                cell.s.border = thinBorder;

                // Alignment inside tables
                if (C === 0) {
                    cell.s.alignment = { horizontal: "left", vertical: "center" };
                } else {
                    cell.s.alignment = { horizontal: "center", vertical: "center" };
                }
            }
        }
    }

    // Format column widths for readability dynamically
    const colWidths = [
        { wch: 22 } // Mẫu cắt
    ];
    result.lengths.forEach(() => {
        colWidths.push({ wch: 15 }); // Unique length columns
    });
    colWidths.push(
        { wch: 18 }, // Dư thừa
        { wch: 25 }, // Chiều dài phôi gốc
        { wch: 20 }  // Số lượng phôi
    );
    ws["!cols"] = colWidths;

    // Trigger download
    const fileName = `KeHoachCat_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
}