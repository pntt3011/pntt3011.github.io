/*
  Include first:
  <script src="https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js"></script>
*/

(function (global) {
    'use strict';

    function cleanText(value) {
        if (value === null || value === undefined) return '';
        return String(value).trim().replace(/\s+/g, ' ');
    }

    function normHeader(value) {
        return cleanText(value).toLowerCase().replace(/[\/-]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function toNumber(value) {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string') {
            const n = Number(value.trim().replace(',', '.'));
            return Number.isFinite(n) ? n : null;
        }
        return null;
    }

    function cellAt(rows, row, col) {
        return rows[row]?.[col];
    }

    function findCol(rows, headerRow, candidates) {
        const normalized = candidates.map(normHeader);
        const row = rows[headerRow] || [];
        for (let c = 0; c < row.length; c++) {
            const header = normHeader(row[c]);
            if (normalized.some(x => x === header || header.includes(x))) return c;
        }
        return -1;
    }

    function findHeaderRow(rows) {
        const required = ['dia rộng hộp', 'dia dài hộp', 'dài chi tiết', 'dày phôi', 'loại phôi'];
        for (let r = 0; r < rows.length; r++) {
            const joined = (rows[r] || []).map(normHeader).join(' | ');
            if (required.every(req => joined.includes(req))) return r;
        }
        return -1;
    }

    function detectProductQty(rows) {
        for (let r = 0; r < Math.min(rows.length, 40); r++) {
            const row = rows[r] || [];
            for (let c = 0; c < Math.min(row.length, 30); c++) {
                const text = normHeader(row[c]);
                if (text === 'tổng sl' || text === 'tong sl' || text.includes('tổng sl')) {
                    for (let offset = 1; offset <= 7; offset++) {
                        const n = toNumber(cellAt(rows, r, c + offset));
                        if (n !== null && n > 0) return Math.trunc(n);
                    }
                }
            }
        }
        return null;
    }

    function countValidSteelRows(rows, headerRow) {
        if (headerRow < 0) return 0;

        const cols = getColumns(rows, headerRow);
        if (Object.values(cols).some(c => c < 0)) return 0;

        let count = 0;
        let emptyRun = 0;

        for (let r = headerRow + 1; r < rows.length; r++) {
            const qty = toNumber(cellAt(rows, r, cols.qty));
            const width = toNumber(cellAt(rows, r, cols.box_width));
            const cutLength = toNumber(cellAt(rows, r, cols.length));
            const type = cleanText(cellAt(rows, r, cols.type));
            const shape = cleanText(cellAt(rows, r, cols.shape));

            if (!qty && !width && !cutLength && !type && !shape) {
                emptyRun++;
                if (emptyRun >= 10) break;
                continue;
            }

            emptyRun = 0;

            if (qty && width !== null && cutLength && type && shape) count++;
        }

        return count;
    }

    function validateBomSheet(rows, sheetName = '') {
        const headerRow = findHeaderRow(rows);
        const productQty = detectProductQty(rows);
        const dataRowCount = countValidSteelRows(rows, headerRow);

        const reasons = [];
        if (headerRow < 0) reasons.push('missing steel BOM header');
        if (!productQty) reasons.push('missing product quantity: Tổng SL');
        if (headerRow >= 0 && dataRowCount === 0) reasons.push('no valid steel rows');

        return {
            sheetName,
            valid: headerRow >= 0 && productQty !== null && dataRowCount > 0,
            headerRow,
            productQty,
            dataRowCount,
            reasons
        };
    }

    function getColumns(rows, headerRow) {
        return {
            qty: findCol(rows, headerRow, ['Số lượng']),
            box_width: findCol(rows, headerRow, ['Dia/rộng hộp', 'Dia rộng hộp']),
            box_length: findCol(rows, headerRow, ['Dia/dài hộp', 'Dia dài hộp']),
            length: findCol(rows, headerRow, ['Dài chi tiết']),
            thickness: findCol(rows, headerRow, ['Dày Phôi', 'Dày phôi']),
            type: findCol(rows, headerRow, ['loại khung']),
            shape: findCol(rows, headerRow, ['Loại Phôi'])
        };
    }

    function makeKey(m) {
        return JSON.stringify([
            m.box_width,
            m.box_length,
            m.type,
            m.shape,
            m.thickness
        ]);
    }

    function normalize(v) {
        return String(v ?? "")
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .replace(/[:：]/g, "")
            .replace(/\s+/g, " ");
    }

    // Read product info directly from the sheet object using Excel cell addresses (1-indexed)
    function extractProductInfo(sheet, sheetName) {
        const name = cleanText(sheet['G6']?.v ?? '');
        const code = cleanText(sheet['G7']?.v ?? '');
        return { name: name || sheetName, code: code || sheetName };
    }

    // Find "Cộng - TOTAL" in column B after "PHẦN SẮT" marker; read weight (col K=10), area (col L=11)
    function extractManufacturedSummary(rows) {
        let phanSatRow = -1;
        for (let r = 0; r < rows.length; r++) {
            const cell = normalize(cleanText(cellAt(rows, r, 1)));
            if (cell.includes('phan sat')) {
                phanSatRow = r;
                break;
            }
        }
        if (phanSatRow < 0) return null;

        for (let r = phanSatRow + 1; r < rows.length; r++) {
            const cell = normalize(cleanText(cellAt(rows, r, 1)));
            if (cell.includes('cong') && cell.includes('total')) {
                return {
                    weight: toNumber(cellAt(rows, r, 10)) || 0,
                    area: toNumber(cellAt(rows, r, 11)) || 0
                };
            }
        }
        return null;
    }

    // Match component rows by pattern *_(TĐ.<colorCode>) in col B; sum part area from col L
    const COLOR_CODE_RE = /_\(T[Đđ]\.([^)]+)\)/;

    function extractPowderCoating(rows) {
        const result = new Map();
        let currentCode = null;

        for (let r = 0; r < rows.length; r++) {
            const colB = cleanText(cellAt(rows, r, 1));
            const normB = normalize(colB);

            if (normB.includes('cong') && normB.includes('total')) break;

            const match = colB.match(COLOR_CODE_RE);
            if (match) {
                currentCode = match[1].trim();
                if (!result.has(currentCode)) result.set(currentCode, 0);
                continue;
            }

            if (currentCode !== null) {
                const area = toNumber(cellAt(rows, r, 11));
                if (area !== null && area > 0) {
                    result.set(currentCode, result.get(currentCode) + area);
                }
            }
        }

        return Array.from(result.entries()).map(([code, area]) => ({ code, area }));
    }

    function parseBomSheet(rows, sheetName, options = {}) {
        const validation = validateBomSheet(rows, sheetName);
        if (!validation.valid) return new Map();

        const productQty = options.productQtyOverride ?? validation.productQty;
        const productCode = options.productCode ?? sheetName;
        const cols = getColumns(rows, validation.headerRow);
        const grouped = new Map();

        let emptyRun = 0;

        for (let r = validation.headerRow + 1; r < rows.length; r++) {
            const qtyPerProduct = toNumber(cellAt(rows, r, cols.qty));
            const boxWidth = toNumber(cellAt(rows, r, cols.box_width));
            const boxLength = toNumber(cellAt(rows, r, cols.box_length));
            const length = toNumber(cellAt(rows, r, cols.length));
            const thickness = toNumber(cellAt(rows, r, cols.thickness));
            const type = cleanText(cellAt(rows, r, cols.type));
            const shape = cleanText(cellAt(rows, r, cols.shape));

            if (!qtyPerProduct && !boxWidth && !boxLength && !length && !thickness && !type && !shape) {
                emptyRun++;
                if (emptyRun >= 10) break;
                continue;
            }

            emptyRun = 0;

            if (!qtyPerProduct || !length || !type || !shape) continue;
            if (boxWidth === null || thickness === null) continue;

            // Skip flat sheets (la dẹt)
            if (normalize(shape) === 'la det') continue;

            const material = { box_width: boxWidth, box_length: boxLength, type, shape, thickness };
            const key = makeKey(material);
            const totalQty = Math.round(qtyPerProduct * productQty);

            if (!grouped.has(key)) {
                grouped.set(key, { ...material, usageMap: new Map() });
            }

            const item = grouped.get(key);
            const existing = item.usageMap.get(length);
            if (!existing) {
                item.usageMap.set(length, { qty: totalQty, productCodes: new Set([productCode]) });
            } else {
                existing.qty += totalQty;
                existing.productCodes.add(productCode);
            }
        }

        return grouped;
    }

    function mergeGrouped(target, source) {
        for (const [key, item] of source.entries()) {
            if (!target.has(key)) {
                const cloned = { ...item, usageMap: new Map() };
                for (const [len, data] of item.usageMap.entries()) {
                    cloned.usageMap.set(len, { qty: data.qty, productCodes: new Set(data.productCodes) });
                }
                target.set(key, cloned);
                continue;
            }

            const existing = target.get(key);
            for (const [length, data] of item.usageMap.entries()) {
                const existingData = existing.usageMap.get(length);
                if (!existingData) {
                    existing.usageMap.set(length, { qty: data.qty, productCodes: new Set(data.productCodes) });
                } else {
                    existingData.qty += data.qty;
                    for (const code of data.productCodes) existingData.productCodes.add(code);
                }
            }
        }
    }

    function finalize(grouped) {
        return {
            steel_material: Array.from(grouped.values()).map(item => ({
                box_width: item.box_width,
                box_length: item.box_length,
                type: item.type,
                shape: item.shape,
                thickness: item.thickness,
                usage: Array.from(item.usageMap.entries())
                    .sort((a, b) => Number(a[0]) - Number(b[0]))
                    .map(([length, { qty, productCodes }]) => ({
                        length, qty,
                        productCodes: Array.from(productCodes)
                    }))
            }))
        };
    }

    function extractOrderName(workbook) {
        const TARGET_SHEETS = ["lsx go", "lsx sat"];

        if (!workbook || !Array.isArray(workbook.SheetNames)) return null;

        for (const sheetName of workbook.SheetNames) {
            if (!TARGET_SHEETS.includes(normalize(sheetName))) continue;
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) continue;

            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null });
            for (let r = 0; r < rows.length; r++) {
                const row = rows[r] || [];
                for (let c = 0; c < row.length; c++) {
                    if (normalize(row[c]) === 'lsx so') {
                        const next = row[c + 1];
                        const orderName = next != null ? String(next).trim() : '';
                        if (orderName) return orderName;
                    }
                }
            }
        }

        return null;
    }

    function parseWorkbook(workbook, options = {}) {
        const allGrouped = new Map();
        const validation = [];
        const products = [];
        const powderCoatingMap = new Map();

        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, {
                header: 1,
                raw: true,
                defval: null,
                blankrows: false
            });

            const v = validateBomSheet(rows, sheetName);
            validation.push(v);

            if (!v.valid) continue;

            const productInfo = extractProductInfo(sheet, sheetName);
            const summary = extractManufacturedSummary(rows);
            const powderCoating = extractPowderCoating(rows);

            const qty = options.sheetQty?.[sheetName] ?? v.productQty;

            products.push({
                sheetName,
                code: productInfo.code,
                name: productInfo.name,
                qty,
                parsedQty: v.productQty,
                manufacturedWeight: summary?.weight || 0,
                manufacturedArea: summary?.area || 0,
            });

            for (const { code, area } of powderCoating) {
                powderCoatingMap.set(code, (powderCoatingMap.get(code) || 0) + area);
            }

            const grouped = parseBomSheet(rows, sheetName, {
                productQtyOverride: options.sheetQty?.[sheetName],
                productCode: productInfo.code
            });

            mergeGrouped(allGrouped, grouped);
        }

        const result = finalize(allGrouped);
        result.products = products;
        result.powder_coating = Array.from(powderCoatingMap.entries())
            .map(([code, area]) => ({ code, area }))
            .sort((a, b) => a.code.localeCompare(b.code));

        try {
            const orderName = extractOrderName(workbook);
            result.order_name = orderName ?? null;
        } catch (e) {
            result.order_name = null;
        }

        if (options.includeValidation) result.validation = validation;

        return result;
    }

    async function parseBomFile(file, options = {}) {
        if (!global.XLSX) throw new Error('SheetJS XLSX is required');

        const buffer = await file.arrayBuffer();
        const workbook = global.XLSX.read(buffer, { type: 'array', cellDates: false });

        return parseWorkbook(workbook, options);
    }

    global.BomParser = {
        parseBomFile,
        parseWorkbook,
        validateBomSheet,
        extractOrderName
    };

    global.bom_parse = parseBomFile;
})(typeof window !== 'undefined' ? window : globalThis);
