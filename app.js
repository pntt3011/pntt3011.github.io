import initWasm, { compute_cutting_plan } from './lib/pkg/steel_cutting_wasm.js';

const MAX_PRIMARY_PATTERNS = 4;

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
        matchCount: document.getElementById("matchCount"),
        lengthOfBoxCm: document.getElementById("lengthOfBoxCm"),
        widthOfBoxCm: document.getElementById("widthOfBoxCm"),
        materialLengthCm: document.getElementById("materialLengthCm"),
        bundleSize: document.getElementById("bundleSize"),
        orderSelect: document.getElementById("orderSelect"),
        parentSelect: document.getElementById("parentSelect"),
        componentSelect: document.getElementById("componentSelect"),
        resetSelectionButton: document.getElementById("resetSelectionButton"),
        addRowLength: document.getElementById("addRowLength"),
        addRowQty: document.getElementById("addRowQty"),
        selectedListBody: document.getElementById("selectedListBody"),
        calculateButton: document.getElementById("calculateButton"),
        resultList: document.getElementById("resultList"),
        selectedRowTemplate: document.getElementById("selectedRowTemplate"),
        resultCardTemplate: document.getElementById("resultCardTemplate"),
    };

    // 2. Run app initialization
    try {
        await init();
    } catch (error) {
        console.error("Initialization failed:", error);
        setStatus("error", `Failed to initialize: ${error.message}`);
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
    setStatus("ready", "Ready");
    refreshSelectors();
    populateAllMatchingComponents();
    renderResults([]);
}

async function loadWasm() {
    await initWasm();
    state.computeCuttingPlan = compute_cutting_plan;
    state.wasmReady = true;
}

/* ── Events ── */
function bindEvents() {
    // Material selects
    [elements.lengthOfBoxCm, elements.widthOfBoxCm].forEach((el) => {
        el.addEventListener("change", () => {
            refreshSelectors();
            populateAllMatchingComponents();
            renderResults([]);
        });
    });

    // Order → sync parents
    elements.orderSelect.addEventListener("change", () => {
        syncParents();
        syncPreview();
    });

    // Component (parent) → sync parts
    elements.parentSelect.addEventListener("change", () => {
        syncComponents();
        syncPreview();
    });

    // Part select → add immediately
    elements.componentSelect.addEventListener("change", () => {
        syncPreview();
        if (elements.componentSelect.value) {
            addSelectedComponent();
        }
    });



    // Reset picker
    elements.resetSelectionButton.addEventListener("click", () => {
        resetPicker();
    });

    // Calculate
    elements.calculateButton.addEventListener("click", calculate);

    // Stock-length input
    elements.materialLengthCm.addEventListener("input", updateCalculateState);
    elements.bundleSize.addEventListener("input", updateCalculateState);
}

/* ── Data loading ── */
async function loadData() {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`Unable to load ${DATA_URL}`);
    state.records = await response.json();
    if (!Array.isArray(state.records)) throw new Error("cutting_components.json must contain an array");

    const lengths = unique(state.records.map(r => Number(r.lengthOfBoxCm)));
    const widths = unique(state.records.map(r => Number(r.widthOfBoxCm)));

    setOptions(elements.lengthOfBoxCm, lengths.map(v => option(String(v), String(v))));
    setOptions(elements.widthOfBoxCm, widths.map(v => option(String(v), String(v))));

}

/* ── Status ── */
function setStatus(kind, text) {
    elements.datasetStatus.className = `status-pill status-pill--${kind}`;
    elements.datasetStatus.textContent = text;
}

