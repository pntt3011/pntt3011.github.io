import { buildViewModel } from './viewmodel.js';
import * as Render from './view.js';

let wasmWorker = null;

const state = {
    wasmReady: false,
    parsedCache: null,
    validation: [],
    productConfigs: {},
    partMethods: {},
    viewModel: null,
    pendingPlans: 0,
};

const elements = {};

function boot() {
    cacheElements();
    Render.init(elements);
    bindEvents();
    init().catch(err => {
        console.error(err);
        Render.setStatus(elements.appStatus, 'error', 'Lỗi khởi động');
        Render.renderErrorState(`Không thể khởi tạo bộ máy tính toán: ${err.message}`);
    });
}

function cacheElements() {
    elements.appStatus = document.getElementById('appStatus');
    elements.resultsList = document.getElementById('resultsList');
    elements.exportButton = document.getElementById('exportButton');
    elements.resultsPanelTitle = document.getElementById('resultsPanelTitle');
    elements.productListSection = document.getElementById('productListSection');
    elements.productList = document.getElementById('productList');
    elements.calculateButton = document.getElementById('calculateButton');
}

async function init() {
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
        Render.setStatus(elements.appStatus, 'ready', 'Sẵn sàng');
        setExportEnabled(false);

        await loadData();
    } catch (err) {
        Render.setStatus(elements.appStatus, 'error', 'Lỗi');
        throw err;
    }
}

function bindEvents() {
    elements.exportButton.addEventListener('click', exportExcel);

    elements.calculateButton.addEventListener('click', () => {
        if (!state.parsedCache) return;
        runCalculation();
    });
}

async function loadData() {
    state.parsedCache = null;
    state.validation = [];
    state.productConfigs = {};
    state.partMethods = {};
    state.viewModel = null;
    setExportEnabled(false);

    elements.productList.innerHTML = '';
    elements.productListSection.hidden = true;
    elements.calculateButton.disabled = true;
    Render.renderEmptyState('Đang tải dữ liệu', 'Hệ thống đang gom dữ liệu BOM.');

    try {
        const response = await fetch('./data.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        result.products = result.products.filter(p => p.components?.some(c => c.kind === 'steel'));

        state.parsedCache = result;
        state.validation = result.validation ?? [];

        for (const product of state.parsedCache.products) {
            state.productConfigs[product.id] = { qty: product.qty ?? 0, enabled: false };
        }

        runCalculation();
    } catch (error) {
        console.error(error);
        Render.setStatus(elements.appStatus, 'error', 'Xử lý thất bại');
        setExportEnabled(false);
        Render.renderErrorState('Không thể tải dữ liệu BOM.', error?.message || String(error));
    }
}

function runCalculation() {
    if (!state.parsedCache) return;

    state.optimizationId = (state.optimizationId ?? 0) + 1;
    const runId = state.optimizationId;

    state.viewModel = buildViewModel(state.parsedCache, state.productConfigs, state.partMethods);

    Render.renderProducts(state.viewModel.products, {
        onToggle: (id, enabled) => {
            const cfg = state.productConfigs[id] ?? { qty: 0, enabled: true };
            state.productConfigs[id] = { ...cfg, enabled };
        },
        onQtyChange: (id, qty) => {
            const cfg = state.productConfigs[id] ?? { qty: 0, enabled: true };
            state.productConfigs[id] = { ...cfg, qty };
        },
        onGroupToggle: (ids, enabled) => {
            for (const id of ids) {
                const cfg = state.productConfigs[id] ?? { qty: 0, enabled: true };
                state.productConfigs[id] = { ...cfg, enabled };
            }
        },
        onMethodChange: (key, method) => {
            state.partMethods[key] = method;
        },
    });

    Render.renderResults(state.viewModel, { onExportEnabled: setExportEnabled });
    elements.calculateButton.disabled = false;

    const plans = state.viewModel.plans;
    state.pendingPlans = 0;
    for (let i = 0; i < plans.length; i++) {
        if (!plans[i].input.lengths.length) continue;
        state.pendingPlans++;
        wasmWorker.postMessage({ type: 'computePlan', runId, index: i, input: plans[i].input });
    }
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
    }
}

function handleWorkerError(err) {
    console.error('Worker crashed:', err);
    Render.setStatus(elements.appStatus, 'error', 'Lỗi tính toán');
    Render.renderErrorState('Bộ tính toán gặp lỗi. Vui lòng tải lại trang.', err?.message || String(err));
}

