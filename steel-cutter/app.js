import initWasm, { compute_cutting_plan_numeric } from './lib/pkg/steel_cutting_wasm.js';



/* ── DOM refs ── */
let elements = {};

/* ── State ── */
const state = {
    records: [],
    filteredRecords: [],
    selectedRows: [],
    wasmReady: false,
    computeCuttingPlan: null,
};

const DATA_URL = "./data/cutting_components.json";

// Boot logic
async function boot() {
    // 1. Initialize elements (only after DOM is ready)
    elements = {
        datasetStatus: document.getElementById("datasetStatus"),
        orderNameMaterialSelect: document.getElementById("orderNameMaterialSelect"),
        lengthOfBoxCm: document.getElementById("lengthOfBoxCm"),
        widthOfBoxCm: document.getElementById("widthOfBoxCm"),
        materialLengthCm: document.getElementById("materialLengthCm"),
        bundleSize: document.getElementById("bundleSize"),
        lengthSelect: document.getElementById("lengthSelect"),
        customLengthInput: document.getElementById("customLengthInput"),
        customModeCheckbox: document.getElementById("customModeCheckbox"),
        addRowQtyInput: document.getElementById("addRowQtyInput"),
        addComponentButton: document.getElementById("addComponentButton"),
        selectedListBody: document.getElementById("selectedListBody"),
        calculateButton: document.getElementById("calculateButton"),
        resultList: document.getElementById("resultList"),
        resultsSection: document.getElementById("resultsSection"),
        helpButton: document.getElementById("helpButton"),
        helpModal: document.getElementById("helpModal"),
        closeModalButton: document.getElementById("closeModalButton"),
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
    await loadData();
    await loadWasm();
    setStatus("ready", "Sẵn sàng");
    refreshSelectors();
    populateAllMatchingComponents();
    renderResults([]);
}

async function loadWasm() {
    await initWasm();
    state.computeCuttingPlan = compute_cutting_plan_numeric;
    state.wasmReady = true;
}

/* ── Events ── */
function bindEvents() {
    elements.orderNameMaterialSelect.addEventListener("change", () => {
        refreshSelectors();
        populateAllMatchingComponents();
        renderResults([]);
    });

    // Material selects
    [elements.lengthOfBoxCm, elements.widthOfBoxCm].forEach((el) => {
        el.addEventListener("change", () => {
            refreshSelectors();
            populateAllMatchingComponents();
            renderResults([]);
        });
    });

    elements.lengthSelect.addEventListener("change", () => {
        syncAddRow();
    });

    elements.addComponentButton.addEventListener("click", () => {
        addSelectedLength();
    });

    elements.customModeCheckbox.addEventListener("change", toggleCustomMode);
    elements.customLengthInput.addEventListener("input", syncCustomAddRow);
    elements.addRowQtyInput.addEventListener("input", () => {
        if (elements.customModeCheckbox.checked) {
            syncCustomAddRow();
        }
    });

    // Calculate
    elements.calculateButton.addEventListener("click", calculate);

    // Stock-length input
    elements.materialLengthCm.addEventListener("input", updateCalculateState);
    elements.bundleSize.addEventListener("input", updateCalculateState);

    // Help Modal events
    elements.helpButton.addEventListener("click", openHelpModal);
    elements.closeModalButton.addEventListener("click", closeHelpModal);
    elements.helpModal.addEventListener("click", (e) => {
        if (e.target === elements.helpModal) closeHelpModal();
    });
    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && elements.helpModal.classList.contains("active")) {
            closeHelpModal();
        }
    });
}

/* ── Data loading ── */
async function loadData() {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`Unable to load ${DATA_URL}`);
    state.records = await response.json();
    if (!Array.isArray(state.records)) throw new Error("cutting_components.json must contain an array");

    const orders = uniqueSorted(state.records.map(r => r.order_name));
    setOptions(elements.orderNameMaterialSelect, [option("Chọn LSX…", ""), ...orders.map(v => option(v, v))]);
}