/* ── Cascade selects ── */
function refreshSelectors() {
    const length = numberValue(elements.lengthOfBoxCm);
    const width = numberValue(elements.widthOfBoxCm);

    // Length always shows all options from records
    const allLengths = unique(state.records.map(r => Number(r.lengthOfBoxCm)));
    setOptions(elements.lengthOfBoxCm, allLengths.map(v => option(String(v), String(v))));
    if (length != null && allLengths.includes(length)) elements.lengthOfBoxCm.value = String(length);

    // Width is filtered by selected length
    if (length != null) {
        const availableWidths = unique(
            state.records.filter(r => Number(r.lengthOfBoxCm) === length).map(r => Number(r.widthOfBoxCm))
        );
        setOptions(elements.widthOfBoxCm, availableWidths.map(v => option(String(v), String(v))));

        // Preserve selected width if still valid, otherwise default to first available
        if (width != null && availableWidths.includes(width)) {
            elements.widthOfBoxCm.value = String(width);
        } else if (availableWidths.length > 0) {
            elements.widthOfBoxCm.value = String(availableWidths[0]);
        }
    }

    // Recompute filtered records
    const l = numberValue(elements.lengthOfBoxCm);
    const w = numberValue(elements.widthOfBoxCm);
    if (l != null && w != null) {
        state.filteredRecords = state.records.filter(r =>
            Number(r.lengthOfBoxCm) === l && Number(r.widthOfBoxCm) === w
        );
    } else {
        state.filteredRecords = [];
    }

    updateMatchCount();
    populateOrders();
    syncParents();
    syncComponents();
}

function updateMatchCount() {
    const l = numberValue(elements.lengthOfBoxCm);
    const w = numberValue(elements.widthOfBoxCm);
    const count = (l != null && w != null) ? state.filteredRecords.length : state.records.length;
    elements.matchCount.textContent = `${count} matching components`;
}

function resetPickerOptions() {
    // Only reset Component and Part — Order stays populated
    setOptions(elements.parentSelect, [option("Component…", "")], true);
    setOptions(elements.componentSelect, [option("Part…", "")], true);
}

function populateOrders() {
    const currentOrder = elements.orderSelect.value;
    const orders = uniqueSorted(state.filteredRecords.map(r => r.order_name));
    setOptions(elements.orderSelect, [option("Order…", ""), ...orders.map(v => option(v, v))]);
    elements.orderSelect.disabled = orders.length === 0;

    if (currentOrder && orders.includes(currentOrder)) {
        elements.orderSelect.value = currentOrder;
    } else {
        elements.orderSelect.value = "";
    }
}

function syncParents() {
    const orderName = elements.orderSelect.value;
    if (!orderName) {
        setOptions(elements.parentSelect, [option("Choose a component", "")], true);
        setOptions(elements.componentSelect, [option("Choose a part", "")], true);
        return;
    }
    const parents = uniqueSorted(
        state.filteredRecords.filter(r => r.order_name === orderName).map(r => r.parent_component_name)
    );
    setOptions(elements.parentSelect, [option("Choose a component", ""), ...parents.map(v => option(v, v))]);
    elements.parentSelect.disabled = false;
    if (!parents.includes(elements.parentSelect.value)) elements.parentSelect.value = "";
    syncComponents();
}

function syncComponents() {
    const orderName = elements.orderSelect.value;
    const parentName = elements.parentSelect.value;
    if (!orderName || !parentName) {
        setOptions(elements.componentSelect, [option("Choose a part", "")], true);
        return;
    }
    const components = uniqueSorted(
        state.filteredRecords
            .filter(r => r.order_name === orderName && r.parent_component_name === parentName)
            .map(r => r.component_name)
    );
    setOptions(elements.componentSelect, [option("Choose a part", ""), ...components.map(v => option(v, v))]);
    elements.componentSelect.disabled = false;
    if (!components.includes(elements.componentSelect.value)) elements.componentSelect.value = "";
}

function syncPreview() {
    const record = getSelectedRecord();
    if (!record) {
        elements.addRowLength.textContent = '—';
        elements.addRowQty.textContent = '—';
        return;
    }
    elements.addRowLength.textContent = String(record.lengthOfDetailCm);
    elements.addRowQty.textContent = String(record.qty_needed);
}

function resetPicker() {
    elements.orderSelect.value = "";   // deselect, but keep options
    resetPickerOptions();              // clears Component + Part only
    syncPreview();
}

/* ── Get selected record ── */
function getSelectedRecord() {
    const orderName = elements.orderSelect.value;
    const parentName = elements.parentSelect.value;
    const componentName = elements.componentSelect.value;
    if (!orderName || !parentName || !componentName) return null;
    return state.filteredRecords.find(r =>
        r.order_name === orderName &&
        r.parent_component_name === parentName &&
        r.component_name === componentName
    ) ?? null;
}