// ── Excel export ───────────────────────────────────────────────────────────────

function exportExcel() {
    const vm = state.viewModel;
    if (!vm || typeof XLSX === 'undefined') return;

    const selectedOrders = Array.from(new Set(
        vm.products
            .filter(p => p.enabled && p.qty > 0)
            .map(p => p.order_name)
            .filter(Boolean)
    ));
    const rawOrder = selectedOrders.join('_');
    const safeOrder = rawOrder
        ? rawOrder.replace(/[^0-9A-Za-z]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120)
        : '';
    const fileName = safeOrder ? `VatTu_${safeOrder}.xlsx` : 'VatTu.xlsx';
    const workbook = XLSX.utils.book_new();
    const thinBorder = {
        top: { style: 'thin', color: { rgb: '000000' } },
        bottom: { style: 'thin', color: { rgb: '000000' } },
        left: { style: 'thin', color: { rgb: '000000' } },
        right: { style: 'thin', color: { rgb: '000000' } },
    };
    const sectionFill = { patternType: 'solid', fgColor: { rgb: 'E2E8F0' } };
    const headerFill = { patternType: 'solid', fgColor: { rgb: 'F8FAFC' } };

    const summaryRows = [];
    const summaryTitleRows = [];
    const summaryTableHeaderRows = [];

    summaryTitleRows.push(summaryRows.length);
    summaryRows.push([selectedOrders.length ? 'LSX ' + selectedOrders.join(', ') : 'Lệnh sản xuất']);
    summaryRows.push([]);

    summaryTitleRows.push(summaryRows.length);
    summaryRows.push(['THÔNG TIN SẢN XUẤT']);
    summaryRows.push(['Trọng lượng sắt', Number(vm.steelWeight.toFixed(2)), 'kg']);
    summaryRows.push(['Diện tích sắt', Number(vm.steelArea.toFixed(2)), 'm²']);
    summaryRows.push(['Trọng lượng nhôm', Number(vm.aluWeight.toFixed(2)), 'kg']);
    summaryRows.push(['Diện tích nhôm', Number(vm.aluArea.toFixed(2)), 'm²']);
    summaryRows.push([]);

    summaryTitleRows.push(summaryRows.length);
    summaryRows.push(['DANH SÁCH SẢN PHẨM']);
    summaryTableHeaderRows.push(summaryRows.length);
    summaryRows.push(['Tên sản phẩm', 'Mã', 'Số lượng']);
    for (const p of vm.products) {
        if (!p.enabled || !(p.qty > 0)) continue;
        summaryRows.push([p.name, p.code, p.qty]);
    }
    summaryRows.push([]);

    summaryTitleRows.push(summaryRows.length);
    summaryRows.push(['TỔNG HỢP CẮT PHÔI']);
    summaryRows.push(['Số nhóm vật liệu', vm.plans.length]);

    let totalBars = 0, totalWaste = 0;
    for (const plan of vm.plans) {
        if (!plan.result) continue;
        totalBars += Number(plan.result.stock_qty || 0);
        totalWaste += Number(plan.result.total_waste || 0);
    }

    summaryRows.push(['Tổng số thanh', totalBars]);
    summaryRows.push(['Tổng lượng dư thừa (mm)', totalWaste]);
    summaryRows.push([]);

    summaryTitleRows.push(summaryRows.length);
    summaryRows.push(['CHI TIẾT THEO NHÓM VẬT LIỆU']);
    summaryTableHeaderRows.push(summaryRows.length);
    summaryRows.push([
        'Vật liệu', 'SL quy cách', 'Số chi tiết',
        'Dài (mm)', 'Số thanh', 'Dư thừa (mm)', 'Tỷ lệ (%)',
    ]);
    const sortedPlans = vm.plans.slice().sort((a, b) =>
        Render.materialLabel(a.material).localeCompare(Render.materialLabel(b.material), 'vi', { sensitivity: 'base' })
    );
    for (const plan of sortedPlans) {
        summaryRows.push([
            Render.materialLabel(plan.material),
            plan.sourceCount,
            plan.requiredTotal,
            plan.displayStockLength ?? plan.input.stock_length,
            plan.result ? plan.result.stock_qty : '',
            plan.result ? plan.result.total_waste : '',
            plan.result ? Number(plan.result.percentage_wasted.toFixed(2)) : '',
        ]);
    }
    summaryRows.push([]);

    if (vm.flatSheetPlans && vm.flatSheetPlans.length) {
        summaryTitleRows.push(summaryRows.length);
        summaryRows.push(['CHI TIẾT SẮT TẤM (LA DẸT)']);
        summaryTableHeaderRows.push(summaryRows.length);
        summaryRows.push([
            'Dày (mm)', 'Tổng diện tích (m²)', 'Khổ tấm (mm)', 'Số tấm',
        ]);
        for (const sheetPlan of vm.flatSheetPlans) {
            summaryRows.push([
                sheetPlan.thickness,
                Number(sheetPlan.totalArea.toFixed(2)),
                `${sheetPlan.sheetWidth}x${sheetPlan.sheetHeight}`,
                sheetPlan.sheetCount,
            ]);
        }
    }

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'TongHop');

    const { rows: detailRows, titleRows: detailTitleRows, headerRows: detailHeaderRows, merges: detailMerges, maxLengthCols } =
        buildDetailRows(vm.plans, 'CHI TIẾT MẪU CẮT');
    const detailSheet = XLSX.utils.aoa_to_sheet(detailRows);
    XLSX.utils.book_append_sheet(workbook, detailSheet, 'ChiTiet');

    applyWorkbookStyles(summarySheet, {
        titleRows: summaryTitleRows,
        tableHeaderRows: summaryTableHeaderRows,
        mergeRanges: [],
        columnWidths: [28, 12, 12, 14, 12, 16, 12],
        sectionFill, headerFill, thinBorder,
    });

    applyWorkbookStyles(detailSheet, {
        titleRows: detailTitleRows,
        tableHeaderRows: detailHeaderRows,
        mergeRanges: detailMerges,
        columnWidths: [24, 22, 12, ...Array(maxLengthCols).fill(12), 16, 14],
        sectionFill, headerFill, thinBorder,
    });

    if (vm.flatSheetPlans && vm.flatSheetPlans.length) {
        const { rows: flatSheetRows, titleRows: flatSheetTitleRows, headerRows: flatSheetHeaderRows, merges: flatSheetMerges } =
            buildFlatSheetRows(vm.flatSheetPlans, 'CHI TIẾT SẮT TẤM (LA DẸT)');
        const flatSheetSheet = XLSX.utils.aoa_to_sheet(flatSheetRows);
        XLSX.utils.book_append_sheet(workbook, flatSheetSheet, 'SatTam');

        applyWorkbookStyles(flatSheetSheet, {
            titleRows: flatSheetTitleRows,
            tableHeaderRows: flatSheetHeaderRows,
            mergeRanges: flatSheetMerges,
            columnWidths: [16, 18, 18, 12],
            sectionFill, headerFill, thinBorder,
        });
    }

    XLSX.writeFile(workbook, fileName);
}

