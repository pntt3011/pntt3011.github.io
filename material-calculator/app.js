import initWasm, { compute_cutting_plan_numeric } from "../shared/lib/pkg/steel_cutting_wasm.js";

const WASTE_ALERT_PCT = 1.5;

const state = {
    wasmReady: false,
    file: null,
    workbook: null,
    parsedCache: null,    // raw per-unit data from one-time parse
    validation: [],
    materials: [],
    plans: [],
    products: [],
    productConfigs: {},   // { [sheetName]: { qty, enabled } }
    powderCoating: [],
    order_name: null,
};

const elements = {};
const numberFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const areaFormatter = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    elements.resultsPanelTitle = document.getElementById("resultsPanelTitle");
    elements.productListSection = document.getElementById("productListSection");
    elements.productList = document.getElementById("productList");
    elements.productCount = document.getElementById("productCount");
    elements.calculateButton = document.getElementById("calculateButton");
}

async function init() {
    try {
        await initWasm();
        state.wasmReady = true;
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

    elements.calculateButton.addEventListener("click", () => {
        if (!state.workbook) return;
        runCalculation();
    });
}

async function handleFile(file) {
    if (!isExcelFile(file)) {
        setStatus(elements.appStatus, "error", "File không hợp lệ");
        renderErrorState("Vui lòng chọn file Excel có phần mở rộng .xlsx, .xls hoặc .xlsm.");
        return;
    }

    state.file = file;
    state.workbook = null;
    state.parsedCache = null;
    state.materials = [];
    state.plans = [];
    state.validation = [];
    state.products = [];
    state.productConfigs = {};
    state.powderCoating = [];
    setExportEnabled(false);
    elements.productList.innerHTML = "";
    elements.productCount.textContent = "";
    elements.productListSection.hidden = true;
    elements.calculateButton.disabled = true;
    renderEmptyState("Đang đọc workbook", "Hệ thống đang gom dữ liệu BOM.");

    try {
        if (!window.XLSX) throw new Error("SheetJS XLSX is not available.");
        const buffer = await file.arrayBuffer();
        state.workbook = window.XLSX.read(buffer, { type: 'array', cellDates: false });

        // Parse once — cache raw per-unit data
        state.parsedCache = window.BomParser.parseWorkbook(state.workbook, { includeValidation: true });
        state.validation = state.parsedCache.validation ?? [];
        state.order_name = state.parsedCache.order_name ?? null;

        // One config entry per sheet (sheetName is the unique key)
        for (const sheet of state.parsedCache.sheets) {
            state.productConfigs[sheet.sheetName] = { qty: sheet.parsedQty ?? 0, enabled: true };
        }

        runCalculation();
    } catch (error) {
        console.error(error);
        setStatus(elements.appStatus, "error", "Xử lý thất bại");
        setExportEnabled(false);
        renderErrorState("Không thể phân tích file Excel.", error?.message || String(error));
    }
}

function runCalculation() {
    if (!state.parsedCache) return;

    const allGrouped = new Map();
    const products = [];
    const powderCoatingMap = new Map();

    for (const sheet of state.parsedCache.sheets) {
        const cfg = state.productConfigs[sheet.sheetName];
        const currentQty = cfg ? cfg.qty : (sheet.parsedQty ?? 0);
        const enabled = cfg ? cfg.enabled : true;

        products.push({
            sheetName: sheet.sheetName,
            code: sheet.code,
            name: sheet.name,
            qty: currentQty,
            parsedQty: sheet.parsedQty,
            manufacturedWeight: sheet.weightPerUnit,
            manufacturedArea: sheet.areaPerUnit,
            manufacturedVolume: sheet.volumePerUnit,
        });

        if (!enabled || !currentQty) continue;

        // Scale per-unit material quantities by current qty and merge
        for (const [key, matData] of sheet.materials) {
            if (!allGrouped.has(key)) {
                allGrouped.set(key, {
                    box_width: matData.box_width, box_length: matData.box_length,
                    type: matData.type, shape: matData.shape, thickness: matData.thickness,
                    usageMap: new Map()
                });
            }
            const grouped = allGrouped.get(key);
            for (const [length, { qtyPerUnit, productCodes }] of matData.usages) {
                const totalQty = Math.round(qtyPerUnit * currentQty);
                if (totalQty <= 0) continue;
                const existing = grouped.usageMap.get(length);
                if (!existing) {
                    grouped.usageMap.set(length, { qty: totalQty, productCodes: new Set(productCodes) });
                } else {
                    existing.qty += totalQty;
                    for (const c of productCodes) existing.productCodes.add(c);
                }
            }
        }

        // Scale per-unit powder coating area
        for (const { code, areaPerUnit } of sheet.powderCoating) {
            powderCoatingMap.set(code, (powderCoatingMap.get(code) || 0) + areaPerUnit * currentQty);
        }
    }

    // Flatten grouped map to final material array
    const steelMaterials = Array.from(allGrouped.values()).map(item => ({
        box_width: item.box_width, box_length: item.box_length,
        type: item.type, shape: item.shape, thickness: item.thickness,
        usage: Array.from(item.usageMap.entries())
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .map(([length, { qty, productCodes }]) => ({
                length, qty, productCodes: Array.from(productCodes)
            }))
    }));

    state.products = products;
    state.powderCoating = Array.from(powderCoatingMap.entries())
        .map(([code, area]) => ({ code, area }))
        .sort((a, b) => a.code.localeCompare(b.code));
    state.materials = sortMaterials(steelMaterials);
    state.plans = state.materials.map(m => computeMaterialPlan(m));

    renderProducts(state.products);
    renderPlans(state.plans);
    setExportEnabled(state.plans.length > 0);
    elements.calculateButton.disabled = false;
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

    const STOCK_LENGTH = 5950;
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

// ── Product list ──────────────────────────────────────────────────────────────

function renderProducts(products) {
    if (!products.length) {
        elements.productList.innerHTML = "";
        elements.productListSection.hidden = true;
        return;
    }

    elements.productListSection.hidden = false;
    elements.productCount.textContent = `${products.length} sản phẩm`;
    elements.productList.innerHTML = "";

    const fragment = document.createDocumentFragment();

    for (const product of products) {
        const cfg = state.productConfigs[product.sheetName] || { qty: product.qty ?? 0, enabled: true };

        const item = document.createElement("div");
        item.className = "product-item" + (cfg.enabled ? "" : " product-item--disabled");

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "product-checkbox";
        checkbox.checked = cfg.enabled;
        checkbox.addEventListener("change", () => {
            state.productConfigs[product.sheetName] = { ...cfg, enabled: checkbox.checked };
            item.classList.toggle("product-item--disabled", !checkbox.checked);
        });

        const info = document.createElement("div");
        info.className = "product-info";

        const nameEl = document.createElement("div");
        nameEl.className = "product-name";
        nameEl.textContent = product.name;

        const metaEl = document.createElement("div");
        metaEl.className = "product-meta";
        metaEl.textContent = product.code;

        info.appendChild(nameEl);
        info.appendChild(metaEl);

        const qtyControl = document.createElement("div");
        qtyControl.className = "product-qty-control";

        const qtyLabel = document.createElement("span");
        qtyLabel.className = "product-qty-label";
        qtyLabel.textContent = "SL:";

        const qtyInput = document.createElement("input");
        qtyInput.type = "number";
        qtyInput.className = "product-qty-input";
        qtyInput.min = "0";
        qtyInput.step = "1";
        qtyInput.value = cfg.qty;
        qtyInput.addEventListener("change", () => {
            const newQty = Math.max(0, Math.trunc(Number(qtyInput.value) || 0));
            qtyInput.value = newQty;
            state.productConfigs[product.sheetName] = { ...cfg, qty: newQty };
        });

        qtyControl.appendChild(qtyLabel);
        qtyControl.appendChild(qtyInput);

        item.appendChild(checkbox);
        item.appendChild(info);
        item.appendChild(qtyControl);
        fragment.appendChild(item);
    }

    elements.productList.appendChild(fragment);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function computeTotalStats(products) {
    let totalWeight = 0;
    let totalArea = 0;
    let totalVolume = 0;

    for (const p of products) {
        const cfg = state.productConfigs[p.sheetName];
        const currentQty = cfg ? cfg.qty : p.qty;
        const enabled = cfg ? cfg.enabled : true;
        if (!enabled || !currentQty) continue;
        totalWeight += p.manufacturedWeight * currentQty;
        totalArea += p.manufacturedArea * currentQty;
        totalVolume += (p.manufacturedVolume || 0) * currentQty;
    }

    return { totalWeight, totalArea, totalVolume };
}

function buildStatCardsRow(products) {
    const { totalWeight, totalArea, totalVolume } = computeTotalStats(products);
    const row = document.createElement("div");
    row.className = "summary-stats";

    const cards = [
        { label: "Trọng lượng SX", value: areaFormatter.format(totalWeight), unit: "kg" },
        { label: "Diện tích SX", value: areaFormatter.format(totalArea), unit: "m²" },
        { label: "Thể tích SX", value: areaFormatter.format(totalVolume), unit: "m³" },
    ];

    for (const card of cards) {
        const el = document.createElement("div");
        el.className = "summary-stat-card";
        const labelEl = document.createElement("span");
        labelEl.className = "summary-stat-label";
        labelEl.textContent = card.label;
        const valueEl = document.createElement("strong");
        valueEl.className = "summary-stat-value";
        valueEl.textContent = card.value;
        const unitEl = document.createElement("span");
        unitEl.className = "summary-stat-unit";
        unitEl.textContent = card.unit;
        el.appendChild(labelEl);
        el.appendChild(valueEl);
        el.appendChild(unitEl);
        row.appendChild(el);
    }

    return row;
}

// ── Cutting plans ─────────────────────────────────────────────────────────────

function makeCollapsible(titleText, buildBody, defaultOpen = true) {
    const details = document.createElement("details");
    details.className = "results-collapsible";
    details.open = defaultOpen;

    const summary = document.createElement("summary");
    summary.className = "results-collapsible-header";
    summary.innerHTML = `
        <span class="toggle-icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
        </span>`;
    const titleEl = document.createElement("span");
    titleEl.textContent = titleText;
    summary.appendChild(titleEl);
    details.appendChild(summary);

    const body = document.createElement("div");
    body.className = "results-collapsible-body";
    buildBody(body);
    details.appendChild(body);

    return details;
}

function renderPlans(plans) {
    if (elements.resultsPanelTitle) {
        elements.resultsPanelTitle.textContent = state.order_name
            ? `Thông tin lệnh sản xuất ${state.order_name}`
            : "Thông tin lệnh sản xuất";
    }

    elements.resultsList.innerHTML = "";
    const fragment = document.createDocumentFragment();

    // Stat cards — scrolls with content
    fragment.appendChild(buildStatCardsRow(state.products));

    // Cutting plans collapsible
    fragment.appendChild(makeCollapsible("Kế hoạch cắt phôi", (body) => {
        if (!plans.length) {
            const empty = document.createElement("p");
            empty.className = "results-section-empty";
            empty.textContent = "Không tìm thấy nhóm vật liệu nào đủ dữ liệu.";
            body.appendChild(empty);
            return;
        }

        const sortedPlans = plans.slice().sort((a, b) =>
            materialLabel(a.material).localeCompare(materialLabel(b.material), "vi", { sensitivity: "base" })
        );

        sortedPlans.forEach((plan) => {
            const isAlert = !plan.error && plan.result?.percentage_wasted >= WASTE_ALERT_PCT;

            const detail = document.createElement("details");
            detail.className = "material-details" + (isAlert ? " material-details--alert" : "");

            const summary = document.createElement("summary");
            summary.appendChild(buildSummaryText(plan));
            summary.appendChild(buildSummaryBadges(plan, isAlert));
            detail.appendChild(summary);

            const bodyEl = document.createElement("div");
            bodyEl.className = "material-body";
            if (plan.error) {
                bodyEl.appendChild(buildErrorState(plan.error));
            } else {
                bodyEl.appendChild(buildSourceBlock(plan));
                bodyEl.appendChild(buildPatternBlock(plan));
            }
            detail.appendChild(bodyEl);

            body.appendChild(detail);
        });
    }, false));

    // Powder coating collapsible
    fragment.appendChild(makeCollapsible("Yêu cầu sơn", (body) => {
        body.appendChild(buildPowderCoatingContent(state.powderCoating));
    }, false));

    elements.resultsList.appendChild(fragment);
}

function setExportEnabled(enabled) {
    if (!elements.exportButton) return;
    elements.exportButton.disabled = !enabled;
}

function buildSummaryText(plan) {
    const wrapper = document.createElement("div");
    wrapper.className = "summary-left";

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

function buildSummaryBadges(plan, isAlert) {
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

        const badge = document.createElement("span");
        badge.className = "waste-badge" + (isAlert ? " waste-badge--alert" : " waste-badge--ok");

        badge.appendChild(document.createTextNode("Cần "));
        badge.appendChild(stockQty);
        badge.appendChild(document.createTextNode(" thanh, dư "));
        badge.appendChild(wastePct);
        badge.appendChild(document.createTextNode("%"));

        badges.appendChild(badge);
    }

    return badges;
}

// ── Source block ──────────────────────────────────────────────────────────────

function buildSourceBlock(plan) {
    const block = document.createElement("section");
    block.className = "source-block";

    const title = document.createElement("div");
    title.className = "block-title";
    title.textContent = "Số lượng cần cắt";

    const chips = document.createElement("div");
    chips.className = "chip-row";

    for (const usage of plan.material.usage || []) {
        const length = numberOrNull(usage.length);
        const qty = numberOrNull(usage.qty);
        if (length == null || qty == null || qty <= 0) continue;

        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = `${formatNumber(length)} mm × ${formatNumber(qty)}`;
        chips.appendChild(chip);
    }

    block.appendChild(title);
    block.appendChild(chips);
    return block;
}

// ── Pattern block ─────────────────────────────────────────────────────────────

function buildPatternBlock(plan) {
    const block = document.createElement("section");
    block.className = "pattern-block";

    const title = document.createElement("div");
    title.className = "block-title";
    title.textContent = "Kế hoạch cắt chi tiết";

    const list = document.createElement("ul");
    list.className = "pattern-list";

    const patterns = Array.isArray(plan.result.patterns) ? plan.result.patterns : [];
    const lengths = Array.isArray(plan.result.lengths) ? plan.result.lengths : [];

    // Build length → productCodes lookup from usage
    const lengthToProductCodes = new Map();
    for (const usage of plan.material.usage || []) {
        lengthToProductCodes.set(Number(usage.length), usage.productCodes || []);
    }

    patterns.forEach((pattern) => {
        const patternWastePct = plan.input.stock_length > 0
            ? (pattern.waste / plan.input.stock_length) * 100
            : 0;
        const patternAlert = patternWastePct >= WASTE_ALERT_PCT;

        // Collect product codes that use any length present in this pattern
        const patternCodes = new Set();
        lengths.forEach((length, i) => {
            const count = Number(pattern.counts?.[i] || 0);
            if (count > 0) {
                const codes = lengthToProductCodes.get(Number(length)) || [];
                codes.forEach(c => patternCodes.add(c));
            }
        });

        const item = document.createElement("li");
        item.className = "pattern-item" + (patternAlert ? " pattern-item--alert" : "");

        const head = document.createElement("div");
        head.className = "pattern-head";

        const name = document.createElement("div");
        name.className = "pattern-name";

        const codesText = Array.from(patternCodes).join(" · ");
        name.textContent = codesText || "—";

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
            const li = document.createElement("li");
            li.textContent = `${formatNumber(length)} mm × ${formatNumber(count)}`;
            chipRow.appendChild(li);
        });

        const foot = document.createElement("div");
        foot.className = "pattern-foot";

        const waste = document.createElement("span");
        waste.className = "waste-tag" + (patternAlert ? " waste-tag--alert" : "");
        waste.textContent = `dư ${formatNumber(pattern.waste)} mm / ${formatNumber(plan.input.stock_length)} mm`;

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

// ── Powder coating ────────────────────────────────────────────────────────────

function buildPowderCoatingContent(powderCoating) {
    if (!powderCoating.length) {
        const empty = document.createElement("p");
        empty.className = "results-section-empty";
        empty.textContent = "Không tìm thấy dữ liệu mã màu trong file.";
        return empty;
    }

    const table = document.createElement("table");
    table.className = "coating-table";

    const thead = document.createElement("thead");
    thead.innerHTML = `<tr><th>Mã màu</th><th>Diện tích (m²)</th></tr>`;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const { code, area } of powderCoating) {
        const tr = document.createElement("tr");
        const tdCode = document.createElement("td");
        tdCode.textContent = code;
        const tdArea = document.createElement("td");
        tdArea.textContent = areaFormatter.format(area);
        tr.appendChild(tdCode);
        tr.appendChild(tdArea);
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    return table;
}

// ── Excel export ──────────────────────────────────────────────────────────────

function exportExcel() {
    if (!Array.isArray(state.plans) || !state.plans.length || typeof XLSX === "undefined") return;

    const rawOrder = String(state.order_name ?? '').trim();
    const safeOrder = rawOrder
        ? rawOrder.replace(/[^0-9A-Za-z]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120)
        : '';
    const fileName = safeOrder ? `VatTu_${safeOrder}.xlsx` : `KeHoachCat.xlsx`;
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
    const summaryTitleRows = [];
    const summaryTableHeaderRows = [];

    // ── Title ──────────────────────────────────────────────────────────────
    summaryTitleRows.push(summaryRows.length);
    summaryRows.push([state.order_name ? "LSX " + state.order_name : "Lệnh sản xuất"]);
    summaryRows.push([]);

    // ── Manufactured stats ─────────────────────────────────────────────────
    summaryTitleRows.push(summaryRows.length);
    summaryRows.push(["THÔNG TIN SẢN XUẤT"]);
    const { totalWeight, totalArea, totalVolume } = computeTotalStats(state.products);
    summaryRows.push(["Trọng lượng SX", Number(totalWeight.toFixed(2)), "kg"]);
    summaryRows.push(["Diện tích SX", Number(totalArea.toFixed(2)), "m²"]);
    summaryRows.push(["Thể tích SX", Number(totalVolume.toFixed(4)), "m³"]);
    summaryRows.push([]);

    // ── Product list ───────────────────────────────────────────────────────
    summaryTitleRows.push(summaryRows.length);
    summaryRows.push(["DANH SÁCH SẢN PHẨM"]);
    summaryTableHeaderRows.push(summaryRows.length);
    summaryRows.push(["Tên sản phẩm", "Mã", "Số lượng"]);
    for (const p of state.products) {
        const cfg = state.productConfigs[p.sheetName];
        const qty = cfg ? cfg.qty : p.qty;
        summaryRows.push([p.name, p.code, qty]);
    }
    summaryRows.push([]);

    // ── Powder coating ─────────────────────────────────────────────────────
    summaryTitleRows.push(summaryRows.length);
    summaryRows.push(["YÊU CẦU SƠN"]);
    summaryTableHeaderRows.push(summaryRows.length);
    summaryRows.push(["Mã màu", "Diện tích (m²)"]);
    for (const { code, area } of state.powderCoating) {
        summaryRows.push([code, Number(area.toFixed(2))]);
    }
    if (!state.powderCoating.length) summaryRows.push(["—", ""]);
    summaryRows.push([]);

    // ── Cutting summary ────────────────────────────────────────────────────
    summaryTitleRows.push(summaryRows.length);
    summaryRows.push(["TỔNG HỢP CẮT PHÔI"]);
    summaryRows.push(["Số nhóm vật liệu", state.plans.length]);
    summaryRows.push(["Chiều dài vật liệu", 5950, "mm"]);

    let totalBars = 0, totalWaste = 0;
    for (const plan of state.plans) {
        if (!plan.result) continue;
        totalBars += Number(plan.result.stock_qty || 0);
        totalWaste += Number(plan.result.total_waste || 0);
    }
    summaryRows.push(["Tổng số thanh vật liệu sử dụng", totalBars, "cây phôi"]);
    summaryRows.push(["Tổng lượng dư thừa", totalWaste, "mm"]);
    summaryRows.push([]);

    const detailHeaderRow = summaryRows.length;
    summaryTitleRows.push(detailHeaderRow);
    summaryRows.push(["CHI TIẾT THEO NHÓM VẬT LIỆU"]);
    summaryTableHeaderRows.push(summaryRows.length);
    summaryRows.push(["Vật liệu", "Số nhóm chiều dài cần cắt", "Số chi tiết", "Số thanh", "Tổng dư thừa (mm)", "Tỷ lệ dư (%)"]);

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

    const detailRows = [];
    const detailTitleRows = [];
    const detailHeaderRows = [];
    const detailMerges = [];

    detailRows.push(["CHI TIẾT MẪU CẮT"]);
    detailTitleRows.push(0);
    detailRows.push([]);

    let currentRow = detailRows.length;
    let maxLengthCols = 0;

    for (const plan of state.plans) {
        if (!plan.result || !Array.isArray(plan.result.patterns)) continue;

        const materialLengths = Array.isArray(plan.result.lengths)
            ? Array.from(new Set(plan.result.lengths.map(Number))).sort((a, b) => a - b)
            : [];
        maxLengthCols = Math.max(maxLengthCols, materialLengths.length);

        detailTitleRows.push(currentRow);
        detailRows.push([materialLabel(plan.material)]);
        const totalCols = 3 + materialLengths.length + 2;
        detailMerges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: totalCols - 1 } });
        currentRow++;

        detailHeaderRows.push(currentRow);
        detailRows.push(["Vật liệu", "Mã sản phẩm", "Số lượng", ...materialLengths.map(l => `${l} mm`), "Dư thừa (mm)", "Dài vật tư (mm)"]);
        currentRow++;

        // Required qty per length row
        const lengthToQty = new Map();
        for (const usage of plan.material.usage || []) {
            lengthToQty.set(Math.trunc(Number(usage.length)), Number(usage.qty) || 0);
        }
        const requiredRow = [
            materialLabel(plan.material),
            "Số lượng cần cắt",
            plan.requiredTotal,
            ...materialLengths.map(l => lengthToQty.get(l) || 0),
            "",
            "",
        ];
        detailRows.push(requiredRow);
        currentRow++;

        plan.result.patterns.forEach((pattern) => {
            // Collect product codes for this pattern
            const lengthToProductCodes = new Map();
            for (const usage of plan.material.usage || []) {
                lengthToProductCodes.set(Number(usage.length), usage.productCodes || []);
            }
            const patternCodes = new Set();
            materialLengths.forEach((length, i) => {
                const idx = plan.result.lengths.findIndex(l => Number(l) === Number(length));
                if (idx >= 0 && Number(pattern.counts?.[idx] || 0) > 0) {
                    (lengthToProductCodes.get(Number(length)) || []).forEach(c => patternCodes.add(c));
                }
            });

            const row = [
                materialLabel(plan.material),
                Array.from(patternCodes).join(", ") || "—",
                pattern.qty,
            ];

            materialLengths.forEach((length) => {
                const patternIndex = Array.isArray(plan.result.lengths)
                    ? plan.result.lengths.findIndex(l => Number(l) === Number(length))
                    : -1;
                const count = patternIndex >= 0 ? Number(pattern.counts?.[patternIndex] || 0) : 0;
                row.push(count || 0);
            });

            row.push(pattern.waste, plan.input.stock_length);
            detailRows.push(row);
            currentRow++;
        });

        detailRows.push([]);
        currentRow++;
    }

    const detailSheet = XLSX.utils.aoa_to_sheet(detailRows);
    XLSX.utils.book_append_sheet(workbook, detailSheet, "ChiTiet");

    applyWorkbookStyles(summarySheet, {
        titleRows: summaryTitleRows,
        tableHeaderRows: summaryTableHeaderRows,
        mergeRanges: [],
        columnWidths: [28, 18, 14, 14, 18, 14],
        sectionFill, headerFill, thinBorder,
    });

    applyWorkbookStyles(detailSheet, {
        titleRows: detailTitleRows,
        tableHeaderRows: detailHeaderRows,
        mergeRanges: detailMerges,
        columnWidths: [24, 22, 12, ...Array(maxLengthCols).fill(12), 16, 14],
        sectionFill, headerFill, thinBorder,
    });

    XLSX.writeFile(workbook, fileName);
}

function applyWorkbookStyles(sheet, { titleRows, tableHeaderRows, mergeRanges, columnWidths, sectionFill, headerFill, thinBorder }) {
    if (mergeRanges && mergeRanges.length) sheet["!merges"] = mergeRanges;

    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const computedCols = [];
    for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex++) {
        let maxLen = 0;
        for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex++) {
            const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
            const cell = sheet[address];
            if (!cell) continue;
            const value = String(cell.v || "");
            for (const line of value.split(/\r?\n/)) {
                if (line.length > maxLen) maxLen = line.length;
            }
        }
        const providedIndex = colIndex - range.s.c;
        const minProvided = Array.isArray(columnWidths) && columnWidths[providedIndex] != null ? Number(columnWidths[providedIndex]) : 0;
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
            if (tableHeaderRows.includes(rowIndex) || ["TỔNG HỢP", "CHI TIẾT THEO NHÓM VẬT LIỆU", "CHI TIẾT MẪU CẮT"].includes(value)) {
                cell.s.font = { bold: true };
                cell.s.fill = headerFill;
            }
            const shouldBorder = rowIndex >= 2 || tableHeaderRows.includes(rowIndex);
            if (shouldBorder) {
                cell.s.border = thinBorder;
                cell.s.alignment = { horizontal: colIndex === 0 ? "left" : "center", vertical: "center" };
            }
        }
    }
}

// ── State helpers ─────────────────────────────────────────────────────────────

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
