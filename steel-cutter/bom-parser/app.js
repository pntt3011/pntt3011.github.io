import initWasm, { compute_cutting_plan_numeric } from "../lib/pkg/steel_cutting_wasm.js";

const state = {
    wasmReady: false,
    file: null,
    validation: [],
    materials: [],
    plans: [],
};

const elements = {};
const numberFormatter = new Intl.NumberFormat("vi-VN");

function boot() {
    cacheElements();
    bindEvents();
    init().catch((error) => {
        console.error(error);
        setStatus(elements.appStatus, "error", "Lỗi khởi động");
        renderErrorState(`Không thể khởi tạo bộ máy tính toán: ${error.message}`);
    });
}

function cacheElements() {
    elements.appStatus = document.getElementById("appStatus");
    elements.dropzone = document.getElementById("dropzone");
    elements.fileInput = document.getElementById("fileInput");
    elements.resultsList = document.getElementById("resultsList");
    elements.exportButton = document.getElementById("exportButton");
    elements.browseButton = elements.dropzone.querySelector(".browse-button");
    elements.resultsPanelTitle = document.querySelector('.results-card .panel-title h2');
}

async function init() {
    try {
        await initWasm();
        state.wasmReady = true;
        // show loaded state
        setStatus(elements.appStatus, "ready", "Sẵn sàng");
        setExportEnabled(false);
    } catch (err) {
        setStatus(elements.appStatus, "error", "Lỗi");
        throw err;
    }
}

function bindEvents() {
    elements.dropzone.addEventListener("click", (event) => {
        if (event.target === elements.fileInput) return;
        elements.fileInput.click();
    });

    elements.dropzone.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            elements.fileInput.click();
        }
    });

    elements.browseButton.addEventListener("click", (event) => {
        event.stopPropagation();
        elements.fileInput.click();
    });

    elements.exportButton.addEventListener("click", exportExcel);

    elements.fileInput.addEventListener("change", () => {
        if (elements.fileInput.files && elements.fileInput.files[0]) {
            handleFile(elements.fileInput.files[0]);
        }
    });

    elements.dropzone.addEventListener("dragover", (event) => {
        event.preventDefault();
        elements.dropzone.classList.add("is-dragover");
    });

    elements.dropzone.addEventListener("dragleave", () => {
        elements.dropzone.classList.remove("is-dragover");
    });

    elements.dropzone.addEventListener("drop", (event) => {
        event.preventDefault();
        elements.dropzone.classList.remove("is-dragover");
        const file = event.dataTransfer?.files?.[0];
        if (file) handleFile(file);
    });
}

async function handleFile(file) {
    if (!isExcelFile(file)) {
        setStatus(elements.appStatus, "error", "File không hợp lệ");
        renderErrorState("Vui lòng chọn file Excel có phần mở rộng .xlsx, .xls hoặc .xlsm.");
        return;
    }

    state.file = file;
    state.materials = [];
    state.plans = [];
    state.validation = [];
    setExportEnabled(false);
    renderEmptyState("Đang đọc workbook", "Hệ thống đang gom dữ liệu BOM và chuẩn bị tính kế hoạch cắt.");

    try {
        const parser = window.bom_parse || window.parseBomFile || (window.BomParser && window.BomParser.parseBomFile);
        if (typeof parser !== "function") {
            throw new Error("BOM parser script is not available.");
        }

        const parsed = await parser(file, { includeValidation: true });
        state.validation = Array.isArray(parsed.validation) ? parsed.validation : [];
        state.order_name = parsed?.order_name ?? null;
        state.materials = sortMaterials(Array.isArray(parsed.steel_material) ? parsed.steel_material : []);
        state.plans = state.materials.map((material) => computeMaterialPlan(material));


        renderPlans(state.plans);
        setExportEnabled(state.plans.length > 0);


        const successCount = state.plans.filter((plan) => !plan.error).length;
    } catch (error) {
        console.error(error);
        setStatus(elements.appStatus, "error", "Xử lý thất bại");
        setExportEnabled(false);

        renderErrorState("Không thể phân tích file Excel.", error?.message || String(error));
    }
}