function buildFlatSheetRows(flatSheetPlans, sheetTitle) {
    const rows = [];
    const titleRows = [];
    const headerRows = [];
    const merges = [];

    titleRows.push(rows.length);
    rows.push([sheetTitle]);
    rows.push([]);

    let currentRow = rows.length;

    for (const sheetPlan of flatSheetPlans) {
        titleRows.push(currentRow);
        rows.push([`sắt tấm · ${sheetPlan.thickness} mm · ${sheetPlan.sheetCount} tấm ${sheetPlan.sheetWidth}x${sheetPlan.sheetHeight} mm`]);
        merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 2 } });
        currentRow++;

        headerRows.push(currentRow);
        rows.push(['Rộng (mm)', 'Dài (mm)', 'Số lượng']);
        currentRow++;

        for (const usage of sheetPlan.usage || []) {
            rows.push([usage.box_height, usage.length, usage.qty]);
            currentRow++;
        }

        rows.push([]);
        currentRow++;
    }

    return { rows, titleRows, headerRows, merges };
}

function buildDetailRows(plans, sheetTitle) {
    const rows = [];
    const titleRows = [];
    const headerRows = [];
    const merges = [];
    let maxLengthCols = 0;

    titleRows.push(rows.length);
    rows.push([sheetTitle]);
    rows.push([]);

    let currentRow = rows.length;

    for (const plan of plans) {
        if (!plan.result || !Array.isArray(plan.result.patterns)) continue;

        const materialLengths = Array.isArray(plan.result.lengths)
            ? Array.from(new Set(plan.result.lengths.map(Number))).sort((a, b) => a - b)
            : [];
        maxLengthCols = Math.max(maxLengthCols, materialLengths.length);

        titleRows.push(currentRow);
        rows.push([Render.materialLabel(plan.material)]);
        const totalCols = 3 + materialLengths.length + 2;
        merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: totalCols - 1 } });
        currentRow++;

        headerRows.push(currentRow);
        rows.push(['Vật liệu', 'Mã sản phẩm', 'Số lượng', ...materialLengths.map(l => `${l} mm`), 'Dư thừa (mm)', 'Dài vật tư (mm)']);
        currentRow++;

        const lengthToQty = new Map();
        for (const usage of plan.material.usage || []) {
            lengthToQty.set(Math.trunc(Number(usage.length)), Number(usage.qty) || 0);
        }
        rows.push([
            Render.materialLabel(plan.material),
            'Số lượng cần cắt',
            plan.requiredTotal,
            ...materialLengths.map(l => lengthToQty.get(l) || 0),
            '', '',
        ]);
        currentRow++;

        const lengthToProductCodes = new Map();
        for (const usage of plan.material.usage || []) {
            lengthToProductCodes.set(Number(usage.length), usage.productCodes || []);
        }

        for (const pattern of plan.result.patterns) {
            const patternCodes = new Set();
            materialLengths.forEach(length => {
                const idx = plan.result.lengths.findIndex(l => Number(l) === Number(length));
                if (idx >= 0 && Number(pattern.counts?.[idx] || 0) > 0) {
                    (lengthToProductCodes.get(Number(length)) || []).forEach(({ code }) => patternCodes.add(code));
                }
            });

            const row = [Render.materialLabel(plan.material), Array.from(patternCodes).join(', ') || '—', pattern.qty];
            materialLengths.forEach(length => {
                const patternIndex = plan.result.lengths.findIndex(l => Number(l) === Number(length));
                row.push(patternIndex >= 0 ? Number(pattern.counts?.[patternIndex] || 0) : 0);
            });
            row.push(pattern.waste, plan.displayStockLength ?? plan.input.stock_length);
            rows.push(row);
            currentRow++;
        }

        rows.push([]);
        currentRow++;
    }

    return { rows, titleRows, headerRows, merges, maxLengthCols };
}

