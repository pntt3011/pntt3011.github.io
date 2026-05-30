import initWasm from '../shared/lib/pkg/steel_cutting_wasm.js';
import { buildViewModel, computeOptimalMaterialPlan } from './viewmodel.js';
import * as Render from './view.js';

const state = {
    wasmReady: false,
    file: null,
    workbook: null,
    parsedCache: null,
    validation: [],
    productConfigs: {},
    viewModel: null,
};

const elements = {};
const areaFormatter = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    elements.dropzone = document.getElementById('dropzone');
    elements.fileInput = document.getElementById('fileInput');
    elements.resultsList = document.getElementById('resultsList');
    elements.exportButton = document.getElementById('exportButton');
    elements.browseButton = elements.dropzone.querySelector('.browse-button');
    elements.resultsPanelTitle = document.getElementById('resultsPanelTitle');
    elements.productListSection = document.getElementById('productListSection');
    elements.productList = document.getElementById('productList');
    elements.productCount = document.getElementById('productCount');
    elements.calculateButton = document.getElementById('calculateButton');
}

async function init() {
    try {
        await initWasm();
        state.wasmReady = true;
        Render.setStatus(elements.appStatus, 'ready', 'Sẵn sàng');
        setExportEnabled(false);
    } catch (err) {
        Render.setStatus(elements.appStatus, 'error', 'Lỗi');
        throw err;
    }
}

function bindEvents() {
    elements.dropzone.addEventListener('click', event => {
        if (event.target === elements.fileInput) return;
        elements.fileInput.click();
    });

    elements.dropzone.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            elements.fileInput.click();
        }
    });

    elements.browseButton.addEventListener('click', event => {
        event.stopPropagation();
        elements.fileInput.click();
    });

    elements.exportButton.addEventListener('click', exportExcel);

    elements.fileInput.addEventListener('change', () => {
        if (elements.fileInput.files?.[0]) handleFile(elements.fileInput.files[0]);
    });

    elements.dropzone.addEventListener('dragover', event => {
        event.preventDefault();
        elements.dropzone.classList.add('is-dragover');
    });

    elements.dropzone.addEventListener('dragleave', () => {
        elements.dropzone.classList.remove('is-dragover');
    });

    elements.dropzone.addEventListener('drop', event => {
        event.preventDefault();
        elements.dropzone.classList.remove('is-dragover');
        const file = event.dataTransfer?.files?.[0];
        if (file) handleFile(file);
    });

    elements.calculateButton.addEventListener('click', () => {
        if (!state.parsedCache) return;
        runCalculation();
    });
}

async function handleFile(file) {
    if (!isExcelFile(file)) {
        Render.setStatus(elements.appStatus, 'error', 'File không hợp lệ');
        Render.renderErrorState('Vui lòng chọn file Excel có phần mở rộng .xlsx, .xls hoặc .xlsm.');
        return;
    }

    state.file = file;
    state.workbook = null;
    state.parsedCache = null;
    state.validation = [];
    state.productConfigs = {};
    state.viewModel = null;
    setExportEnabled(false);

    elements.productList.innerHTML = '';
    elements.productCount.textContent = '';
    elements.productListSection.hidden = true;
    elements.calculateButton.disabled = true;
    Render.renderEmptyState('Đang đọc workbook', 'Hệ thống đang gom dữ liệu BOM.');

    try {
        if (!window.XLSX) throw new Error('SheetJS XLSX is not available.');
        const buffer = await file.arrayBuffer();
        state.workbook = window.XLSX.read(buffer, { type: 'array', cellDates: false });

        state.parsedCache = window.BomParser.parseWorkbook(state.workbook, { includeValidation: true });
        state.validation = state.parsedCache.validation ?? [];

        for (const product of state.parsedCache.products) {
            state.productConfigs[product.sheetName] = { qty: product.qty ?? 0, enabled: true };
        }

        runCalculation();
    } catch (error) {
        console.error(error);
        Render.setStatus(elements.appStatus, 'error', 'Xử lý thất bại');
        setExportEnabled(false);
        Render.renderErrorState('Không thể phân tích file Excel.', error?.message || String(error));
    }
}

