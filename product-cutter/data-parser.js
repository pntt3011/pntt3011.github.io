/*
  data-parser.js — load and parse data.xlsx into per-product part lists.

  Requires SheetJS — include before this file:
  <script src="https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js"></script>

  data.xlsx columns (sheet "Product Parts"):
    A  Product Code
    B  Product Name
    C  1st-order part
    D  2nd-order part
    E  3rd-order part
    F  4th-order part
    G  Box Length (mm)
    H  Box Width (mm)
    I  Detail Length (mm)
    J  Thickness (mm)

  Each row is one part instance (qty 1). Identical rows within the same
  product (same dimensions) simply repeat, contributing additively to the
  required quantity for that dimension group.

  Public API:
    DataParser.loadProducts(url) → Promise<Product[]>

  Product:
  {
    code: string,
    name: string,
    parts: Part[],
  }

  Part:
  {
    boxLength: number,   // mm
    boxWidth:  number,   // mm
    length:    number,   // mm
    thickness: number,   // mm
  }
*/

(function (global) {
    'use strict';

    function toNumber(v) {
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v === 'string') {
            const n = Number(v.trim().replace(',', '.'));
            return Number.isFinite(n) ? n : null;
        }
        return null;
    }

    async function loadProducts(url) {
        if (!global.XLSX) throw new Error('SheetJS XLSX is required');

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
        const buffer = await response.arrayBuffer();
        const workbook = global.XLSX.read(buffer, { type: 'array', cellDates: false });

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = global.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, blankrows: false });

        const productMap = new Map();

        for (let r = 1; r < rows.length; r++) {
            const row = rows[r] || [];
            const code = row[0] != null ? String(row[0]).trim() : '';
            if (!code) continue;

            const name = row[1] != null ? String(row[1]).trim() : '';
            const boxLength = toNumber(row[6]);
            const boxWidth = toNumber(row[7]);
            const length = toNumber(row[8]);
            const thickness = toNumber(row[9]);

            if (length == null || length <= 0) continue;

            if (!productMap.has(code)) {
                productMap.set(code, { code, name, parts: [] });
            }

            productMap.get(code).parts.push({
                boxLength,
                boxWidth,
                length,
                thickness,
            });
        }

        return Array.from(productMap.values());
    }

    global.DataParser = { loadProducts };

})(typeof window !== 'undefined' ? window : globalThis);