function isExcelFile(file) {
    const name = String(file?.name || "").toLowerCase();
    return name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".xlsm");
}

function sortMaterials(materials) {
    return materials.slice().sort((left, right) => {
        const leftStock = numberOrNull(left.box_length);
        const rightStock = numberOrNull(right.box_length);
        if (leftStock !== rightStock) {
            return (rightStock ?? -Infinity) - (leftStock ?? -Infinity);
        }

        return materialLabel(left).localeCompare(materialLabel(right), "vi", { sensitivity: "base" });
    });
}

function computeMaterialPlan(material) {
    const lengths = [];
    const quantities = [];

    for (const usage of material.usage || []) {
        const length = numberOrNull(usage.length);
        const qty = numberOrNull(usage.qty);
        if (length == null || qty == null || qty <= 0) continue;
        lengths.push(Math.trunc(length));
        quantities.push(Math.trunc(qty));
    }

    // always use fixed stock length per user request
    const STOCK_LENGTH = 5950;

    // determine a max_pattern_waste based on largest requested piece length
    // heuristic: allow 80% of the largest requested piece length as waste,
    // but never less than the Rust default (600)
    const WASTE_FRACTION = 0.8;
    const DEFAULT_MAX_PATTERN_WASTE = 600;
    const maxInputLength = lengths.length ? Math.max(...lengths.map(Number)) : 0;
    const computedMaxPatternWaste = Math.ceil(WASTE_FRACTION * maxInputLength);
    const finalMaxPatternWaste = Math.max(DEFAULT_MAX_PATTERN_WASTE, computedMaxPatternWaste);

    const input = {
        lengths,
        quantities,
        stock_length: Math.trunc(STOCK_LENGTH),
        bundle_size: 1,
        max_pattern_waste: finalMaxPatternWaste,
    };

    let result = null;
    let error = null;

    if (!lengths.length) {
        error = `${materialLabel(material)} không có chi tiết hợp lệ.`;
    } else {
        try {
            result = compute_cutting_plan_numeric(input);
        } catch (caught) {
            error = caught?.message || String(caught);
        }
    }

    return {
        material,
        input,
        result,
        error,
        sourceCount: material.usage?.length || 0,
        requiredTotal: quantities.reduce((sum, qty) => sum + qty, 0),
    };
}

function renderPlans(plans) {
    // update panel title to include order name when available
    if (elements.resultsPanelTitle) {
        elements.resultsPanelTitle.textContent = state.order_name ? `Kế hoạch cắt ${state.order_name}` : "Kế hoạch cắt";
    }

    elements.resultsList.innerHTML = "";

    if (!plans.length) {
        renderEmptyState("Không tìm thấy nhóm vật liệu", "Workbook hợp lệ nhưng không có dòng BOM nào đủ dữ liệu để tính kế hoạch cắt.");
        return;
    }

    const fragment = document.createDocumentFragment();

    const sortedPlans = plans.slice().sort((left, right) =>
        materialLabel(left.material).localeCompare(materialLabel(right.material), "vi", { sensitivity: "base" })
    );

    sortedPlans.forEach((plan, index) => {
        const detail = document.createElement("details");
        detail.className = "material-details";

        const summary = document.createElement("summary");
        summary.appendChild(buildSummaryText(plan));
        summary.appendChild(buildSummaryBadges(plan));
        detail.appendChild(summary);

        const body = document.createElement("div");
        body.className = "material-body";

        body.appendChild(buildSourceBlock(plan));
        if (plan.error) {
            body.appendChild(buildErrorState(plan.error));
        } else {
            body.appendChild(buildPatternBlock(plan));
        }

        detail.appendChild(body);
        fragment.appendChild(detail);
    });

    elements.resultsList.appendChild(fragment);
}

function setExportEnabled(enabled) {
    if (!elements.exportButton) return;
    elements.exportButton.disabled = !enabled;
}

