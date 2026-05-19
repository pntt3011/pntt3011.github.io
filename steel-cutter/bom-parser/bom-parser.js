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

    function parseBomSheet(rows, sheetName, options = {}) {
        const validation = validateBomSheet(rows, sheetName);
        if (!validation.valid) return new Map();

        const productQty = options.productQtyOverride ?? validation.productQty;
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

            const material = {
                box_width: boxWidth,
                box_length: boxLength,
                type,
                shape,
                thickness
            };

            const key = makeKey(material);
            const totalQty = Math.round(qtyPerProduct * productQty);

            if (!grouped.has(key)) {
                grouped.set(key, {
                    ...material,
                    usageMap: new Map()
                });
            }

            const item = grouped.get(key);
            item.usageMap.set(length, (item.usageMap.get(length) || 0) + totalQty);
        }

        return grouped;
    }

    function mergeGrouped(target, source) {
        for (const [key, item] of source.entries()) {
            if (!target.has(key)) {
                target.set(key, item);
                continue;
            }

            const existing = target.get(key);
            for (const [length, qty] of item.usageMap.entries()) {
                existing.usageMap.set(length, (existing.usageMap.get(length) || 0) + qty);
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
                    .map(([length, qty]) => ({ length, qty }))
            }))
        };
    }

    function parseWorkbook(workbook, options = {}) {
        const allGrouped = new Map();
        const validation = [];

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

            const grouped = parseBomSheet(rows, sheetName, {
                productQtyOverride: options.sheetQty?.[sheetName]
            });

            mergeGrouped(allGrouped, grouped);
        }

        const result = finalize(allGrouped);

        if (options.includeValidation) {
            result.validation = validation;
        }

        return result;
    }

    async function parseBomFile(file, options = {}) {
        if (!global.XLSX) {
            throw new Error('SheetJS XLSX is required');
        }

        const buffer = await file.arrayBuffer();
        const workbook = global.XLSX.read(buffer, {
            type: 'array',
            cellDates: false
        });

        return parseWorkbook(workbook, options);
    }

    global.BomParser = {
        parseBomFile,
        parseWorkbook,
        validateBomSheet
    };

    global.parseBomFile = parseBomFile;
})(typeof window !== 'undefined' ? window : globalThis);