/*
  Requires SheetJS — include before this file:
  <script src="https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js"></script>

  Public API (same surface as before):
    BomParser.parseBomFile(file, options?)   → Promise<WorkbookResult>
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

  Component:  (one per colour-group header inside "PHẦN SẮT", OR the single
               implicit "wood" group in the wood section)
  {
    name:        string,         // header label in col B, colour code stripped
    paint_color: string | null,  // extracted from _(TĐ.<code>) suffix; null for wood
    kind:        'wood' | 'steel',
    parts:       Part[],
  }

  WoodPart:
  {
    kind:      'wood',
    name:      string,           // col B
    qty:       number,           // col C
    thickness: number | null,    // col G (finished)
    width:     number | null,    // col H (finished)
    length:    number | null,    // col I (finished)
    joint:     number | null,    // col J
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

  • Paint area per colour per product:
      filter components by paint_color, sum over their steel parts of:
      qty * 2*(box_width + box_height) * length  (in mm → convert to m²)

  • Wood volume per product:
      sum over wood parts of: qty * thickness * width * length (mm³ → m³)

  These were previously pre-computed in parseBomSheet / extractManufacturedSummary
  / extractPowderCoating.  The sheet itself stores the pre-computed totals in
  cols K (weight) and L (area) per part row, and the grand totals in the
  "Cộng - TOTAL" row — your app can still read those from the raw sheet if you
  prefer pre-computed values.
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

    // Extract paint colour from component-header strings like
    //   "CỤM HÔNG_(TĐ.αATD2205)"  or  "CHI TIẾT RỜI__(TĐ.βAFD7067)"
    const COLOR_CODE_RE = /\(T[DĐdđ]\.([^)]+)\)/;

    function extractColor(text) {
        const m = text.match(COLOR_CODE_RE);
        return m ? m[1].trim() : null;
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
    // Data starts at row 17 (0-indexed: 16) but effectively at row 19 (18)
    // after the two sub-header rows.  We use the col-B sentinel strings to
    // locate the three boundaries rather than hardcoding row numbers.

    function findSectionBoundaries(rows) {
        let woodStart = -1;   // row after "Tên chi tiết"
        let steelStart = -1;  // row of "PHẦN SẮT - not KD" (the col-C/D header row)
        let totalRow = -1;    // row of "Cộng - TOTAL"

        for (let r = 0; r < rows.length; r++) {
            const b = cleanText(rows[r]?.[1]);
            const nb = normalize(b);

            if (nb === 'ten chi tiet' || nb.includes('ten chi tiet'))
                woodStart = r + 1;          // data begins on the next row

            if (nb.includes('phan sat') && nb.includes('not kd'))
                steelStart = r;             // this row IS the steel column-header row

            if (nb.includes('cong') && nb.includes('total'))
                totalRow = r;
        }

        return { woodStart, steelStart, totalRow };
    }

    // ── wood section ──────────────────────────────────────────────────────────

    /**
     * Parse wood parts between woodStart and steelStart.
     * Returns an array of Component objects (one per component-header row).
     *
     * A component-header row: col B has a value, col C is null/undefined.
     * A part row:             col B has a value AND col C has a qty.
     *   OR (rare): col B is null but col C has a qty (part belongs to last component).
     *
     * Wood part columns (0-indexed):
     *   B=1 name, C=2 qty, G=6 thickness(finished), H=7 width(finished),
     *   I=8 length(finished), J=9 joint
     */
    function parseWoodSection(rows, woodStart, steelStart) {
        const components = [];
        let current = null;

        const end = steelStart > woodStart ? steelStart : rows.length;

        for (let r = woodStart; r < end; r++) {
            const row = rows[r] || [];
            const b = cleanText(row[1]);
            const cVal = row[2];
            const qty = toNumber(cVal);

            // Skip summary / metadata rows that appear near the bottom of the wood block
            const nb = normalize(b);
            if (nb.includes('quy cach phoi') || nb.includes('tong kl')) continue;

            const isComponentHeader = b && (qty === null || qty === undefined || isNaN(qty));
            const isPartRow = qty !== null && qty > 0;

            if (isComponentHeader) {
                current = {
                    name: b,
                    paint_color: null,
                    kind: 'wood',
                    parts: [],
                };
                components.push(current);
                continue;
            }

            if (isPartRow) {
                if (!current) {
                    // Part appears before any component header — create an implicit one
                    current = { name: '', paint_color: null, kind: 'wood', parts: [] };
                    components.push(current);
                }
                current.parts.push({
                    kind: 'wood',
                    name: b || '',
                    qty,
                    thickness: toNumber(row[6]) || null,
                    width: toNumber(row[7]) || null,
                    length: toNumber(row[8]) || null,
                    joint: toNumber(row[9]) || null,
                });
            }
        }

        return components.filter(c => c.parts.length > 0);
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
                const color = extractColor(b);
                current = {
                    name: stripColorSuffix(b),
                    paint_color: color,
                    kind: 'steel',
                    parts: [],
                };
                components.push(current);
                continue;
            }

            if (qty !== null && qty > 0) {
                if (!current) {
                    // Steel parts before any component header — implicit group
                    current = { name: '', paint_color: null, kind: 'steel', parts: [] };
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
            const { woodStart, steelStart, totalRow } = findSectionBoundaries(rows);

            const woodComponents = (woodStart >= 0 && steelStart > woodStart)
                ? parseWoodSection(rows, woodStart, steelStart)
                : [];

            const steelComponents = (steelStart >= 0)
                ? parseSteelSection(rows, steelStart, totalRow)
                : [];

            products.push({
                sheetName,
                name: v.name,
                code: v.code,
                qty,
                components: [...woodComponents, ...steelComponents],
            });
        }

        const result = { products };
        result.order_name = null;
        try { result.order_name = extractOrderName(workbook) ?? null; } catch (_) { }
        if (options.includeValidation) result.validation = validation;
        return result;
    }

    // ── file entry point ──────────────────────────────────────────────────────

    async function parseBomFile(file, options = {}) {
        if (!global.XLSX) throw new Error('SheetJS XLSX is required');
        const buffer = await file.arrayBuffer();
        const workbook = global.XLSX.read(buffer, { type: 'array', cellDates: false });
        return parseWorkbook(workbook, options);
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
     * Returns the density (kg/m³) for a given steel part.
     * The sheet stores the density explicitly in column I — pass that value
     * when available.  Falls back to shape-based defaults when the stored
     * value is missing or zero.
     *
     * Known densities used in the file:
     *   7850 kg/m³  – carbon steel (sắt đen), all shapes
     *
     * @param {{ shape: string|null, type: string|null, density?: number|null }} part
     * @returns {number}  density in kg/m³
     */
    function getSteelDensity(part) {
        // If the sheet provided an explicit density (col I), use it directly.
        if (part.density != null && Number.isFinite(part.density) && part.density > 0)
            return part.density;

        // Shape / material fallbacks (extend as needed for other alloys)
        const shape = normalize(part.shape ?? '');
        const type = normalize(part.type ?? '');

        // Aluminium profiles, if ever added:
        if (type.includes('nhom') || type.includes('aluminum') || type.includes('aluminium'))
            return 2700;

        // Stainless steel:
        if (type.includes('inox') || type.includes('stainless'))
            return 7900;

        // Default: carbon steel
        return 7850;
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

    /**
     * Compute the volume (m³) of ONE wood part (qty = 1).
     *
     * Excel formula:  ROUND(G * H * (I + J) * C / 10^9, 5)
     * With qty removed: G * H * (I + J) / 10^9
     *
     * G = thickness (mm), H = width (mm), I = length (mm), J = joint (mm).
     * The joint length is added to I because the raw blank includes the tenon.
     *
     * @param {{
     *   thickness: number|null,  // col G
     *   width:     number|null,  // col H
     *   length:    number|null,  // col I
     *   joint:     number|null,  // col J  (tenon/mortise addition; 0 if absent)
     * }} part
     * @returns {number}  volume in m³ per unit, or 0 if inputs are insufficient
     */
    function calcWoodVolumePerUnit(part) {
        const G = part.thickness;
        const H = part.width;
        const I = part.length;
        const J = part.joint ?? 0;

        if (G == null || H == null || I == null) return 0;
        return G * H * (I + J) / 1e9;
    }

    /**
     * Compute the surface area (m²) of ONE wood part (qty = 1).
     *
     * Excel formula:  ROUND(2 * (G + H) * (I + J) * C / 10^6, 4)
     * With qty removed: 2 * (G + H) * (I + J) / 10^6
     *
     * This is the lateral surface area of the rectangular blank
     * (perimeter × effective length, including joint).
     *
     * @param {{
     *   thickness: number|null,  // col G
     *   width:     number|null,  // col H
     *   length:    number|null,  // col I
     *   joint:     number|null,  // col J
     * }} part
     * @returns {number}  surface area in m² per unit, or 0 if inputs are insufficient
     */
    function calcWoodAreaPerUnit(part) {
        const G = part.thickness;
        const H = part.width;
        const I = part.length;
        const J = part.joint ?? 0;

        if (G == null || H == null || I == null) return 0;
        return 2 * (G + H) * (I + J) / 1e6;
    }

    // ── exports ───────────────────────────────────────────────────────────────

    global.BomParser = {
        parseBomFile,
        parseWorkbook,
        validateBomSheet,
        extractOrderName,
        normalize,
        // calculation helpers
        getSteelDensity,
        calcSteelWeightPerUnit,
        calcSteelAreaPerUnit,
        calcWoodVolumePerUnit,
        calcWoodAreaPerUnit,
    };

    global.bom_parse = parseBomFile;

})(typeof window !== 'undefined' ? window : globalThis);