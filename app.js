const elements = {
    datasetStatus: document.getElementById("datasetStatus"),
    matchCount: document.getElementById("matchCount"),
    lengthOfBoxCm: document.getElementById("lengthOfBoxCm"),
    widthOfBoxCm: document.getElementById("widthOfBoxCm"),
    materialLengthCm: document.getElementById("materialLengthCm"),
    orderSelect: document.getElementById("orderSelect"),
    parentSelect: document.getElementById("parentSelect"),
    componentSelect: document.getElementById("componentSelect"),
    componentPreview: document.getElementById("componentPreview"),
    addComponentButton: document.getElementById("addComponentButton"),
    resetSelectionButton: document.getElementById("resetSelectionButton"),
    selectedListBody: document.getElementById("selectedListBody"),
    calculateButton: document.getElementById("calculateButton"),
    resultSummary: document.getElementById("resultSummary"),
    resultList: document.getElementById("resultList"),
    selectedRowTemplate: document.getElementById("selectedRowTemplate"),
    resultCardTemplate: document.getElementById("resultCardTemplate"),
};

import initWasm, { compute_cutting_plan } from './lib/pkg/steel_cutting_wasm.js';

const MAX_PRIMARY_PATTERNS = 6;

const state = {
    records: [],
    filteredRecords: [],
    selectedRows: [],
    wasmReady: false,
    computeCuttingPlan: null,
};

const DATA_URL = "./data/cutting_components.json";

init().catch((error) => {
    setStatus("error", `Failed to initialize: ${error.message}`);
});

async function init() {
    bindEvents();
    await loadData();
    await loadWasm();
    setStatus("ready", "Data and wasm loaded");
    refreshSelectors();
    renderSelectedRows();
    renderResults([]);
}

async function loadWasm() {
    await initWasm();
    state.computeCuttingPlan = compute_cutting_plan;
    state.wasmReady = true;
}

function bindEvents() {
    [elements.lengthOfBoxCm, elements.widthOfBoxCm].forEach((input) => {
        input.addEventListener("input", () => {
            refreshSelectors();
            updateCalculateState();
        });
    });

    [elements.orderSelect, elements.parentSelect, elements.componentSelect].forEach((select, index) => {
        select.addEventListener("change", () => {
            if (index === 0) {
                syncParents();
            } else if (index === 1) {
                syncComponents();
            }
            syncPreview();
        });
    });

    elements.addComponentButton.addEventListener("click", addSelectedComponent);
    elements.resetSelectionButton.addEventListener("click", () => {
        resetPicker();
        syncPreview();
    });
    elements.calculateButton.addEventListener("click", calculate);
    elements.materialLengthCm.addEventListener("input", updateCalculateState);
}

async function loadData() {
    const response = await fetch(DATA_URL);
    if (!response.ok) {
        throw new Error(`Unable to load ${DATA_URL}`);
    }
    state.records = await response.json();
    if (!Array.isArray(state.records)) {
        throw new Error("cutting_components.json must contain an array");
    }
}



function setStatus(kind, text) {
    elements.datasetStatus.className = `status-pill status-pill--${kind}`;
    elements.datasetStatus.textContent = text;
}

function numberValue(input) {
    const value = Number(input.value);
    return Number.isFinite(value) ? value : null;
}

function getBoxKey() {
    return {
        length: numberValue(elements.lengthOfBoxCm),
        width: numberValue(elements.widthOfBoxCm),
    };
}

function refreshSelectors() {
    const { length, width } = getBoxKey();
    if (length == null || width == null) {
        state.filteredRecords = [];
        resetPickerOptions();
        updateMatchCount();
        return;
    }

    state.filteredRecords = state.records.filter((record) => {
        return Number(record.lengthOfBoxCm) === length && Number(record.widthOfBoxCm) === width;
    });

    updateMatchCount();
    populateOrders();
    syncParents();
    syncComponents();
    syncPreview();
}

function updateMatchCount() {
    elements.matchCount.textContent = `${state.filteredRecords.length} matching components`;
}

function resetPickerOptions() {
    setOptions(elements.orderSelect, [option("Choose an order", "")]);
    setOptions(elements.parentSelect, [option("Choose a parent component", "")], true);
    setOptions(elements.componentSelect, [option("Choose a component", "")], true);
}

function populateOrders() {
    const uniqueOrders = uniqueSorted(state.filteredRecords.map((record) => record.order_name));
    setOptions(elements.orderSelect, [option("Choose an order", ""), ...uniqueOrders.map((value) => option(value, value))]);
    elements.orderSelect.disabled = uniqueOrders.length === 0;
}

function syncParents() {
    const orderName = elements.orderSelect.value;
    if (!orderName) {
        setOptions(elements.parentSelect, [option("Choose a parent component", "")], true);
        setOptions(elements.componentSelect, [option("Choose a component", "")], true);
        return;
    }

    const parents = uniqueSorted(
        state.filteredRecords.filter((record) => record.order_name === orderName).map((record) => record.parent_component_name),
    );
    setOptions(elements.parentSelect, [option("Choose a parent component", ""), ...parents.map((value) => option(value, value))]);
    elements.parentSelect.disabled = false;
    if (!parents.includes(elements.parentSelect.value)) {
        elements.parentSelect.value = "";
    }
    syncComponents();
}

function syncComponents() {
    const orderName = elements.orderSelect.value;
    const parentName = elements.parentSelect.value;
    if (!orderName || !parentName) {
        setOptions(elements.componentSelect, [option("Choose a component", "")], true);
        return;
    }

    const components = uniqueSorted(
        state.filteredRecords
            .filter((record) => record.order_name === orderName && record.parent_component_name === parentName)
            .map((record) => record.component_name),
    );
    setOptions(elements.componentSelect, [option("Choose a component", ""), ...components.map((value) => option(value, value))]);
    elements.componentSelect.disabled = false;
    if (!components.includes(elements.componentSelect.value)) {
        elements.componentSelect.value = "";
    }
}

