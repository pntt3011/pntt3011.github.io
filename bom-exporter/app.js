// ── DOM refs ─────────────────────────────────────────────────────────────────
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const sheetSelect = document.getElementById('sheetSelect');
const materialGo = document.getElementById('materialGo');
const materialSat = document.getElementById('materialSat');
const parseBtn = document.getElementById('parseBtn');
const statusMsg = document.getElementById('statusMsg');

let workbook = null;

// ── File loading ─────────────────────────────────────────────────────────────
function loadFile(file) {
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      workbook = XLSX.read(e.target.result, { type: 'array' });
      populateSheets(workbook.SheetNames);
      fileName.textContent = file.name;
      dropZone.classList.add('has-file');
      setStatus(`Loaded ${workbook.SheetNames.length} sheets.`);
      updateMaterialAvailability();
    } catch (err) {
      console.error(err);
      setStatus('Failed to read file: ' + err.message, 'error');
    }
  };

  reader.readAsArrayBuffer(file);
}

function populateSheets(names) {
  sheetSelect.innerHTML = '';

  names.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sheetSelect.appendChild(opt);
  });

  sheetSelect.disabled = false;
  parseBtn.disabled = false;
}

// ── Drag & drop ──────────────────────────────────────────────────────────────
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');

  const file = e.dataTransfer.files[0];
  if (file) loadFile(file);
});

fileInput.addEventListener('change', () => {
  loadFile(fileInput.files[0]);
});

sheetSelect.addEventListener('change', updateMaterialAvailability);

// ── Material availability ───────────────────────────────────────────────────
function updateMaterialAvailability() {
  if (!workbook || !sheetSelect.value) return;

  const srcSheet = workbook.Sheets[sheetSelect.value];
  const rows = XLSX.utils.sheet_to_json(srcSheet, { header: 1, defval: null });

  const layout = detectLayout(rows);
  const hasGo = layout.wood.dataStartRow >= 0 && rows.slice(layout.wood.dataStartRow, layout.wood.dataEndRow)
    .some(row => (row?.[layout.wood.nameCol] ?? '') !== '');
  const hasSat = layout.steel.dataStartRow >= 0 && rows.slice(layout.steel.dataStartRow, layout.steel.dataEndRow)
    .some(row => (row?.[layout.steel.nameCol] ?? '') !== '');

  materialGo.disabled = !hasGo;
  materialSat.disabled = !hasSat;

  if (materialGo.checked && !hasGo && hasSat) materialSat.checked = true;
  if (materialSat.checked && !hasSat && hasGo) materialGo.checked = true;

  parseBtn.disabled = !hasGo && !hasSat;
}

