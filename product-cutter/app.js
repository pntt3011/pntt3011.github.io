import { buildViewModel } from './viewmodel.js';
import * as Render from './view.js';

let wasmWorker = null;

const STOCK_DISPLAY_OFFSET = 50;
const WASTE_ALERT_PCT = 1.0;

const state = {
    wasmReady: false,
    products: [],
    selectedCodes: [],
    selections: {},
    viewModel: null,
    pendingPlans: 0,
    optimizationId: 0,
};

const elements = {};

function boot() {
    cacheElements();
    Render.init(elements);
    bindEvents();
    init().catch(err => {
        console.error(err);
        Render.setStatus(elements.appStatus, 'error', 'Lỗi khởi động');
        Render.renderErrorState('Không thể khởi tạo bộ máy tính toán.', err?.message || String(err));
    });
}

function cacheElements() {
    elements.appStatus = document.getElementById('appStatus');
    elements.resultsList = document.getElementById('resultsList');
    elements.productSearch = document.getElementById('productSearch');
    elements.productSelect = document.getElementById('productSelect');
    elements.selectedListSection = document.getElementById('selectedListSection');
    elements.selectedList = document.getElementById('selectedList');
    elements.selectedCount = document.getElementById('selectedCount');
    elements.calculateButton = document.getElementById('calculateButton');
}

async function init() {
    Render.setStatus(elements.appStatus, 'loading', 'Đang tải dữ liệu');

    try {
        wasmWorker = new Worker(new URL('./wasm-worker.js', import.meta.url), { type: 'module' });
        await new Promise((resolve, reject) => {
            wasmWorker.onmessage = ({ data }) => {
                if (data.type === 'ready') resolve();
                else if (data.type === 'initError') reject(new Error(data.message));
            };
            wasmWorker.onerror = err => reject(new Error(err.message));
        });
        wasmWorker.onmessage = handleWorkerMessage;
        wasmWorker.onerror = handleWorkerError;
        state.wasmReady = true;

        state.products = await window.DataParser.loadProducts('./data.xlsx');
        Render.renderProductOptions(state.products);

        Render.setStatus(elements.appStatus, 'ready', 'Sẵn sàng');
        Render.renderEmptyState('Chọn sản phẩm', 'Chọn ít nhất một mã sản phẩm và số lượng, sau đó nhấn Tính toán.');
    } catch (err) {
        Render.setStatus(elements.appStatus, 'error', 'Lỗi');
        throw err;
    }
}

function bindEvents() {
    elements.productSelect.addEventListener('change', () => {
        const selected = Array.from(elements.productSelect.selectedOptions).map(o => o.value);
        for (const code of selected) {
            if (!state.selectedCodes.includes(code)) {
                state.selectedCodes.push(code);
                state.selections[code] = 1;
            }
        }
        elements.productSelect.selectedIndex = -1;
        renderSelected();
    });

    elements.productSearch.addEventListener('input', () => {
        const query = elements.productSearch.value;
        Render.renderProductOptions(filterProducts(state.products, query));
    });

    elements.calculateButton.addEventListener('click', () => {
        runCalculation();
    });
}

function renderSelected() {
    Render.renderSelectedProducts(state.selectedCodes, state.products, state.selections, {
        onQtyChange: (code, qty) => {
            state.selections[code] = qty;
        },
        onRemove: code => {
            state.selectedCodes = state.selectedCodes.filter(c => c !== code);
            delete state.selections[code];
            renderSelected();
        },
    });

    const hasValidSelection = state.selectedCodes.some(code => (state.selections[code] ?? 0) > 0);
    elements.calculateButton.disabled = !hasValidSelection;
}

function filterProducts(products, query) {
    const term = query.trim().toLowerCase();
    if (!term) return products;
    return products.filter(p =>
        p.code.toLowerCase().includes(term) || (p.name && p.name.toLowerCase().includes(term))
    );
}

function runCalculation() {
    if (!state.wasmReady) return;

    state.optimizationId += 1;
    const runId = state.optimizationId;

    state.viewModel = buildViewModel(state.products, state.selections);
    state.viewModel.optimizedPlans = null;

    Render.renderResults(state.viewModel, { onExportEnabled: () => { } });

    const plans = state.viewModel.plans;
    state.pendingPlans = 0;
    for (let i = 0; i < plans.length; i++) {
        if (!plans[i].input.lengths.length) continue;
        state.pendingPlans++;
        wasmWorker.postMessage({ type: 'computePlan', runId, index: i, input: plans[i].input });
    }
    if (state.pendingPlans === 0) checkStartOptimization(runId);
}

function needsOptimization(plan) {
    return !plan.error && plan.result?.percentage_wasted >= WASTE_ALERT_PCT;
}

function handleWorkerMessage({ data }) {
    const { type, runId, index } = data;
    if (runId !== state.optimizationId) return;

    if (type === 'planResult') {
        state.viewModel.plans[index] = {
            ...state.viewModel.plans[index],
            result: data.result,
            error: data.error ?? state.viewModel.plans[index].error,
        };
        state.pendingPlans--;
        Render.refreshCuttingSection(state.viewModel);
        if (state.pendingPlans === 0) checkStartOptimization(runId);

    } else if (type === 'optimalPlanResult') {
        const basePlan = state.viewModel.plans[index];
        const bestStockLength = data.optResult?.best_stock_length ?? basePlan.input.stock_length;
        state.viewModel.optimizedPlans[index] = {
            ...basePlan,
            input: { ...basePlan.input, stock_length: bestStockLength },
            displayStockLength: bestStockLength + STOCK_DISPLAY_OFFSET,
            result: data.optResult?.best_result ?? null,
            error: data.error ?? null,
        };
        Render.refreshCuttingSection(state.viewModel);
    }
}

function handleWorkerError(err) {
    console.error('Worker crashed:', err);
    Render.setStatus(elements.appStatus, 'error', 'Lỗi tính toán');
    Render.renderErrorState('Bộ tính toán gặp lỗi. Vui lòng tải lại trang.', err?.message || String(err));
}

function checkStartOptimization(runId) {
    if (runId !== state.optimizationId) return;
    const plans = state.viewModel?.plans;
    if (!plans?.length) return;

    const optimizedPlans = new Array(plans.length).fill(null);
    state.viewModel.optimizedPlans = optimizedPlans;

    for (let i = 0; i < plans.length; i++) {
        if (needsOptimization(plans[i])) {
            wasmWorker.postMessage({ type: 'computeOptimalPlan', runId, index: i, optInput: plans[i].optInput });
        } else {
            optimizedPlans[i] = plans[i];
        }
    }
    Render.refreshCuttingSection(state.viewModel);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}