function runCalculation() {
    if (!state.parsedCache) return;

    state.optimizationId = (state.optimizationId ?? 0) + 1;
    state.viewModel = buildViewModel(state.parsedCache, state.productConfigs);

    Render.renderProducts(state.viewModel.products, {
        onToggle: (sheetName, enabled) => {
            const cfg = state.productConfigs[sheetName] ?? { qty: 0, enabled: true };
            state.productConfigs[sheetName] = { ...cfg, enabled };
        },
        onQtyChange: (sheetName, qty) => {
            const cfg = state.productConfigs[sheetName] ?? { qty: 0, enabled: true };
            state.productConfigs[sheetName] = { ...cfg, qty };
        },
    });

    Render.renderResults(state.viewModel, { onExportEnabled: setExportEnabled });
    elements.calculateButton.disabled = false;

    scheduleOptimization(state.optimizationId);
}

const WASTE_ALERT_PCT = 1.0;

function needsOptimization(plan) {
    return !plan.error && plan.result?.percentage_wasted >= WASTE_ALERT_PCT;
}

function scheduleOptimization(id) {
    const plans = state.viewModel?.plans;
    if (!plans?.length) return;

    const optimizedPlans = new Array(plans.length).fill(null);
    let index = 0;

    function step() {
        // Abort if a newer calculation has started.
        if (id !== state.optimizationId) return;

        if (index >= plans.length) {
            state.viewModel = { ...state.viewModel, optimizedPlans };
            Render.refreshCuttingSection(state.viewModel);
            return;
        }

        const plan = plans[index];
        // Only run the optimizer for red-alert materials; reuse the original plan otherwise.
        optimizedPlans[index] = needsOptimization(plan)
            ? computeOptimalMaterialPlan(plan.material)
            : plan;
        index++;
        setTimeout(step, 0);
    }

    setTimeout(step, 0);
}

// ── Excel export ───────────────────────────────────────────────────────────────

