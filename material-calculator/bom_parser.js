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
            normalize(m.type),
            normalize(m.shape),
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

    // Returns null if G6 (name) or G7 (code) are missing — sheet is invalid without them.
    function extractProductInfo(sheet) {
        const name = cleanText(sheet['G6']?.v ?? '');
        const code = cleanText(sheet['G7']?.v ?? '');
        if (!name || !code) return null;
        return { name, code };
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
    // Underscore before ( is optional; D may appear with or without the Vietnamese stroke
    const COLOR_CODE_RE = /\(T[DĐdđ]\.([^)]+)\)/;

    // Returns per-unit area per color code — multiply by qty in the app at calculate time.
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

        return Array.from(result.entries()).map(([code, areaPerUnit]) => ({ code, areaPerUnit }));
    }

    // Stores raw per-unit qty (qtyPerProduct) — no productQty multiplication.
    // Merging and scaling happen in the app at calculate time.
    function parseBomSheet(rows, headerRow, options = {}) {
        const productCode = options.productCode ?? 'unknown';
        const cols = getColumns(rows, headerRow);
        const grouped = new Map();
        let emptyRun = 0;

        for (let r = headerRow + 1; r < rows.length; r++) {
            const qtyPerProduct = toNumber(cellAt(rows, r, cols.qty));
            const boxWidth = toNumber(cellAt(rows, r, cols.box_width));
            const boxLength = toNumber(cellAt(rows, r, cols.box_length));
            const length = toNumber(cellAt(rows, r, cols.length));
            const thickness = toNumber(cellAt(rows, r, cols.thickness));
            const type = cleanText(cellAt(rows, r, cols.type));
            const shape = cleanText(cellAt(rows, r, cols.shape));

            if (!qtyPerProduct && !boxWidth && !boxLength && !length && !thickness && !type && !shape) {
                if (++emptyRun >= 10) break;
                continue;
            }
            emptyRun = 0;

            if (!qtyPerProduct || !length || !type || !shape) continue;
            if (boxWidth === null || thickness === null) continue;
            if (qtyPerProduct <= 0) continue;

            const material = { box_width: boxWidth, box_length: boxLength, type, shape, thickness };
            const key = makeKey(material);

            if (!grouped.has(key)) {
                grouped.set(key, { ...material, usages: new Map() });
            }

            const item = grouped.get(key);
            const existing = item.usages.get(length);
            if (!existing) {
                item.usages.set(length, { qtyPerUnit: qtyPerProduct, productCodes: new Set([productCode]) });
            } else {
                existing.qtyPerUnit += qtyPerProduct;
                existing.productCodes.add(productCode);
            }
        }

        return grouped;
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

    // Parses the workbook ONCE and returns raw per-unit data per sheet.
    // The app applies qty scaling and merging at calculate time — no re-parsing needed.
    function parseWorkbook(workbook, options = {}) {
        const sheets = [];
        const validation = [];

        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, {
                header: 1, raw: true, defval: null, blankrows: false
            });

            const v = validateBomSheet(rows, sheetName);
            validation.push(v);

            if (v.headerRow < 0 || v.dataRowCount === 0) continue;

            const productInfo = extractProductInfo(sheet);
            if (!productInfo) continue;
            const summary = extractManufacturedSummary(rows);

            sheets.push({
                sheetName,
                code: productInfo.code,
                name: productInfo.name,
                parsedQty: v.productQty,
                weightPerUnit: summary?.weight || 0,
                areaPerUnit: summary?.area || 0,
                volumePerUnit: toNumber(sheet['L15']?.v) || 0,
                materials: parseBomSheet(rows, v.headerRow, { productCode: productInfo.code }),
                powderCoating: extractPowderCoating(rows),
            });
        }

        const result = { sheets };
        result.order_name = null;
        try { result.order_name = extractOrderName(workbook) ?? null; } catch (_) { }
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
        extractOrderName,
        normalize
    };

    global.bom_parse = parseBomFile;
})(typeof window !== 'undefined' ? window : globalThis);