function syncPreview() {
    const record = getSelectedRecord();
    if (!record) {
        elements.componentPreview.innerHTML = "<p>Select a component to preview its length and default quantity.</p>";
        elements.addComponentButton.disabled = true;
        return;
    }

    elements.componentPreview.innerHTML = `
    <strong>${escapeHtml(record.order_name)}</strong><br />
    <span>${escapeHtml(record.parent_component_name)} / ${escapeHtml(record.component_name)}</span><br />
    <span>lengthOfDetailCm: <strong>${record.lengthOfDetailCm}</strong></span><br />
    <span>qty_needed: <strong>${record.qty_needed}</strong></span>
  `;
    elements.addComponentButton.disabled = false;
}

function resetPicker() {
    elements.orderSelect.value = "";
    resetPickerOptions();
}

function getSelectedRecord() {
    const orderName = elements.orderSelect.value;
    const parentName = elements.parentSelect.value;
    const componentName = elements.componentSelect.value;
    if (!orderName || !parentName || !componentName) {
        return null;
    }

    return state.filteredRecords.find((record) => {
        return record.order_name === orderName &&
            record.parent_component_name === parentName &&
            record.component_name === componentName;
    }) ?? null;
}

function addSelectedComponent() {
    const record = getSelectedRecord();
    if (!record) {
        return;
    }

    const key = componentKey(record);
    if (state.selectedRows.some((row) => row.key === key)) {
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
}

function renderSelectedRows() {
    if (state.selectedRows.length === 0) {
        elements.selectedListBody.innerHTML = '<tr class="empty-row"><td colspan="6">No components selected.</td></tr>';
        return;
    }

    elements.selectedListBody.innerHTML = "";
    for (const row of state.selectedRows) {
        const fragment = elements.selectedRowTemplate.content.cloneNode(true);

        fragment.querySelector(".order-cell").textContent = row.order_name;
        fragment.querySelector(".parent-cell").textContent = row.parent_component_name;
        fragment.querySelector(".component-cell").textContent = row.component_name;
        fragment.querySelector(".length-cell").textContent = String(row.lengthOfDetailCm);

        const qtyInput = fragment.querySelector(".qty-input");
        qtyInput.value = String(row.qty_needed);
        qtyInput.addEventListener("input", (event) => {
            row.qty_needed = Math.max(1, Math.trunc(Number(event.target.value) || 1));
            updateCalculateState();
        });

        fragment.querySelector(".remove-button").addEventListener("click", () => {
            state.selectedRows = state.selectedRows.filter((item) => item.key !== row.key);
            renderSelectedRows();
            updateCalculateState();
        });

        elements.selectedListBody.appendChild(fragment);
    }
}

function updateCalculateState() {
    const ready = state.wasmReady && state.selectedRows.length > 0 && numberValue(elements.materialLengthCm) != null;
    elements.calculateButton.disabled = !ready;
}

async function calculate() {
    const stockLength = numberValue(elements.materialLengthCm);
    if (!state.computeCuttingPlan || stockLength == null || state.selectedRows.length === 0) {
        return;
    }

    const items = state.selectedRows.map((row) => ({
        label: `${row.order_name} / ${row.parent_component_name} / ${row.component_name}`,
        length: row.lengthOfDetailCm,
        qty: row.qty_needed,
    }));

    const result = state.computeCuttingPlan(items, stockLength, MAX_PRIMARY_PATTERNS);
    const summaryQty = result?.stock_qty ?? 0;
    const wastePct = Number.isFinite(result?.percentage_wasted) ? result.percentage_wasted : 0;

    elements.resultSummary.textContent = summaryQty > 0
        ? `Recommended stock qty: ${summaryQty} bars, ${wastePct.toFixed(2)}% wasted${result.used_fallback ? " · fallback used" : ""}.`
        : "No stock bars were required for the selected components.";

    renderResults(result, stockLength);
}

function renderResults(result, stockLength = 0) {
    if (!result || !Array.isArray(result.patterns) || result.patterns.length === 0) {
        elements.resultList.innerHTML = '<p class="meta-line">Run Calculate to see cutting patterns.</p>';
        return;
    }

    elements.resultList.innerHTML = "";
    const fragment = elements.resultCardTemplate.content.cloneNode(true);
    const title = fragment.querySelector("h3");
    const meta = fragment.querySelector(".result-meta");
    const list = fragment.querySelector(".pattern-list");

    title.textContent = result.used_fallback ? "Recommended plan with fallback" : "Recommended plan";
    meta.textContent = `${result.stock_qty} bars recommended, ${result.percentage_wasted.toFixed(2)}% wasted`;

    for (const pattern of result.patterns) {
        const item = document.createElement("li");
        const main = document.createElement("strong");
        main.textContent = `${pattern.cuts.join(" + ")} × ${pattern.qty} · waste ${pattern.waste} cm`;
        const detail = document.createElement("span");
        detail.className = "pattern-line";
        detail.textContent = `Used ${pattern.used_length} cm of ${stockLength} cm${pattern.is_fallback ? " · fallback" : ""}`;
        item.append(main, detail);
        list.appendChild(item);
    }

    elements.resultList.appendChild(fragment);
}

function componentKey(record) {
    return [record.order_name, record.parent_component_name, record.component_name, record.lengthOfDetailCm].join("|");
}

function option(label, value) {
    const item = document.createElement("option");
    item.textContent = label;
    item.value = value;
    return item;
}

function setOptions(select, options, disabled = false) {
    select.replaceChildren(...options);
    select.disabled = disabled;
}

function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, "en"));
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}