/*
  Requires SheetJS — include before this file:
  <script src="https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js"></script>

  Public API (same surface as before):
    BomParser.parseWorkbook(workbook, options?) → WorkbookResult
    BomParser.validateBomSheet(sheet)          → ValidationResult
    BomParser.extractOrderName(workbook)       → string | null
    BomParser.normalize(v)                     → string

  WorkbookResult:
  {
    order_name: string | null,
    products: Product[],                  // one per valid sheet
    validation?: ValidationResult[],      // present when options.includeValidation = true
  }

  Product:
  {
    sheetName: string,
    name:      string,           // G6
    code:      string,           // G7  (format *-*)
    qty:       number,           // Tổng SL (row 8, col R). 0 if not found.
    components: Component[],
  }

  Component:  (one per colour-group header inside "PHẦN SẮT")
  {
    name:        string,         // header label in col B, colour code stripped
    kind:        'steel',
    parts:       Part[],
  }

  SteelPart:
  {
    kind:       'steel',
    name:       string,          // col B
    qty:        number,          // col C
    box_width:  number | null,   // col D  Dia/rộng hộp
    box_height: number | null,   // col E  Dia/dài hộp
    length:     number | null,   // col F  Dài chi tiết
    thickness:  number | null,   // col G  Dày Phôi
    type:       string | null,   // col H  loại khung
    shape:      string | null,   // col J  Loại Phôi
  }

  ── Aggregation notes ───────────────────────────────────────────────────────
  Everything below can be computed from the data above WITHOUT re-parsing:

  • Total steel weight per product:
      sum over steel parts of:  qty * box_width * box_height * length * density
      (density comes from col I "KL Riêng" — not stored here; use 7850 kg/m³ for steel)

  These were previously pre-computed in parseBomSheet / extractManufacturedSummary.
  The sheet itself stores the pre-computed totals in cols K (weight) and L (area)
  per part row, and the grand totals in the "Cộng - TOTAL" row — your app can
  still read those from the raw sheet if you prefer pre-computed values.
  ────────────────────────────────────────────────────────────────────────────
*/

