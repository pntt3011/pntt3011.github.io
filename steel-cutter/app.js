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
        matchCount: document.getElementById("matchCount"),
        orderNameMaterialSelect: document.getElementById("orderNameMaterialSelect"),
        lengthOfBoxCm: document.getElementById("lengthOfBoxCm"),
        widthOfBoxCm: document.getElementById("widthOfBoxCm"),
        materialLengthCm: document.getElementById("materialLengthCm"),
        bundleSize: document.getElementById("bundleSize"),
        lengthSelect: document.getElementById("lengthSelect"),
        addRowQtyInput: document.getElementById("addRowQtyInput"),
        addComponentButton: document.getElementById("addComponentButton"),
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

    const orders = uniqueSorted(state.records.map(r => r.order_name));
    setOptions(elements.orderNameMaterialSelect, [option("Select Order…", ""), ...orders.map(v => option(v, v))]);
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
    const count = state.filteredRecords.length;
    elements.matchCount.textContent = `${count} matching components`;
}

function syncAddRowOptions() {
    if (state.filteredRecords.length === 0) {
        setOptions(elements.lengthSelect, [option("Length…", "")], true);
        elements.addRowQtyInput.value = "";
        elements.addRowQtyInput.disabled = true;
        elements.addComponentButton.disabled = true;
        return;
    }

    const lengths = unique(state.filteredRecords.map(r => Number(r.lengthOfDetailCm)));
    setOptions(elements.lengthSelect, [option("Length…", ""), ...lengths.map(v => option(String(v), String(v)))], false);
    
    // Auto-select if only 1
    if (lengths.length === 1) {
        elements.lengthSelect.value = String(lengths[0]);
    } else {
        elements.lengthSelect.value = "";
    }
    syncAddRow();
}

function syncAddRow() {
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

function addSelectedLength() {
    const len = numberValue(elements.lengthSelect);
    const qty = numberValue(elements.addRowQtyInput);
    if (len == null || qty == null || qty < 1) return;

    const key = String(len);
    if (state.selectedRows.some(row => row.key === key)) {
        highlightRow(key);
        resetPicker();
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
    } catch (err) {
        console.error(err);
        elements.resultList.innerHTML = `<p class="meta-line status-pill--error">Error: ${err}</p>`;
    }
}

/* ── Render results ── */
function renderResults(result, stockLength = 0) {
    if (!result || !Array.isArray(result.patterns) || result.patterns.length === 0) {
        elements.resultList.innerHTML = '<p class="meta-line">No result yet.</p>';
        return;
    }

    elements.resultList.innerHTML = "";
    const fragment = elements.resultCardTemplate.content.cloneNode(true);

    fragment.querySelector("h3").textContent = "Recommended plan";

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
        const secondarySuffix = pattern.is_secondary ? ' <small>(secondary)</small>' : '';
        header.innerHTML = `<strong>Pattern ${patternIndex++}${secondarySuffix}</strong> <span class="pattern-qty">× ${pattern.qty}</span>`;
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
            <span class="waste-tag">waste ${pattern.waste} mm of ${stockLength} mm</span>
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