/* ── Status ── */
function setStatus(kind, text) {
    elements.datasetStatus.className = `status-pill status-pill--${kind}`;
    elements.datasetStatus.textContent = text;
}

/* ── Cascade selects ── */
function refreshSelectors() {
    const orderName = elements.orderNameMaterialSelect.value;
    const length = numberValue(elements.lengthOfBoxCm);
    const width = numberValue(elements.widthOfBoxCm);

    if (!orderName) {
        setOptions(elements.lengthOfBoxCm, [option("…", "")], true);
        setOptions(elements.widthOfBoxCm, [option("…", "")], true);
        state.filteredRecords = [];
        updateMatchCount();
        syncAddRowOptions();
        return;
    }

    const orderRecords = state.records.filter(r => r.order_name === orderName);

    // Length is filtered by order
    const availableLengths = unique(orderRecords.map(r => Number(r.lengthOfBoxCm)));
    setOptions(elements.lengthOfBoxCm, availableLengths.map(v => option(String(v), String(v))), false);

    // Preserve selected length if still valid, otherwise default to first available
    if (length != null && availableLengths.includes(length)) {
        elements.lengthOfBoxCm.value = String(length);
    } else if (availableLengths.length > 0) {
        elements.lengthOfBoxCm.value = String(availableLengths[0]);
    }

    const newLength = numberValue(elements.lengthOfBoxCm);

    // Width is filtered by order + length
    if (newLength != null) {
        const availableWidths = unique(
            orderRecords.filter(r => Number(r.lengthOfBoxCm) === newLength).map(r => Number(r.widthOfBoxCm))
        );
        setOptions(elements.widthOfBoxCm, availableWidths.map(v => option(String(v), String(v))), false);

        // Preserve selected width if still valid, otherwise default to first available
        if (width != null && availableWidths.includes(width)) {
            elements.widthOfBoxCm.value = String(width);
        } else if (availableWidths.length > 0) {
            elements.widthOfBoxCm.value = String(availableWidths[0]);
        }
    } else {
        setOptions(elements.widthOfBoxCm, [option("…", "")], true);
    }

    // Recompute filtered records
    const finalL = numberValue(elements.lengthOfBoxCm);
    const finalW = numberValue(elements.widthOfBoxCm);

    if (orderName && finalL != null && finalW != null) {
        state.filteredRecords = orderRecords.filter(r =>
            Number(r.lengthOfBoxCm) === finalL && Number(r.widthOfBoxCm) === finalW
        );
    } else {
        state.filteredRecords = [];
    }

    updateMatchCount();
    syncAddRowOptions();
}

function updateMatchCount() {
    // Match count element removed
}

function syncAddRowOptions() {
    if (state.filteredRecords.length === 0) {
        setOptions(elements.lengthSelect, [option("Chiều dài…", "")], true);
        if (!elements.customModeCheckbox.checked) {
            elements.addRowQtyInput.value = "";
            elements.addRowQtyInput.disabled = true;
            elements.addComponentButton.disabled = true;
        }
        return;
    }

    const lengths = unique(state.filteredRecords.map(r => Number(r.lengthOfDetailCm)));
    setOptions(elements.lengthSelect, [option("Chiều dài…", ""), ...lengths.map(v => option(String(v), String(v)))], false);

    // Auto-select if only 1
    if (lengths.length === 1) {
        elements.lengthSelect.value = String(lengths[0]);
    } else {
        elements.lengthSelect.value = "";
    }

    if (!elements.customModeCheckbox.checked) {
        syncAddRow();
    }
}

function syncAddRow() {
    if (elements.customModeCheckbox.checked) return;

    const len = numberValue(elements.lengthSelect);
    if (len == null) {
        elements.addRowQtyInput.value = "";
        elements.addRowQtyInput.disabled = true;
        elements.addComponentButton.disabled = true;
        return;
    }

    let sumQty = 0;
    for (const r of state.filteredRecords) {
        if (Number(r.lengthOfDetailCm) === len) {
            sumQty += Number(r.qty_needed);
        }
    }

    elements.addRowQtyInput.value = String(sumQty);
    elements.addRowQtyInput.disabled = false;
    elements.addComponentButton.disabled = false;
}