/* ── Add selected component (triggered by + button) ── */
function addSelectedComponent() {
    const record = getSelectedRecord();
    if (!record) return;

    const key = componentKey(record);
    if (state.selectedRows.some(row => row.key === key)) {
        highlightRow(key);
        // Reset Part picker so user can pick next
        elements.componentSelect.value = "";
        setOptions(elements.componentSelect, [option("Part…", "")], true);
        syncPreview();
        return;
    }

    state.selectedRows.push({
        key,
        order_name: record.order_name,
        parent_component_name: record.parent_component_name,
        component_name: record.component_name,
        lengthOfDetailCm: Number(record.lengthOfDetailCm),
        qty_needed: Number(record.qty_needed),
    });

    renderSelectedRows();
    updateCalculateState();

    // Auto-reset picker so user can start next selection immediately
    resetPicker();
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
        fragment.querySelector(".order-cell").textContent = row.order_name;
        fragment.querySelector(".component-cell").textContent = row.parent_component_name;
        fragment.querySelector(".part-cell").textContent = row.component_name;
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

    const items = state.selectedRows.map(row => ({
        label: `${row.order_name} / ${row.parent_component_name} / ${row.component_name}`,
        length: row.lengthOfDetailCm,
        qty: row.qty_needed,
    }));

    const result = state.computeCuttingPlan(items, stockLength, MAX_PRIMARY_PATTERNS, bundleSize);


    renderResults(result, stockLength);
}

/* ── Render results ── */
function renderResults(result, stockLength = 0) {
    if (!result || !Array.isArray(result.patterns) || result.patterns.length === 0) {
        elements.resultList.innerHTML = '<p class="meta-line">No result yet.</p>';
        return;
    }

    elements.resultList.innerHTML = "";
    const fragment = elements.resultCardTemplate.content.cloneNode(true);

    fragment.querySelector("h3").textContent = result.used_fallback ? "Recommended plan (fallback)" : "Recommended plan";

    // Summary calculation
    let totalBars = 0;
    let totalWaste = 0;
    for (const p of result.patterns) {
        totalBars += p.qty;
        totalWaste += (p.qty * p.waste);
    }

    const meta = fragment.querySelector(".result-meta");
    meta.innerHTML = `
        <strong>${totalBars}</strong> bars used &nbsp;·&nbsp; 
        <strong>${totalWaste}</strong> mm waste &nbsp;·&nbsp;
        <strong>${result.percentage_wasted.toFixed(2)}</strong> % waste
    `;

    const list = fragment.querySelector(".pattern-list");
    let patternIndex = 1;

    for (const pattern of result.patterns) {
        const item = document.createElement("li");
        item.className = "pattern-group";

        // Pattern Header: "Pattern 1 × 198"
        const header = document.createElement("div");
        header.className = "pattern-header";
        const secondarySuffix = pattern.is_fallback ? ' <small>(secondary)</small>' : '';
        header.innerHTML = `<strong>Pattern ${patternIndex++}${secondarySuffix}</strong> <span class="pattern-qty">× ${pattern.qty}</span>`;
        item.appendChild(header);

        // Group components in this pattern by label
        const counts = {};
        pattern.cuts.forEach(label => counts[label] = (counts[label] || 0) + 1);

        const subList = document.createElement("ul");
        subList.className = "pattern-sublist";
        Object.keys(counts).forEach(label => {
            const li = document.createElement("li");
            li.textContent = `${label} × ${counts[label]}`;
            subList.appendChild(li);
        });
        item.appendChild(subList);

        // Footer: Waste and Length info
        const footer = document.createElement("div");
        footer.className = "pattern-footer";
        footer.innerHTML = `
            <span class="waste-tag">waste ${pattern.waste} mm of ${stockLength} mm</span>
        `;
        item.appendChild(footer);

        list.appendChild(item);
    }

    elements.resultList.appendChild(fragment);
}

function populateAllMatchingComponents() {
    state.selectedRows = state.filteredRecords.map(record => ({
        key: componentKey(record),
        order_name: record.order_name,
        parent_component_name: record.parent_component_name,
        component_name: record.component_name,
        lengthOfDetailCm: Number(record.lengthOfDetailCm),
        qty_needed: Number(record.qty_needed),
    }));
    renderSelectedRows();
    updateCalculateState();
}

/* ── Utilities ── */
function componentKey(record) {
    return [record.order_name, record.parent_component_name, record.component_name, record.lengthOfDetailCm].join("|");
}

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