(function (global) {
    'use strict';

    // ── tiny utilities ────────────────────────────────────────────────────────

    function cleanText(v) {
        if (v == null) return '';
        return String(v).trim().replace(/\s+/g, ' ');
    }

    function toNumber(v) {
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v === 'string') {
            const n = Number(v.trim().replace(',', '.'));
            return Number.isFinite(n) ? n : null;
        }
        return null;
    }

    // Accent-strip + lowercase for fuzzy matching
    function normalize(v) {
        return String(v ?? '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[đĐ]/g, 'd')
            .replace(/[:：]/g, '')
            .replace(/\s+/g, ' ');
    }

    // Strip the colour-code suffix and trailing underscores from a label
    function stripColorSuffix(text) {
        return text.replace(/_*\(T[DĐdđ]\.[^)]+\)/, '').replace(/_+$/, '').trim();
    }

    // ── sheet validation ──────────────────────────────────────────────────────

    /**
     * Validates a single raw SheetJS sheet object.
     *
     * A sheet is valid when ALL three conditions hold:
     *   • G6 (row 6, col G) contains a non-empty product name
     *   • G7 (row 7, col G) contains a product code matching *-*
     *   • A5 (row 5, col A) contains "BẢNG KÊ QUY CÁCH TINH CHẾ"
     *
     * @param  {object} sheet  SheetJS worksheet object
     * @param  {string} [sheetName]
     * @returns {{ valid: boolean, name: string, code: string, reasons: string[] }}
     */
    function validateBomSheet(sheet, sheetName = '') {
        const reasons = [];

        const g6 = cleanText(sheet['G6']?.v ?? '');
        const g7 = cleanText(sheet['G7']?.v ?? '');
        const a5 = cleanText(sheet['A5']?.v ?? '');

        if (!g6)
            reasons.push('G6 (product name) is empty');

        const codeValid = /\S+-\S+/.test(g7);
        if (!g7 || !codeValid)
            reasons.push(`G7 (product code) is missing or not in *-* format: "${g7}"`);

        if (!normalize(a5).includes('bang ke quy cach tinh che'))
            reasons.push('A5 does not contain "BẢNG KÊ QUY CÁCH TINH CHẾ"');

        return {
            sheetName,
            valid: reasons.length === 0,
            name: g6,
            code: g7,
            reasons,
        };
    }

    // ── product-quantity extraction ───────────────────────────────────────────

    // "Tổng SL:" is always in row 8, col N (index 13); the value is in col R (index 17).
    // We still do a small scan to be resilient to minor layout shifts.
    function extractProductQty(rows) {
        for (let r = 0; r < Math.min(rows.length, 20); r++) {
            const row = rows[r] || [];
            for (let c = 0; c < row.length; c++) {
                if (normalize(row[c]).includes('tong sl')) {
                    for (let offset = 1; offset <= 10; offset++) {
                        const n = toNumber(row[c + offset]);
                        if (n !== null && n > 0) return Math.trunc(n);
                    }
                }
            }
        }
        return 0;
    }

    // ── section parsing ───────────────────────────────────────────────────────

    // Row 16 (0-indexed: 15) is the header row with "Tên chi tiết" in col B.
    // We use the col-B sentinel strings to locate the boundaries rather than
    // hardcoding row numbers.

    function findSectionBoundaries(rows) {
        let steelStart = -1;  // row of "PHẦN SẮT - not KD" (the col-C/D header row)
        let totalRow = -1;    // row of "Cộng - TOTAL"

        for (let r = 0; r < rows.length; r++) {
            const b = cleanText(rows[r]?.[1]);
            const nb = normalize(b);

            if (nb.includes('phan sat') && nb.includes('not kd'))
                steelStart = r;             // this row IS the steel column-header row

            if (nb.includes('cong') && nb.includes('total'))
                totalRow = r;
        }

        return { steelStart, totalRow };
    }

    // ── steel section ─────────────────────────────────────────────────────────

    /**
     * Parse steel parts between steelStart+1 and totalRow.
     * Returns an array of Component objects (one per colour-group header row).
     *
     * A component-header row: col B has a value, col C is null/undefined.
     *   These often carry a colour code: "CỤM HÔNG_(TĐ.αATD2205)"
     *
     * A part row: col B has a value AND col C has a qty.
     *
     * Steel part columns (0-indexed):
     *   B=1 name, C=2 qty, D=3 box_width, E=4 box_height, F=5 length,
     *   G=6 thickness, H=7 type, J=9 shape
     */
    function parseSteelSection(rows, steelStart, totalRow) {
        const components = [];
        let current = null;

        const dataStart = steelStart + 1;   // skip the column-header row itself
        const end = totalRow > dataStart ? totalRow : rows.length;

        for (let r = dataStart; r < end; r++) {
            const row = rows[r] || [];
            const b = cleanText(row[1]);
            const qty = toNumber(row[2]);

            if (!b) continue;

            const isComponentHeader = qty === null;

            if (isComponentHeader) {
                current = {
                    name: stripColorSuffix(b),
                    kind: 'steel',
                    parts: [],
                };
                components.push(current);
                continue;
            }

            if (qty !== null && qty > 0) {
                if (!current) {
                    // Steel parts before any component header — implicit group
                    current = { name: '', kind: 'steel', parts: [] };
                    components.push(current);
                }
                current.parts.push({
                    kind: 'steel',
                    name: b,
                    qty,
                    box_width: toNumber(row[3]) ?? null,
                    box_height: toNumber(row[4]) ?? null,
                    length: toNumber(row[5]) ?? null,
                    thickness: toNumber(row[6]) ?? null,
                    type: cleanText(row[7]) || null,
                    shape: cleanText(row[9]) || null,
                });
            }
        }

        return components.filter(c => c.parts.length > 0);
    }

    // ── order name ────────────────────────────────────────────────────────────

    function extractOrderName(workbook) {
        const TARGET = ['lsx go', 'lsx sat'];
        if (!workbook?.SheetNames) return null;

        for (const sheetName of workbook.SheetNames) {
            if (!TARGET.includes(normalize(sheetName))) continue;
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) continue;
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null });
            for (const row of rows) {
                for (let c = 0; c < (row?.length ?? 0); c++) {
                    if (normalize(row[c]) === 'lsx so') {
                        const v = row[c + 1];
                        const name = v != null ? String(v).trim() : '';
                        if (name) return name;
                    }
                }
            }
        }
        return null;
    }

    // ── main workbook parser ──────────────────────────────────────────────────

    /**
     * Parse an entire workbook and return structured product data.
     *
     * @param {object} workbook   SheetJS workbook object
     * @param {{ includeValidation?: boolean }} [options]
     * @returns {WorkbookResult}
     */
    function parseWorkbook(workbook, options = {}) {
        const products = [];
        const validation = [];

        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const v = validateBomSheet(sheet, sheetName);
            validation.push(v);

            if (!v.valid) continue;

            // Parse rows (raw=true to get numeric cell values for dimensions)
            const rows = XLSX.utils.sheet_to_json(sheet, {
                header: 1, raw: true, defval: null, blankrows: false,
            });

            const qty = extractProductQty(rows);
            const { steelStart, totalRow } = findSectionBoundaries(rows);

            const steelComponents = (steelStart >= 0)
                ? parseSteelSection(rows, steelStart, totalRow)
                : [];

            products.push({
                sheetName,
                name: v.name,
                code: v.code,
                qty,
                components: steelComponents,
            });
        }

        const result = { products };
        result.order_name = null;
        try { result.order_name = extractOrderName(workbook) ?? null; } catch (_) { }
        if (options.includeValidation) result.validation = validation;
        return result;
    }

    // ── calculations ──────────────────────────────────────────────────────────

    /*
      All dimension inputs are in millimetres (as stored in the sheet).
      All outputs match the Excel sheet:
        weight → kg    (column K)
        area   → m²   (column L)
        volume → m³   (column K for wood)

      The functions below compute the PER-UNIT values (not multiplied by qty).
      Multiply by part.qty yourself when aggregating totals.

      Excel formula source (from the actual .xlsm cells):
        Steel K: =IF(OR(J="hộp",J="vuông"), (D+(E-G))*2*F*G*I*C/10^9,
                   IF(J="la dẹt",           (D+(E-G))*F*G*I*C/10^9,
                   IF(J="ống",              3.14*D*F*G*I*C/10^9,
                   IF(J="tròn đặc",         3.14*(D/2)*(F/2)*G*I*C/10^9,
                   IF(J="V",               (D+E)*F*I*C/10^9)))))
        Steel L: =IF(OR(J="vuông",J="hộp",J="la dẹt"), (D+E)*2*F*C/10^6,
                                                         3.14*D*F*C/10^6)
        Wood  K: =ROUND(G*H*(I+J)*C/10^9, 5)
        Wood  L: =ROUND(2*(G+H)*(I+J)*C/10^6, 4)
      (C=qty stripped out; functions return per-unit values)
    */

    // PI constant used by the Excel sheet (3.14, not Math.PI)
    const EXCEL_PI = 3.14;

    /**
     * Returns the density (kg/m³) for a given steel part, or null if the
     * material type is unrecognised (mirrors Excel returning "" for unknown).
     *
     * Mirrors: =IF(J="sắt đen",7850,IF(J="sắt trắng",7850,
     *              IF(J="sắt kẽm",7900,IF(J="nhôm",2700,""))))
     *
     * @param {{ type: string|null }} part
     * @returns {number|null}
     */
    function getSteelDensity(part) {
        switch (normalize(part.type ?? '')) {
            case 'sat den': return 7850;
            case 'sat trang': return 7850;
            case 'sat kem': return 7900;
            case 'nhom': return 2700;
            default: return 0; // unknown types treated as zero density (Excel returns "" which is falsy)
        }
    }

    /**
     * Compute the weight (kg) of ONE steel part (qty = 1).
     *
     * Mirrors the Excel K-column formula exactly, with qty factored out.
     *
     * Supported shapes (col J, case-insensitive, accent-insensitive):
     *   "hộp"       – rectangular hollow section (RHS)
     *   "vuông"     – square hollow section (SHS)
     *   "ống"       – round hollow tube
     *   "tròn đặc"  – solid round bar
     *   "la dẹt"    – flat bar
     *   "v"         – angle/V-section (treated as two flat faces)
     *
     * @param {{
     *   box_width:  number|null,   // col D – outer width  (mm)
     *   box_height: number|null,   // col E – outer height (mm)
     *   length:     number|null,   // col F – cut length   (mm)
     *   thickness:  number|null,   // col G – wall/bar thickness (mm)
     *   shape:      string|null,   // col J – shape name
     *   type:       string|null,   // col H – material type (for density fallback)
     *   density?:   number|null,   // col I – density kg/m³ (optional)
     * }} part
     * @returns {number}  weight in kg per unit, or 0 if inputs are insufficient
     */
    function calcSteelWeightPerUnit(part) {
        const D = part.box_width;
        const E = part.box_height;
        const F = part.length;
        const G = part.thickness;
        const I = getSteelDensity(part);
        const shape = normalize(part.shape ?? '');

        if (F == null || G == null || I == null) return 0;

        // Hộp / Vuông  →  (D + (E - G)) * 2 * F * G * I / 10^9
        if (shape === 'hop' || shape === 'vuong') {
            if (D == null || E == null) return 0;
            return (D + (E - G)) * 2 * F * G * I / 1e9;
        }

        // La Dẹt  →  (D + (E - G)) * F * G * I / 10^9
        if (shape === 'la det') {
            if (D == null || E == null) return 0;
            return (D + (E - G)) * F * G * I / 1e9;
        }

        // Ống  →  3.14 * D * F * G * I / 10^9
        if (shape === 'ong') {
            if (D == null) return 0;
            return EXCEL_PI * D * F * G * I / 1e9;
        }

        // Tròn Đặc  →  3.14 * (D/2) * (F/2) * G * I / 10^9
        // Note: the Excel formula passes D/2 and F/2 — this is the sheet's own
        // approximation; do not "correct" it.
        if (shape === 'tron dac') {
            if (D == null) return 0;
            return EXCEL_PI * (D / 2) * (F / 2) * G * I / 1e9;
        }

        // V (angle section)  →  (D + E) * F * I / 10^9
        if (shape === 'v') {
            if (D == null || E == null) return 0;
            return (D + E) * F * I / 1e9;
        }

        return 0; // unknown shape
    }

    /**
     * Compute the paint/coat surface area (m²) of ONE steel part (qty = 1).
     *
     * Mirrors the Excel L-column formula exactly, with qty factored out.
     *
     *   Box / Square / Flat bar:  (D + E) * 2 * F / 10^6
     *   Round / Pipe / Other:     3.14 * D * F / 10^6
     *
     * @param {{
     *   box_width:  number|null,   // col D
     *   box_height: number|null,   // col E
     *   length:     number|null,   // col F
     *   shape:      string|null,   // col J
     * }} part
     * @returns {number}  surface area in m² per unit, or 0 if inputs are insufficient
     */
    function calcSteelAreaPerUnit(part) {
        const D = part.box_width;
        const E = part.box_height;
        const F = part.length;
        const shape = normalize(part.shape ?? '');

        if (F == null || D == null) return 0;

        // Box / Square / Flat bar → outer perimeter × length
        if (shape === 'hop' || shape === 'vuong' || shape === 'la det') {
            if (E == null) return 0;
            return (D + E) * 2 * F / 1e6;
        }

        // Round tube / solid round / angle / anything else → π * D * F
        return EXCEL_PI * D * F / 1e6;
    }

    // ── exports ───────────────────────────────────────────────────────────────

    const BomParser = {
        parseWorkbook,
        validateBomSheet,
        extractOrderName,
        normalize,
        // calculation helpers
        getSteelDensity,
        calcSteelWeightPerUnit,
        calcSteelAreaPerUnit,
    };

    global.BomParser = BomParser;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = BomParser;
    }

})(typeof window !== 'undefined' ? window : globalThis);