function resetPicker() {
    elements.lengthSelect.value = "";
    syncAddRow();
}

function toggleCustomMode() {
    const isCustom = elements.customModeCheckbox.checked;
    if (isCustom) {
        elements.lengthSelect.style.display = "none";
        elements.customLengthInput.style.display = "";
        elements.customLengthInput.value = "";
        elements.addRowQtyInput.value = "";
        elements.addRowQtyInput.disabled = false;
        elements.addComponentButton.disabled = true;
        elements.customLengthInput.focus();
    } else {
        elements.lengthSelect.style.display = "";
        elements.customLengthInput.style.display = "none";
        syncAddRowOptions();
    }
}

function syncCustomAddRow() {
    const len = numberValue(elements.customLengthInput);
    const qty = numberValue(elements.addRowQtyInput);
    if (len != null && len > 0 && qty != null && qty > 0) {
        elements.addComponentButton.disabled = false;
    } else {
        elements.addComponentButton.disabled = true;
    }
}

function addSelectedLength() {
    const isCustom = elements.customModeCheckbox.checked;
    const len = isCustom ? numberValue(elements.customLengthInput) : numberValue(elements.lengthSelect);
    const qty = numberValue(elements.addRowQtyInput);
    if (len == null || qty == null || qty < 1) return;

    const key = String(len);
    if (state.selectedRows.some(row => row.key === key)) {
        highlightRow(key);
        if (isCustom) {
            elements.customLengthInput.value = "";
            elements.addRowQtyInput.value = "";
            elements.addComponentButton.disabled = true;
            elements.customLengthInput.focus();
        } else {
            resetPicker();
        }
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

    if (isCustom) {
        elements.customLengthInput.value = "";
        elements.addRowQtyInput.value = "";
        elements.addComponentButton.disabled = true;
        elements.customLengthInput.focus();
    } else {
        resetPicker();
    }
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
        elements.resultList.innerHTML = '<p class="meta-line">Chưa có kết quả.</p>';
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

function populateAllMatchingComponents() {
    const grouped = {};
    for (const record of state.filteredRecords) {
        const len = Number(record.lengthOfDetailCm);
        const qty = Number(record.qty_needed);
        grouped[len] = (grouped[len] || 0) + qty;
    }

    state.selectedRows = Object.keys(grouped).map(len => ({
        key: String(len),
        lengthOfDetailCm: Number(len),
        qty_needed: grouped[len],
    })).sort((a, b) => b.lengthOfDetailCm - a.lengthOfDetailCm);

    renderSelectedRows();
    updateCalculateState();
}

/* ── Utilities ── */

function option(label, value) {
    const el = document.createElement("option");
    el.textContent = label;
    el.value = value;
    return el;
}

function setOptions(select, options, disabled = false) {
    select.replaceChildren(...options);
    select.disabled = disabled;
}

function numberValue(input) {
    const v = Number(input.value);
    return (input.value !== "" && Number.isFinite(v)) ? v : null;
}

function unique(values) {
    return [...new Set(values.filter(Number.isFinite))].sort((a, b) => a - b);
}

function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "en"));
}

/* ── Help Modal Handlers ── */
function openHelpModal() {
    elements.helpModal.classList.add("active");
    document.body.style.overflow = "hidden"; // Prevent scrolling behind modal
}

function closeHelpModal() {
    elements.helpModal.classList.remove("active");
    document.body.style.overflow = ""; // Re-enable scrolling
}

/* ── Export to Excel Handlers ── */
function exportToExcel(result, stockLength) {
    if (!result || !Array.isArray(result.patterns) || typeof XLSX === "undefined") {
        console.error("XLSX library is not loaded or results are empty.");
        return;
    }

    const rows = [];

    // Summary metadata
    rows.push(["TIÊU ĐỀ", "KẾ HOẠCH CẮT PHÔI TỐI ƯU"]);
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
    const fileName = `KeHoachCat_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
}