function buildSummaryText(plan) {
    const wrapper = document.createElement("div");
    wrapper.className = "summary-left";
    // toggle icon (collapsed/expanded)
    const toggle = document.createElement("span");
    toggle.className = "toggle-icon";
    toggle.setAttribute("aria-hidden", "true");
    toggle.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
    `;

    const title = document.createElement("div");
    title.className = "material-title";
    title.textContent = materialLabel(plan.material);

    wrapper.appendChild(toggle);
    wrapper.appendChild(title);
    return wrapper;
}

function buildSummaryBadges(plan) {
    const badges = document.createElement("div");
    badges.className = "summary-badges summary-badges--text";

    if (plan.error) {
        badges.textContent = plan.error;
    } else {
        const stockQty = document.createElement("strong");
        stockQty.className = "summary-number";
        stockQty.textContent = formatNumber(plan.result.stock_qty);

        const wastePct = document.createElement("strong");
        wastePct.className = "summary-number";
        wastePct.textContent = plan.result.percentage_wasted.toFixed(2);

        badges.appendChild(stockQty);
        badges.appendChild(document.createTextNode(" phôi sử dụng   ·  "));
        badges.appendChild(wastePct);
        badges.appendChild(document.createTextNode("% dư thừa"));
    }

    return badges;
}

function exportExcel() {
    if (!Array.isArray(state.plans) || !state.plans.length || typeof XLSX === "undefined") {
        return;
    }

    const rawOrder = String(state.order_name ?? '').trim();
    const safeOrder = rawOrder
        ? rawOrder
            .replace(/[^0-9A-Za-z]/g, '_') // replace any non-alphanumeric with underscore
            .replace(/_+/g, '_') // collapse multiple underscores
            .replace(/^_+|_+$/g, '') // trim leading/trailing underscores
            .slice(0, 120)
        : '';
    const fileName = safeOrder ? `KeHoachCat_${safeOrder}.xlsx` : `KeHoachCat.xlsx`;
    const workbook = XLSX.utils.book_new();
    const thinBorder = {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
    };
    const sectionFill = { patternType: "solid", fgColor: { rgb: "E2E8F0" } };
    const headerFill = { patternType: "solid", fgColor: { rgb: "F8FAFC" } };

    const summaryRows = [];
    const titleRow = 0;
    const orderRow = summaryRows.length;
    if (state.order_name) {
        summaryRows.push(["LSX " + state.order_name]);
    } else {
        summaryRows.push(["Lệnh sản xuất"]);
    }

    // blank/separator row
    summaryRows.push([]);

    // summary header
    const summaryHeaderRow = summaryRows.length;
    summaryRows.push(["TỔNG HỢP"]);
    summaryRows.push(["Số loại vật liệu", state.plans.length]);
    summaryRows.push(["Chiều dài phôi gốc", 5950, "mm"]);

    let totalBars = 0;
    let totalWaste = 0;
    for (const plan of state.plans) {
        if (!plan.result) continue;
        totalBars += Number(plan.result.stock_qty || 0);
        totalWaste += Number(plan.result.total_waste || 0);
    }

    summaryRows.push(["Tổng số phôi sử dụng", totalBars, "cây phôi"]);
    summaryRows.push(["Tổng lượng dư thừa", totalWaste, "mm"]);
    summaryRows.push([]);

    const detailHeaderRow = summaryRows.length;
    summaryRows.push(["CHI TIẾT THEO NHÓM VẬT LIỆU"]);
    summaryRows.push(["Vật liệu", "Số dòng BOM", "Số chi tiết", "Số phôi", "Tổng dư thừa (mm)", "Tỷ lệ dư (%)"]);

    for (const plan of state.plans) {
        summaryRows.push([
            materialLabel(plan.material),
            plan.sourceCount,
            plan.requiredTotal,
            plan.result ? plan.result.stock_qty : "",
            plan.result ? plan.result.total_waste : "",
            plan.result ? Number(plan.result.percentage_wasted.toFixed(2)) : "",
        ]);
    }

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(workbook, summarySheet, "TongHop");

    const allLengths = Array.from(
        new Set(
            state.plans.flatMap((plan) => Array.isArray(plan.result?.lengths) ? plan.result.lengths : [])
        )
    ).sort((left, right) => Number(left) - Number(right));

    // Build detail sheet as separate tables per material, showing only lengths used by that material
    const detailRows = [];
    const detailTitleRows = [];
    const detailHeaderRows = [];
    const detailMerges = [];

    // overall sheet title
    detailRows.push(["CHI TIẾT MẪU CẮT"]);
    detailTitleRows.push(0);
    // blank row after title
    detailRows.push([]);

    let currentRow = detailRows.length; // zero-based

    // compute max number of length columns across materials to help set column widths later
    let maxLengthCols = 0;

    for (const plan of state.plans) {
        if (!plan.result || !Array.isArray(plan.result.patterns)) continue;

        // material-specific lengths (sorted, unique)
        const materialLengths = Array.isArray(plan.result.lengths) ? Array.from(new Set(plan.result.lengths.map(Number))).sort((a, b) => Number(a) - Number(b)) : [];
        maxLengthCols = Math.max(maxLengthCols, materialLengths.length);

        // material title row
        detailTitleRows.push(currentRow);
        detailRows.push([materialLabel(plan.material)]);

        const totalCols = 3 + materialLengths.length + 2; // base + lengths + trailing
        detailMerges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: totalCols - 1 } });
        currentRow++;

        // header for this material
        detailHeaderRows.push(currentRow);
        const header = ["Vật liệu", "Mẫu cắt", "Số lượng", ...materialLengths.map((length) => `${length} mm`), "Dư thừa (mm)", "Dài phôi (mm)"];
        detailRows.push(header);
        currentRow++;

        // patterns
        plan.result.patterns.forEach((pattern, index) => {
            const row = [
                materialLabel(plan.material),
                `Mẫu cắt ${index + 1}${pattern.is_secondary ? " (cắt cơ)" : ""}`,
                pattern.qty,
            ];

            materialLengths.forEach((length) => {
                const patternIndex = Array.isArray(plan.result.lengths)
                    ? plan.result.lengths.findIndex((item) => Number(item) === Number(length))
                    : -1;
                const count = patternIndex >= 0 ? Number(pattern.counts?.[patternIndex] || 0) : 0;
                row.push(count || 0);
            });

            row.push(pattern.waste, plan.input.stock_length);
            detailRows.push(row);
            currentRow++;
        });

        // blank separator
        detailRows.push([]);
        currentRow++;
    }

    const detailSheet = XLSX.utils.aoa_to_sheet(detailRows);
    XLSX.utils.book_append_sheet(workbook, detailSheet, "ChiTiet");

    applyWorkbookStyles(summarySheet, {
        titleRows: [titleRow, summaryHeaderRow, detailHeaderRow],
        tableHeaderRows: [detailHeaderRow + 1],
        mergeRanges: [],
        columnWidths: [22, 16, 16, 14, 18, 14],
        sectionFill,
        headerFill,
        thinBorder,
    });

    applyWorkbookStyles(detailSheet, {
        titleRows: detailTitleRows,
        tableHeaderRows: detailHeaderRows,
        mergeRanges: [],
        columnWidths: [24, 22, 12, ...Array(maxLengthCols).fill(12), 16, 14],
        sectionFill,
        headerFill,
        thinBorder,
    });

    XLSX.writeFile(workbook, fileName);
}

function applyWorkbookStyles(sheet, { titleRows, tableHeaderRows, mergeRanges, columnWidths, sectionFill, headerFill, thinBorder }) {
    if (mergeRanges && mergeRanges.length) {
        sheet["!merges"] = mergeRanges;
    }

    // compute column widths automatically based on cell contents
    // If `columnWidths` is provided, use it as a minimum width per column.
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const computedCols = [];
    for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex++) {
        let maxLen = 0;
        for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex++) {
            const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
            const cell = sheet[address];
            if (!cell) continue;
            const value = String(cell.v || "");
            const lines = value.split(/\r?\n/);
            for (const line of lines) {
                if (line.length > maxLen) maxLen = line.length;
            }
        }

        const providedIndex = colIndex - range.s.c;
        const minProvided = Array.isArray(columnWidths) && columnWidths[providedIndex] != null ? Number(columnWidths[providedIndex]) : 0;

        // approximate Excel character width: add padding and a small multiplier
        const wch = Math.max(8, Math.ceil(Math.max(maxLen, minProvided) * 1.1) + 2);
        computedCols.push({ wch });
    }

    if (computedCols.length) sheet["!cols"] = computedCols;

    for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex++) {
        for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex++) {
            const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
            const cell = sheet[address];
            if (!cell) continue;

            cell.s = cell.s || {};
            const value = String(cell.v || "").trim();

            if (titleRows.includes(rowIndex)) {
                cell.s.font = { bold: true };
                cell.s.fill = sectionFill;
                cell.s.alignment = { horizontal: "center", vertical: "center" };
            }

            if (tableHeaderRows.includes(rowIndex) || value === "TỔNG HỢP" || value === "CHI TIẾT THEO NHÓM VẬT LIỆU" || value === "CHI TIẾT MẪU CẮT") {
                cell.s.font = { bold: true };
                cell.s.fill = headerFill;
            }

            // start applying borders from the first data row (zero-based index 2)
            const shouldBorder = rowIndex >= 2 || tableHeaderRows.includes(rowIndex);
            if (shouldBorder) {
                cell.s.border = thinBorder;
                cell.s.alignment = {
                    horizontal: colIndex === 0 ? "left" : "center",
                    vertical: "center",
                };
            }
        }
    }
}

function buildStatsGrid(plan) {
    const grid = document.createElement("div");
    grid.className = "material-stats";

    grid.appendChild(buildStatCard("Chiều dài phôi", `${formatNumber(plan.input.stock_length)} mm`));
    grid.appendChild(buildStatCard("Phôi sử dụng", `${formatNumber(plan.result.stock_qty)} cây`));
    grid.appendChild(buildStatCard("Tổng dư thừa", `${formatNumber(plan.result.total_waste)} mm`));
    grid.appendChild(buildStatCard("Tỷ lệ dư", `${plan.result.percentage_wasted.toFixed(2)} %`));

    return grid;
}

function buildStatCard(label, value) {
    const card = document.createElement("div");
    card.className = "stat-card";

    const labelNode = document.createElement("span");
    labelNode.textContent = label;

    const valueNode = document.createElement("strong");
    valueNode.textContent = value;

    card.appendChild(labelNode);
    card.appendChild(valueNode);
    return card;
}

function buildSourceBlock(plan) {
    const block = document.createElement("section");
    block.className = "source-block";

    const title = document.createElement("div");
    title.className = "block-title";
    title.textContent = "Số lượng yêu cầu";

    const chips = document.createElement("div");
    chips.className = "chip-row";

    for (const usage of plan.material.usage || []) {
        const length = numberOrNull(usage.length);
        const qty = numberOrNull(usage.qty);
        if (length == null || qty == null || qty <= 0) continue;

        const chip = document.createElement("span");
        chip.className = "chip";
        chip.innerHTML = `${formatNumber(length)} mm × ${formatNumber(qty)}`;
        chips.appendChild(chip);
    }

    block.appendChild(title);
    block.appendChild(chips);
    return block;
}

function buildPatternBlock(plan) {
    const block = document.createElement("section");
    block.className = "pattern-block";

    const title = document.createElement("div");
    title.className = "block-title";
    title.textContent = "Kế hoạch cắt";

    const list = document.createElement("ul");
    list.className = "pattern-list";

    const patterns = Array.isArray(plan.result.patterns) ? plan.result.patterns : [];
    const lengths = Array.isArray(plan.result.lengths) ? plan.result.lengths : [];

    patterns.forEach((pattern, index) => {
        const item = document.createElement("li");
        item.className = "pattern-item";

        const head = document.createElement("div");
        head.className = "pattern-head";

        const name = document.createElement("div");
        name.className = "pattern-name";
        name.textContent = `Mẫu cắt ${index + 1}`;

        if (pattern.is_secondary) {
            const secondary = document.createElement("small");
            secondary.textContent = "(cắt cơ)";
            name.appendChild(secondary);
        }

        const meta = document.createElement("div");
        meta.className = "pattern-meta";
        meta.innerHTML = `<span class="pattern-qty">× ${formatNumber(pattern.qty)}</span>`;

        head.appendChild(name);
        head.appendChild(meta);

        const chipRow = document.createElement("ul");
        chipRow.className = "pattern-sublist";

        lengths.forEach((length, lengthIndex) => {
            const count = Number(pattern.counts?.[lengthIndex] || 0);
            if (count <= 0) return;

            const item = document.createElement("li");
            item.textContent = `${formatNumber(length)}mm × ${formatNumber(count)}`;
            chipRow.appendChild(item);
        });

        const foot = document.createElement("div");
        foot.className = "pattern-foot";

        const waste = document.createElement("span");
        waste.className = "waste-tag";
        waste.textContent = `dư ${formatNumber(pattern.waste)} mm trong ${formatNumber(plan.input.stock_length)} mm`;

        foot.appendChild(waste);

        item.appendChild(head);
        item.appendChild(chipRow);
        item.appendChild(foot);
        list.appendChild(item);
    });

    block.appendChild(title);
    block.appendChild(list);
    return block;
}

// validation UI removed

function renderEmptyState(title, description) {
    elements.resultsList.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "empty-state empty-state--wide";

    const icon = document.createElement("div");
    icon.className = "empty-state-icon";
    icon.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 4h16v16H4z"></path>
            <path d="M4 9h16"></path>
            <path d="M9 4v16"></path>
        </svg>
    `;

    const heading = document.createElement("h4");
    heading.textContent = title;

    const copy = document.createElement("p");
    copy.textContent = description;

    wrapper.appendChild(icon);
    wrapper.appendChild(heading);
    wrapper.appendChild(copy);
    elements.resultsList.appendChild(wrapper);
}