function applyWorkbookStyles(sheet, { titleRows, tableHeaderRows, mergeRanges, columnWidths, sectionFill, headerFill, thinBorder }) {
    if (mergeRanges?.length) sheet['!merges'] = mergeRanges;

    const range = XLSX.utils.decode_range(sheet['!ref']);
    const computedCols = [];
    for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex++) {
        let maxLen = 0;
        for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex++) {
            const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
            const cell = sheet[address];
            if (!cell) continue;
            const value = String(cell.v || '');
            for (const line of value.split(/\r?\n/)) {
                if (line.length > maxLen) maxLen = line.length;
            }
        }
        const providedIndex = colIndex - range.s.c;
        const minProvided = Array.isArray(columnWidths) && columnWidths[providedIndex] != null ? Number(columnWidths[providedIndex]) : 0;
        computedCols.push({ wch: Math.max(8, Math.ceil(Math.max(maxLen, minProvided) * 1.1) + 2) });
    }
    if (computedCols.length) sheet['!cols'] = computedCols;

    for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex++) {
        for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex++) {
            const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
            const cell = sheet[address];
            if (!cell) continue;
            cell.s = cell.s || {};
            const value = String(cell.v || '').trim();

            if (titleRows.includes(rowIndex)) {
                cell.s.font = { bold: true };
                cell.s.fill = sectionFill;
                cell.s.alignment = { horizontal: 'center', vertical: 'center' };
            }
            if (tableHeaderRows.includes(rowIndex) || ['TỔNG HỢP', 'CHI TIẾT THEO NHÓM VẬT LIỆU', 'CHI TIẾT MẪU CẮT'].includes(value)) {
                cell.s.font = { bold: true };
                cell.s.fill = headerFill;
            }
            if (rowIndex >= 2 || tableHeaderRows.includes(rowIndex)) {
                cell.s.border = thinBorder;
                cell.s.alignment = { horizontal: colIndex === 0 ? 'left' : 'center', vertical: 'center' };
            }
        }
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function setExportEnabled(enabled) {
    if (!elements.exportButton) return;
    elements.exportButton.disabled = !enabled;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}