function exportExcel() {
    const vm = state.viewModel;
    if (!vm || typeof XLSX === 'undefined') return;

    const rawOrder = String(state.parsedCache?.order_name ?? '').trim();
    const safeOrder = rawOrder
        ? rawOrder.replace(/[^0-9A-Za-z]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120)
        : '';
    const fileName = safeOrder ? `VatTu_${safeOrder}.xlsx` : 'KeHoachCat.xlsx';
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
    summaryRows.push([vm.order_name ? 'LSX ' + vm.order_name : 'Lệnh sản xuất']);
    summaryRows.push([]);

    summaryTitleRows.push(summaryRows.length);
    summaryRows.push(['THÔNG TIN SẢN XUẤT']);
    summaryRows.push(['Steel weight', Number(vm.steelWeight.toFixed(2)), 'kg']);
    summaryRows.push(['Steel area', Number(vm.steelArea.toFixed(2)), 'm²']);
    summaryRows.push(['Wood area', Number(vm.woodArea.toFixed(2)), 'm²']);
    summaryRows.push(['Wood volume', Number(vm.woodVolume.toFixed(4)), 'm³']);
    summaryRows.push([]);

    summaryTitleRows.push(summaryRows.length);
    summaryRows.push(['DANH SÁCH SẢN PHẨM']);
    summaryTableHeaderRows.push(summaryRows.length);
    summaryRows.push(['Tên sản phẩm', 'Mã', 'Số lượng']);
    for (const p of vm.products) {
        const cfg = state.productConfigs[p.sheetName];
        const qty = cfg ? cfg.qty : p.qty;
        summaryRows.push([p.name, p.code, qty]);
    }
    summaryRows.push([]);

    summaryTitleRows.push(summaryRows.length);
    summaryRows.push(['YÊU CẦU SƠN']);
    summaryTableHeaderRows.push(summaryRows.length);
    summaryRows.push(['Mã màu', 'Diện tích (m²)']);
    for (const { code, area } of vm.powderCoating) {
        summaryRows.push([code, Number(area.toFixed(2))]);
    }
    if (!vm.powderCoating.length) summaryRows.push(['—', '']);
    summaryRows.push([]);

    summaryTitleRows.push(summaryRows.length);
    summaryRows.push(['TỔNG HỢP CẮT PHÔI']);
    summaryRows.push(['Số nhóm vật liệu', vm.plans.length]);

    let totalBars = 0, totalWaste = 0;
    let totalBarsOpt = 0, totalWasteOpt = 0;
    const hasOpt = Array.isArray(vm.optimizedPlans) && vm.optimizedPlans.some(p => p?.result);
    for (const plan of vm.plans) {
        if (!plan.result) continue;
        totalBars += Number(plan.result.stock_qty || 0);
        totalWaste += Number(plan.result.total_waste || 0);
    }
    if (hasOpt) {
        for (const plan of vm.optimizedPlans) {
            if (!plan?.result) continue;
            totalBarsOpt += Number(plan.result.stock_qty || 0);
            totalWasteOpt += Number(plan.result.total_waste || 0);
        }
    }

    summaryRows.push(['', 'Gốc', hasOpt ? 'Tối ưu' : '']);
    summaryRows.push(['Chiều dài vật liệu (mm)', 6000, hasOpt ? '(xem chi tiết)' : '']);
    summaryRows.push(['Tổng số thanh', totalBars, hasOpt ? totalBarsOpt : '']);
    summaryRows.push(['Tổng lượng dư thừa (mm)', totalWaste, hasOpt ? totalWasteOpt : '']);
    summaryRows.push([]);

    summaryTitleRows.push(summaryRows.length);
    summaryRows.push(['CHI TIẾT THEO NHÓM VẬT LIỆU']);
    summaryTableHeaderRows.push(summaryRows.length);
    summaryRows.push([
        'Vật liệu', 'Nhóm CD', 'Số chi tiết',
        'Dài GC (mm)', 'Số thanh GC', 'Dư thừa GC (mm)', 'Tỷ lệ GC (%)',
        ...(hasOpt ? ['Dài TU (mm)', 'Số thanh TU', 'Dư thừa TU (mm)', 'Tỷ lệ TU (%)'] : []),
    ]);
    for (let i = 0; i < vm.plans.length; i++) {
        const plan = vm.plans[i];
        const opt  = hasOpt ? vm.optimizedPlans[i] : null;
        summaryRows.push([
            Render.materialLabel(plan.material),
            plan.sourceCount,
            plan.requiredTotal,
            plan.displayStockLength ?? plan.input.stock_length,
            plan.result ? plan.result.stock_qty : '',
            plan.result ? plan.result.total_waste : '',
            plan.result ? Number(plan.result.percentage_wasted.toFixed(2)) : '',
            ...(hasOpt ? [
                opt?.displayStockLength ?? opt?.input?.stock_length ?? '',
                opt?.result ? opt.result.stock_qty : '',
                opt?.result ? opt.result.total_waste : '',
                opt?.result ? Number(opt.result.percentage_wasted.toFixed(2)) : '',
            ] : []),
        ]);
    }

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'TongHop');

    const { rows: detailRows, titleRows: detailTitleRows, headerRows: detailHeaderRows, merges: detailMerges, maxLengthCols } =
        buildDetailRows(vm.plans, 'CHI TIẾT MẪU CẮT - GỐC');
    const detailSheet = XLSX.utils.aoa_to_sheet(detailRows);
    XLSX.utils.book_append_sheet(workbook, detailSheet, 'ChiTiet');

    if (hasOpt) {
        const { rows: optRows, titleRows: optTitleRows, headerRows: optHeaderRows, merges: optMerges, maxLengthCols: optMaxCols } =
            buildDetailRows(vm.optimizedPlans.filter(Boolean), 'CHI TIẾT MẪU CẮT - TỐI ƯU');
        const optSheet = XLSX.utils.aoa_to_sheet(optRows);
        XLSX.utils.book_append_sheet(workbook, optSheet, 'ToiUu');
        applyWorkbookStyles(optSheet, {
            titleRows: optTitleRows,
            tableHeaderRows: optHeaderRows,
            mergeRanges: optMerges,
            columnWidths: [24, 22, 12, ...Array(optMaxCols).fill(12), 16, 14],
            sectionFill, headerFill, thinBorder,
        });
    }

    applyWorkbookStyles(summarySheet, {
        titleRows: summaryTitleRows,
        tableHeaderRows: summaryTableHeaderRows,
        mergeRanges: [],
        columnWidths: hasOpt
            ? [28, 12, 12, 14, 12, 16, 12, 14, 12, 16, 12]
            : [28, 12, 12, 14, 12, 16, 12],
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
                    (lengthToProductCodes.get(Number(length)) || []).forEach(c => patternCodes.add(c));
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

function isExcelFile(file) {
    const name = String(file?.name || '').toLowerCase();
    return name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.xlsm');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}