function renderErrorState(title, detail) {
    elements.resultsList.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "error-state";

    const heading = document.createElement("h4");
    heading.textContent = title;

    const copy = document.createElement("p");
    copy.textContent = "Hãy kiểm tra lại workbook hoặc thử một file khác.";

    wrapper.appendChild(heading);
    wrapper.appendChild(copy);

    if (detail) {
        const detailBox = document.createElement("div");
        detailBox.className = "error-detail";
        detailBox.textContent = detail;
        wrapper.appendChild(detailBox);
    }

    elements.resultsList.appendChild(wrapper);
}

function buildErrorState(message) {
    const wrapper = document.createElement("div");
    wrapper.className = "error-state";

    const heading = document.createElement("h4");
    heading.textContent = "Không thể tính kế hoạch";

    const copy = document.createElement("p");
    copy.textContent = message;

    wrapper.appendChild(heading);
    wrapper.appendChild(copy);
    return wrapper;
}

// file meta UI removed

function setStatus(element, kind, text) {
    element.className = `status-pill status-pill--${kind}`;
    element.textContent = text;
}

function materialLabel(material) {
    const type = material?.type || null;
    const shape = material?.shape || null;
    const boxL = material?.box_length || null;
    const boxW = material?.box_width || null;
    const dim = boxL || boxW ? `${boxL}x${boxW}` : null;
    const thickness = material?.thickness != null ? `${material.thickness} mm` : null;
    const parts = [type, shape, dim, thickness].filter(Boolean);
    return (parts.length ? parts.join(" · ") : "Vật liệu").toLocaleLowerCase("vi");
}

function numberOrNull(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value) {
    const parsed = numberOrNull(value);
    if (parsed == null) return "0";
    return numberFormatter.format(Math.trunc(parsed));
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
} else {
    boot();
}