// ── Parse button ─────────────────────────────────────────────────────────────
parseBtn.addEventListener('click', () => {
  if (!workbook) return;

  setStatus('Đang xử lý…');
  parseBtn.disabled = true;

  try {
    const material = materialSat.checked ? 'sat' : 'go';
    const srcSheet = workbook.Sheets[sheetSelect.value];
    const rows = XLSX.utils.sheet_to_json(srcSheet, {
      header: 1,
      defval: null
    });

    const prod = parseProduct(rows);
    const parts = material === 'go' ? parseWoodParts(rows) : parseSteelParts(rows);
    const wb = createWorkbook();

    fillBom(wb.Sheets['bom'], prod, parts, material);

    const suffix = material === 'go' ? 'Gỗ' : 'Sắt';
    const filename = `${prod.code ?? sheetSelect.value} (${suffix}).xlsx`;

    XLSX.writeFile(wb, filename);
    setStatus('Done — file downloaded.', 'success');
  } catch (e) {
    console.error(e);
    setStatus('Error: ' + e.message, 'error');
  } finally {
    parseBtn.disabled = false;
  }
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function fmtCode(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Math.floor(v) === v) return String(Math.floor(v));
  return String(v).trim();
}

function normText(v) {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function findCell(rows, predicate, maxRows = 200, maxCols = 250) {
  for (let r = 0; r < Math.min(rows.length, maxRows); r++) {
    const row = rows[r] ?? [];

    for (let c = 0; c < Math.min(row.length, maxCols); c++) {
      if (predicate(row[c], r, c)) {
        return { r, c, value: row[c] };
      }
    }
  }

  return null;
}

function valueRightOfLabel(rows, labels, maxRows = 100, maxCols = 80) {
  if (!Array.isArray(labels)) labels = [labels];

  const labelSet = labels.map(normText);

  const hit = findCell(
    rows,
    v => labelSet.includes(normText(v)),
    maxRows,
    maxCols
  );

  if (!hit) return null;

  const row = rows[hit.r] ?? [];

  for (let c = hit.c + 1; c < Math.min(row.length, hit.c + 10); c++) {
    if (row[c] != null && row[c] !== '') return row[c];
  }

  return null;
}

// ── Product parser ──────────────────────────────────────────────────────────
function parseProduct(rows) {
  const [dai, rong, cao] = findDimensionValues(rows);

  return {
    name: valueRightOfLabel(rows, ['Product :', 'Product:']),
    code: valueRightOfLabel(rows, ['Item Code:', 'Item Code :']),
    dai,
    rong,
    cao,
    loaiGo: findLoaiGo(rows)
  };
}

// Newer sheets carry "Loại gỗ" as a label/value pair stacked two rows apart
// in the same column. Older sheets instead had the value to the right of a
// same-row "Kind of wood :" label.
function findLoaiGo(rows) {
  const hit = findCell(rows, v => normText(v) === 'loại gỗ');

  if (hit) {
    const value = rows[hit.r + 2]?.[hit.c];
    if (value != null && value !== '') return value;
  }

  return valueRightOfLabel(rows, ['Kind of wood :', 'Kind of wood:']);
}

function findDimensionValues(rows) {
  const hit = findCell(
    rows,
    v => {
      const t = normText(v);
      return t.startsWith('dimention') || t.startsWith('dimension');
    },
    100,
    80
  );

  if (!hit) return [null, null, null];

  const row = rows[hit.r] ?? [];
  const values = [];

  for (let c = hit.c + 1; c < Math.min(row.length, hit.c + 12); c++) {
    const v = row[c];

    if (v == null || v === '') continue;
    if (String(v).includes('(')) continue;

    values.push(v);
    if (values.length === 3) break;
  }

  return [
    values[0] ?? null,
    values[1] ?? null,
    values[2] ?? null
  ];
}

// ── Layout detection ────────────────────────────────────────────────────────
// The workbook has two stacked component tables per sheet:
//   Phần I  — wood parts, header row has "Stt"/"Tên chi tiết", ends at "N. Liệu"
//   Phần II — steel parts, header row starts with "PHẦN SẮT", ends at "Cộng - TOTAL"
function detectLayout(rows) {
  const woodHeaderRow = findRowIndex(rows, row =>
    normText(row?.[0]) === 'stt' && normText(row?.[1]).includes('tên chi tiết')
  );

  const woodHeaderIdx = woodHeaderRow?.r ?? -1;
  const woodHeader = woodHeaderIdx >= 0 ? rows[woodHeaderIdx] : [];

  const steelHeaderRow = findRowIndex(rows, row =>
    normText(row?.[1]).startsWith('phần sắt')
  );
  const steelHeaderIdx = steelHeaderRow?.r ?? -1;
  const steelHeader = steelHeaderIdx >= 0 ? rows[steelHeaderIdx] : [];

  const woodEndIdx = findRowIndex(rows, row =>
    normText(row?.[0]) === 'n. liệu', woodHeaderIdx + 1
  )?.r ?? rows.length;

  const steelEndIdx = findRowIndex(rows, row =>
    normText(row?.[1]).startsWith('cộng'), steelHeaderIdx + 1
  )?.r ?? rows.length;

  const woodGhiChuCol = findColByHeader(woodHeader, ['ghi chú'], 13);

  return {
    wood: {
      dataStartRow: woodHeaderIdx >= 0 ? woodHeaderIdx + 2 : -1, // skip unit sub-header row
      dataEndRow: woodEndIdx,
      nameCol: 1,
      codeCol: 0,
      slCol: 2,
      dayTinhCol: findColByHeader(woodHeader, ['dày (mm)'], 6),
      rongTinhCol: findColByHeader(woodHeader, ['rộng (mm)'], 7),
      daiTinhCol: findColByHeader(woodHeader, ['dài(mm)', 'dài (mm)'], 8),
      mongCol: findColByHeader(woodHeader, ['mộng(mm)', 'mộng (mm)'], 9),
      loaiChiTietCol: findColByHeader(woodHeader, ['loại chi tiết'], 20),
      ghiChuCol: woodGhiChuCol,
      // The column immediately left of "Ghi chú" carries an extra note (e.g.
      // "Mặt Cào Cước") whose header text varies between workbooks, so it's
      // located positionally rather than by name.
      preGhiChuCol: woodGhiChuCol > 0 ? woodGhiChuCol - 1 : -1
    },
    steel: {
      dataStartRow: steelHeaderIdx >= 0 ? steelHeaderIdx + 1 : -1,
      dataEndRow: steelEndIdx,
      nameCol: 1,
      codeCol: 0,
      slCol: findColByHeader(steelHeader, ['số lượng'], 2),
      diaRongHopCol: findColByHeader(steelHeader, ['dia/rộng hộp'], 3),
      diaDaiHopCol: findColByHeader(steelHeader, ['dia/dài hộp'], 4),
      daiChiTietCol: findColByHeader(steelHeader, ['dài chi tiết'], 5),
      dayPhoiCol: findColByHeader(steelHeader, ['dày phôi'], 6),
      loaiKhungCol: findColByHeader(steelHeader, ['loại khung'], 7),
      klRiengCol: findColByHeader(steelHeader, ['kl riêng'], 8),
      loaiPhoiCol: findColByHeader(steelHeader, ['loại phôi'], 9),
      loaiChiTietCol: findColByHeader(steelHeader, ['loại chi tiết'], 20)
    }
  };
}

function findRowIndex(rows, predicate, fromRow = 0) {
  for (let r = fromRow; r < rows.length; r++) {
    if (predicate(rows[r] ?? [])) return { r };
  }
  return null;
}

function findColByHeader(headerRow, labels, fallback = -1) {
  const row = headerRow ?? [];
  for (let c = 0; c < row.length; c++) {
    if (labels.includes(normText(row[c]))) return c;
  }
  return fallback;
}

// ── Cụm / Chi tiết derivation ───────────────────────────────────────────────
// A component is a "Cụm" only if some other row's code is a child of its own
// (e.g. "1" is the parent of "1.1", "1.2"...).
function markLoai(parts) {
  for (const p of parts) {
    const prefix = p.code != null ? `${p.code}.` : null;
    const hasChild = prefix != null && parts.some(other => other.code?.startsWith(prefix));
    p.loai = hasChild ? 'Cụm' : 'Chi Tiết';
  }
}

// ── Wood parts parser (Phần I) ──────────────────────────────────────────────
function parseWoodParts(rows) {
  const { wood: L } = detectLayout(rows);
  if (L.dataStartRow < 0) throw new Error('Could not find wood parts table ("Tên chi tiết" header).');

  const parts = [];

  for (let r = L.dataStartRow; r < L.dataEndRow; r++) {
    const row = rows[r] ?? [];
    const name = row[L.nameCol];
    if (name == null || name === '') continue;

    parts.push({
      code: fmtCode(row[L.codeCol]),
      name,
      sl: row[L.slCol],
      dayTinh: row[L.dayTinhCol],
      rongTinh: row[L.rongTinhCol],
      daiTinh: row[L.daiTinhCol],
      mong: row[L.mongCol],
      loaiChiTiet: L.loaiChiTietCol >= 0 ? row[L.loaiChiTietCol] : null,
      ghiChu: joinNotes(
        L.preGhiChuCol >= 0 ? row[L.preGhiChuCol] : null,
        L.ghiChuCol >= 0 ? row[L.ghiChuCol] : null
      )
    });
  }

  markLoai(parts);
  return parts;
}

function joinNotes(a, b) {
  const notes = [a, b]
    .map(v => (v == null || v === '' ? '' : String(v).trim()))
    .filter(v => v !== '');

  return notes.length ? notes.join(', ') : null;
}

// Sắt has no dedicated name/notes split — its Tên carries the parenthesized
// detail inline, e.g. "Đế chân (cong, Ø580, ...)". Splitting on "(" separates
// the plain name ("Đế chân") from the Ghi chú ("cong, Ø580, ...").
function splitSteelName(name) {
  const parts = String(name ?? '').split('(');
  if (parts.length < 2) return { name: parts[0].trim(), ghiChu: null };

  let ghiChu = parts.slice(1).join('(').trim();
  if (ghiChu.endsWith(')')) ghiChu = ghiChu.slice(0, -1).trim();

  return { name: parts[0].trim(), ghiChu: ghiChu || null };
}

// ── Steel parts parser (Phần II) ────────────────────────────────────────────
function parseSteelParts(rows) {
  const { steel: L } = detectLayout(rows);
  if (L.dataStartRow < 0) throw new Error('Could not find steel parts table ("PHẦN SẮT" header).');

  const parts = [];

  for (let r = L.dataStartRow; r < L.dataEndRow; r++) {
    const row = rows[r] ?? [];
    const rawName = row[L.nameCol];
    if (rawName == null || rawName === '') continue;

    const { name, ghiChu } = splitSteelName(rawName);

    parts.push({
      code: fmtCode(row[L.codeCol]),
      name,
      sl: row[L.slCol],
      diaRongHop: row[L.diaRongHopCol],
      diaDaiHop: row[L.diaDaiHopCol],
      daiChiTiet: row[L.daiChiTietCol],
      dayPhoi: row[L.dayPhoiCol],
      loaiKhung: row[L.loaiKhungCol],
      klRieng: row[L.klRiengCol],
      loaiPhoi: row[L.loaiPhoiCol],
      loaiChiTiet: L.loaiChiTietCol >= 0 ? row[L.loaiChiTietCol] : null,
      ghiChu
    });
  }

  markLoai(parts);
  return parts;
}

// ── Workbook factory ────────────────────────────────────────────────────────
function createWorkbook() {
  const wb = XLSX.utils.book_new();

  const bomAoa = [
    ['Tên', 'Mã', 'Dài', 'Rộng', 'Cao', 'Khối lượng', 'Diện tích bề mặt'],
    [],
    [],
    [],
    [],
    [
      'Tên',
      'Mã',
      'Mô Tả',
      'Loại',
      'Loại chi tiết',
      'Số Lượng',
      'Dia/rộng hộp',
      'Dia/dài hộp',
      'Dài chi tiết',
      'Dày Phôi',
      'loại khung',
      'Loại Phôi',
      'Khối lượng',
      'Diện tích bề mặt',
      'KLR'
    ]
  ];

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(bomAoa),
    'bom'
  );

  return wb;
}

// ── Per-unit weight/area calculators (mirror the source workbook's formulas,
// minus the quantity multiplier — those give per-line totals, we want per-unit) ──
function round(v, digits) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function steelKhoiLuong(p) {
  const D = Number(p.diaRongHop) || 0;
  const E = Number(p.diaDaiHop) || 0;
  const F = Number(p.daiChiTiet) || 0;
  const G = Number(p.dayPhoi) || 0;
  const I = Number(p.klRieng) || 0;
  const loai = normText(p.loaiPhoi);

  if (loai === 'hộp' || loai === 'vuông') return (D + (E - G)) * 2 * F * G * I / 1e9;
  if (loai === 'la dẹt') return (D + (E - G)) * F * G * I / 1e9;
  if (loai === 'ống') return 3.14 * D * F * G * I / 1e9;
  if (loai === 'tròn đặc') return 3.14 * (D / 2) * (F / 2) * G * I / 1e9;
  if (loai === 'v') return (D + E) * F * I / 1e9;
  return 0;
}

function steelDienTich(p) {
  const D = Number(p.diaRongHop) || 0;
  const F = Number(p.daiChiTiet) || 0;
  const E = Number(p.diaDaiHop) || 0;
  const loai = normText(p.loaiPhoi);

  if (loai === 'vuông' || loai === 'hộp' || loai === 'la dẹt') return (D + E) * 2 * F / 1e6;
  return 3.14 * D * F / 1e6;
}

// ── Sheet filler ────────────────────────────────────────────────────────────
function fillBom(ws, prod, parts, material) {
  setCell(ws, 2, 1, prod.name);
  setCell(ws, 2, 2, prod.code);
  setCell(ws, 2, 3, prod.dai);
  setCell(ws, 2, 4, prod.rong);
  setCell(ws, 2, 5, prod.cao);

  const included = parts.filter(p => p.code != null);
  const rowOf = new Map();
  let wr = 7;
  for (const p of included) rowOf.set(p, wr++);

  // Leaf ("Chi Tiết") rows: per-unit mass/area straight from geometry.
  // "Cụm" rows have no geometry of their own — their per-unit mass is the
  // sum of their direct children's (per-unit mass × child SL).
  const directChildren = new Map();
  for (const p of included) {
    if (p.loai !== 'Cụm') continue;
    const prefix = `${p.code}.`;
    const children = included.filter(o => {
      if (!o.code?.startsWith(prefix)) return false;
      const rest = o.code.slice(prefix.length);
      return !rest.includes('.'); // direct child only, not grandchild
    });
    directChildren.set(p, children);
  }

  const khoiValue = new Map();
  const dtBmValue = new Map();

  for (const p of included) {
    if (p.loai === 'Cụm') continue;

    if (material === 'go') {
      const day = Number(p.dayTinh) || 0;
      const rong = Number(p.rongTinh) || 0;
      const dai = Number(p.daiTinh) || 0;
      const mong = Number(p.mong) || 0;
      khoiValue.set(p, round(day * rong * (dai + mong) / 1e9, 5));
      dtBmValue.set(p, round(2 * (day + rong) * (dai + mong) / 1e6, 4));
    } else {
      khoiValue.set(p, steelKhoiLuong(p));
      dtBmValue.set(p, steelDienTich(p));
    }
  }

  // A child's own SL is already the total count across the whole product
  // (e.g. "Chân trước" SL=2 means 2 legs in the whole chair), independent of
  // how many times its parent Cụm repeats. So a Cụm's per-instance mass
  // divides the child's SL back down by the Cụm's own SL to get the
  // per-single-assembly child count. Process deepest Cụm rows first (by code
  // depth) so a Cụm-of-Cụm ("1.1" containing "1.1.1"…) already has its
  // children's aggregated values ready before its own parent needs them.
  const cumRows = included
    .filter(p => p.loai === 'Cụm')
    .sort((a, b) => b.code.split('.').length - a.code.split('.').length);

  for (const p of cumRows) {
    const children = directChildren.get(p) ?? [];
    const cumSl = Number(p.sl) || 1;
    khoiValue.set(p, children.reduce((sum, c) => sum + khoiValue.get(c) * ((Number(c.sl) || 0) / cumSl), 0));
    dtBmValue.set(p, children.reduce((sum, c) => sum + dtBmValue.get(c) * ((Number(c.sl) || 0) / cumSl), 0));
  }

  for (const p of included) {
    const r = rowOf.get(p);

    setCell(ws, r, 1, p.name);
    setCell(ws, r, 2, p.code);
    setCell(ws, r, 3, p.ghiChu);
    setCell(ws, r, 4, p.loai);
    setCell(ws, r, 5, p.loaiChiTiet);
    setCell(ws, r, 6, p.sl);

    if (material === 'go') {
      setCell(ws, r, 7, p.rongTinh);
      setCell(ws, r, 8, p.dayTinh);
      setCell(ws, r, 9, p.daiTinh);
      setCell(ws, r, 10, p.mong);
      setCell(ws, r, 11, prod.loaiGo);
    } else {
      setCell(ws, r, 7, p.diaRongHop);
      setCell(ws, r, 8, p.diaDaiHop);
      setCell(ws, r, 9, p.daiChiTiet);
      setCell(ws, r, 10, p.dayPhoi);
      setCell(ws, r, 11, p.loaiKhung);
      setCell(ws, r, 12, p.loaiPhoi);
      setCell(ws, r, 15, p.klRieng);
    }

    if (p.loai === 'Cụm') {
      const children = directChildren.get(p) ?? [];
      const rowRefs = children.map(c => rowOf.get(c));
      const cumSlRef = `F${r}`;

      if (rowRefs.length) {
        setFormula(ws, r, 13, rowRefs.map(cr => `M${cr}*F${cr}/${cumSlRef}`).join('+'), khoiValue.get(p));
        setFormula(ws, r, 14, rowRefs.map(cr => `N${cr}*F${cr}/${cumSlRef}`).join('+'), dtBmValue.get(p));
      } else {
        setCell(ws, r, 13, 0);
        setCell(ws, r, 14, 0);
      }
    } else if (material === 'go') {
      setFormula(ws, r, 13, `ROUND(H${r}*G${r}*(I${r}+J${r})/10^9,5)`, khoiValue.get(p));
      setFormula(ws, r, 14, `ROUND(2*(H${r}+G${r})*(I${r}+J${r})/10^6,4)`, dtBmValue.get(p));
    } else {
      setFormula(
        ws, r, 13,
        `IF(OR($L${r}="hộp",$L${r}="vuông"),(G${r}+(H${r}-J${r}))*2*I${r}*J${r}*O${r}/10^9,` +
        `IF($L${r}="la dẹt",(G${r}+(H${r}-J${r}))*I${r}*J${r}*O${r}/10^9,` +
        `IF($L${r}="ống",3.14*G${r}*I${r}*J${r}*O${r}/10^9,` +
        `IF($L${r}="tròn đặc",3.14*G${r}/2*I${r}/2*J${r}*O${r}/10^9,` +
        `IF($L${r}="V",(G${r}+H${r})*I${r}*O${r}/10^9)))))`,
        khoiValue.get(p)
      );
      setFormula(
        ws, r, 14,
        `IF(OR($L${r}="vuông",$L${r}="hộp",$L${r}="la dẹt"),(G${r}+H${r})*2*I${r}/10^6,3.14*G${r}*I${r}/10^6)`,
        dtBmValue.get(p)
      );
    }
  }

  // Product total = Σ(top-level row mass × top-level row SL). Top-level
  // codes ("1", "2", "3"… with no dot) are the assemblies/parts that go
  // directly into one product; a Cụm's own mass already folds in all of its
  // descendants at any depth, so summing only top-level rows (instead of
  // every leaf) avoids double-counting while still covering the whole tree.
  const topLevel = included.filter(p => p.code != null && !p.code.includes('.'));

  if (topLevel.length) {
    const rowRefs = topLevel.map(p => rowOf.get(p));
    const khoiSum = topLevel.reduce((sum, p) => sum + khoiValue.get(p) * (Number(p.sl) || 0), 0);
    const dtBmSum = topLevel.reduce((sum, p) => sum + dtBmValue.get(p) * (Number(p.sl) || 0), 0);

    setFormula(ws, 2, 6, rowRefs.map(r => `M${r}*F${r}`).join('+'), khoiSum);
    setFormula(ws, 2, 7, rowRefs.map(r => `N${r}*F${r}`).join('+'), dtBmSum);
  } else {
    setCell(ws, 2, 6, 0);
    setCell(ws, 2, 7, 0);
  }
}

// ── Low-level cell writers ──────────────────────────────────────────────────
function setCell(ws, r1, c1, value) {
  const addr = XLSX.utils.encode_cell({
    r: r1 - 1,
    c: c1 - 1
  });

  if (value == null || value === '') {
    delete ws[addr];
    return;
  }

  ws[addr] = {
    v: value,
    t: typeof value === 'number' ? 'n' : 's'
  };

  growRange(ws, r1, c1);
}

function setFormula(ws, r1, c1, formula, cachedValue) {
  const addr = XLSX.utils.encode_cell({
    r: r1 - 1,
    c: c1 - 1
  });

  // A cached value must ship alongside the formula: xlsx.js prunes
  // formula-only cells (no "v") when writing the file.
  ws[addr] = { t: 'n', v: isFinite(cachedValue) ? cachedValue : 0, f: formula };

  growRange(ws, r1, c1);
}

function growRange(ws, r1, c1) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

  if (r1 - 1 > range.e.r) range.e.r = r1 - 1;
  if (c1 - 1 > range.e.c) range.e.c = c1 - 1;

  ws['!ref'] = XLSX.utils.encode_range(range);
}

// ── Status helper ───────────────────────────────────────────────────────────
function setStatus(text, type = '') {
  statusMsg.textContent = text;
  statusMsg.className = 'status-msg' + (type ? ' ' + type : '');
}
