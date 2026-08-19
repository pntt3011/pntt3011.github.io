// ── Constants ────────────────────────────────────────────────────────────────
const STEP_WIDTH = 3; // name, Thời gian, Số lượng/mẻ

// Step names live in column A of the "Công đoạn" sheet, one per row, no header.
const CD_SHEET_NAME = 'Công đoạn';

let CD_STEPS = [];

function normalizeStepName(s) {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function loadStepsFromWorkbook(wb) {
  const ws = wb.Sheets[CD_SHEET_NAME];
  if (!ws) throw new Error(`Sheet "${CD_SHEET_NAME}" not found in input file.`);

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const seen = new Set();
  const steps = [];

  for (const row of rows) {
    const raw = row?.[0];
    if (raw == null || raw === '') continue;

    const name = String(raw).replace(/\s+/g, ' ').trim();
    const key = normalizeStepName(name);
    if (seen.has(key)) continue;

    seen.add(key);
    steps.push(name);
  }

  if (steps.length === 0) throw new Error(`No steps found in sheet "${CD_SHEET_NAME}".`);

  steps.reverse();

  CD_STEPS = steps;
}

// ── DOM refs ─────────────────────────────────────────────────────────────────
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const sheetSelect = document.getElementById('sheetSelect');
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
      loadStepsFromWorkbook(workbook);
      populateSheets(workbook.SheetNames.filter(n => n !== CD_SHEET_NAME));
      fileName.textContent = file.name;
      dropZone.classList.add('has-file');
      setStatus(`Loaded ${CD_STEPS.length} steps from "${CD_SHEET_NAME}".`);
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

// ── Parse button ─────────────────────────────────────────────────────────────
parseBtn.addEventListener('click', () => {
  if (!workbook) return;

  setStatus('Parsing…');
  parseBtn.disabled = true;

  try {
    const srcSheet = workbook.Sheets[sheetSelect.value];
    const rows = XLSX.utils.sheet_to_json(srcSheet, {
      header: 1,
      defval: null
    });

    const prod = parseProduct(rows);
    const parts = parseParts(rows);
    const usedSteps = CD_STEPS.filter(name =>
      parts.some(p => p.steps.some(([sname]) => normalizeStepName(sname) === normalizeStepName(name)))
    );
    const wb = createWorkbook(usedSteps);

    fillBom(wb.Sheets['bom'], prod, parts);
    fillBomCongDoan(wb.Sheets['BOM_lay_cong_doan'], prod, parts, usedSteps);

    XLSX.writeFile(wb, `${sheetSelect.value}.xlsx`);
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
    cao
  };
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
// The "PHẦN SẮT" table has its own header row (starting "PHẦN SẮT..." in
// column B), a "Công đoạn" label further right whose position varies sheet to
// sheet, and ends at "Cộng - TOTAL".
function detectLayout(rows) {
  const headerRow = findRowIndex(rows, row =>
    normText(row?.[1]).startsWith('phần sắt')
  );
  if (!headerRow) throw new Error('Could not find steel parts table ("PHẦN SẮT" header).');

  const headerIdx = headerRow.r;
  const header = rows[headerIdx] ?? [];

  const endIdx = findRowIndex(rows, row =>
    normText(row?.[1]).startsWith('cộng'), headerIdx + 1
  )?.r ?? rows.length;

  let cdCol = -1;
  for (let c = 0; c < header.length; c++) {
    if (normText(header[c]) === 'công đoạn') { cdCol = c; break; }
  }
  if (cdCol < 0) throw new Error('Could not find "Công đoạn" column in the "PHẦN SẮT" table.');

  return {
    dataStartRow: headerIdx + 1,
    dataEndRow: endIdx,
    codeCol: 0,
    nameCol: 1,
    slCol: findColByHeader(header, ['số lượng'], 2),
    diaRongHopCol: findColByHeader(header, ['dia/rộng hộp'], 3),
    diaDaiHopCol: findColByHeader(header, ['dia/dài hộp'], 4),
    daiChiTietCol: findColByHeader(header, ['dài chi tiết'], 5),
    dayPhoiCol: findColByHeader(header, ['dày phôi'], 6),
    loaiKhungCol: findColByHeader(header, ['loại khung'], 7),
    klRiengCol: findColByHeader(header, ['kl riêng'], 8),
    loaiPhoiCol: findColByHeader(header, ['loại phôi'], 9),
    loaiChiTietCol: findColByHeader(header, ['loại chi tiết'], 20),
    stepStartCol: cdCol
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

// ── Parts parser ────────────────────────────────────────────────────────────
function parseParts(rows) {
  const L = detectLayout(rows);
  const parts = [];

  for (let r = L.dataStartRow; r < L.dataEndRow; r++) {
    const row = rows[r] ?? [];
    const rawName = row[L.nameCol];
    if (rawName == null || rawName === '') continue;

    const { name, ghiChu } = splitSteelName(rawName);
    const steps = [];

    for (let cs = L.stepStartCol; cs < row.length; cs += STEP_WIDTH) {
      const sname = row[cs];
      const stime = row[cs + 1];
      const sbatch = row[cs + 2];

      if (!sname || typeof sname !== 'string') continue;

      // Synthetic steps (Xử-lý, Sơn-tĩnh-điện, Kiểm khung, Hàn Sắt, Cắt, Ép,
      // Uốn) are named in the sheet but left with a blank time/batch — those
      // get computed later from the part's geometry, so they're kept here
      // instead of being dropped.
      const isSynthetic = isSyntheticStepName(sname);

      if (stime != null && stime !== '') {
        steps.push([sname.trim(), stime, sbatch]);
      } else if (isSynthetic) {
        steps.push([sname.trim(), null, sbatch]);
      }
    }

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
      ghiChu,
      steps
    });
  }

  // A component is a "Cụm" only if some other row's code is a child of its
  // own (e.g. "1" is the parent of "1.1", "1.2"...).
  for (const p of parts) {
    const prefix = p.code != null ? `${p.code}.` : null;
    const hasChild = prefix != null && parts.some(other => other.code?.startsWith(prefix));
    p.loai = hasChild ? 'Cụm' : 'Chi Tiết';
  }

  return parts;
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

// Per-unit mass for every part (Chi Tiết straight from geometry, Cụm as the
// sum of its direct children's per-unit mass × child SL, divided back down
// by its own SL). Shared by fillBom (mass column) and fillBomCongDoan (the
// weight factor behind synthetic Xử-lý / Sơn-tĩnh-điện steps).
function computeKhoiValues(parts) {
  const included = parts.filter(p => p.code != null);

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
    khoiValue.set(p, steelKhoiLuong(p));
    dtBmValue.set(p, steelDienTich(p));
  }

  const cumRows = included
    .filter(p => p.loai === 'Cụm')
    .sort((a, b) => b.code.split('.').length - a.code.split('.').length);

  for (const p of cumRows) {
    const children = directChildren.get(p) ?? [];
    const cumSl = Number(p.sl) || 1;
    khoiValue.set(p, children.reduce((sum, c) => sum + khoiValue.get(c) * ((Number(c.sl) || 0) / cumSl), 0));
    dtBmValue.set(p, children.reduce((sum, c) => sum + dtBmValue.get(c) * ((Number(c.sl) || 0) / cumSl), 0));
  }

  return { khoiValue, dtBmValue, directChildren };
}

// ── Synthetic công đoạn steps ────────────────────────────────────────────────
// A handful of công đoạn have a regression formula (against the part's own
// per-unit Khối lượng / Diện tích bề mặt / cut perimeter) instead of a fixed
// time in the source sheet. The source sheet names the step but leaves
// time/batch blank for these; the parser keeps them (see isSyntheticStepName)
// and fillBomCongDoan computes the time from WORKSTEP_FACTOR below.
// Batch size is fixed at 1 for all of them.

// "Loại chi tiết" values like "Cụm đan Sắt" / "Trần nhôm" mark a part as
// needing surface treatment: Xử-lý (material-only factor) and Sơn-tĩnh-điện
// (material × đan/trần factor).
const WORKSTEP_FACTOR = {
  'trần nhôm': { xuLy: 10.53, sonTinhDien: 14.75 },
  'đan nhôm': { xuLy: 10.53, sonTinhDien: 14.75 },
  'trần sắt': { xuLy: 5.4, sonTinhDien: 5.04 },
  'đan sắt': { xuLy: 5.4, sonTinhDien: 5.04 }
};

// Kiểm khung: linear in Khối lượng, factor picked by material only (đan/trần
// doesn't matter here).
const KIEM_KHUNG_FACTOR = {
  'sắt': { weight: 64.78, base: 113.59 },
  'nhôm': { weight: 63.59, base: 77.70 }
};

// Hàn Mig (Sắt) / Hàn Laser Sắt: linear in Khối lượng + Diện tích bề mặt.
// Hàn Robot (Sắt) is intentionally excluded — stays manual.
const HAN_SAT_FACTOR = { weight: 44.10, area: 60.39, base: 74.72 };

// Cắt CNC / Cắt cơ: linear in cut area (mm²): Rộng×Dài for box-like
// profiles, π*(Rộng/2)² for round ones (Ống/Tròn đặc).
const CAT_AREA_FACTOR = {
  'cắt cnc': { area: 0.0516, base: -9.23 },
  'cắt cơ': { area: 0.0335, base: 5.40 }
};

// Cắt lazer Pát / Ép cong: flat average time, no part inputs.
const CAT_FLAT_FACTOR = {
  'cắt lazer pát': 22.69,
  'ép cong': 6.1
};

// Cắt laser: linear in Dài chi tiết (mm).
const CAT_LASER_FACTOR = { daiChiTiet: 0.0219, base: 11.12 };

// Uốn (all variants): linear in Rộng*Dày² + Dài chi tiết.
const UON_FACTOR = { rongDay2: 4.45, daiChiTiet: 0.037, base: 91 };

function danTranMatFactor(loaiChiTiet) {
  const t = normText(loaiChiTiet);
  const dan = t.includes('đan');
  const tran = t.includes('trần');
  if (!dan && !tran) return null;

  const sat = t.includes('sắt');
  const nhom = t.includes('nhôm');
  if (!sat && !nhom) return null;

  const key = `${dan ? 'đan' : 'trần'} ${sat ? 'sắt' : 'nhôm'}`;
  return { ...WORKSTEP_FACTOR[key], material: sat ? 'Sắt' : 'Nhôm' };
}

function materialOf(loaiChiTiet) {
  const t = normText(loaiChiTiet);
  if (t.includes('sắt')) return 'sắt';
  if (t.includes('nhôm')) return 'nhôm';
  return null;
}

function isXuLyStepName(sname) {
  return /^xử.?lý/i.test(normText(sname));
}

function isSonTinhDienStepName(sname) {
  return normText(sname) === 'sơn-tĩnh-điện' || normText(sname) === 'sơn tĩnh điện';
}

function isKiemKhungStepName(sname) {
  return normText(sname) === 'kiểm khung';
}

function isHanSatStepName(sname) {
  const t = normText(sname);
  return t === 'hàn mig (sắt)' || t === 'hàn laser sắt';
}

function catAreaFactor(sname) {
  return CAT_AREA_FACTOR[normText(sname)] ?? null;
}

function catFlatFactor(sname) {
  return CAT_FLAT_FACTOR[normText(sname)] ?? null;
}

function isCatLaserStepName(sname) {
  return normText(sname) === 'cắt laser';
}

function isUonStepName(sname) {
  return normText(sname).startsWith('uốn');
}

function isSyntheticStepName(sname) {
  return isXuLyStepName(sname) || isSonTinhDienStepName(sname) ||
    isKiemKhungStepName(sname) || isHanSatStepName(sname) || isUonStepName(sname) ||
    isCatLaserStepName(sname) ||
    catAreaFactor(sname) != null || catFlatFactor(sname) != null;
}

// Cross-section area (mm²) for Cắt CNC / Cắt cơ: Rộng×Dài for box-like
// profiles, π*(Rộng/2)² for round ones (Ống/Tròn đặc).
function steelCatArea(p) {
  const D = Number(p.diaRongHop) || 0;
  const E = Number(p.diaDaiHop) || 0;
  const loai = normText(p.loaiPhoi);

  if (loai === 'ống' || loai === 'tròn đặc') return 3.14 * (D / 2) ** 2;
  return D * E;
}

// ── Workbook factory ────────────────────────────────────────────────────────
function createWorkbook(usedSteps) {
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

  const cdRow6 = [null, 'Tên', 'Mã', 'CÔNG ĐOẠN', ...usedSteps];

  const cdAoa = [
    ['Chú thích: Định dạng hợp lệ X-X-X-X (vd: 60-20-1-1)'],
    ['LSX:', 'KINGSTON-XƯỞNG SẮT\nBOM CÔNG ĐOẠN'],
    [],
    ['CUST:'],
    ['Tên SP:'],
    cdRow6
  ];

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(cdAoa),
    'BOM_lay_cong_doan'
  );

  return wb;
}

// ── Sheet fillers ───────────────────────────────────────────────────────────
function fillBom(ws, prod, parts) {
  setCell(ws, 2, 1, prod.name);
  setCell(ws, 2, 2, prod.code);
  setCell(ws, 2, 3, prod.dai);
  setCell(ws, 2, 4, prod.rong);
  setCell(ws, 2, 5, prod.cao);

  const included = parts.filter(p => p.code != null);
  const rowOf = new Map();
  let wr = 7;
  for (const p of included) rowOf.set(p, wr++);

  const { khoiValue, dtBmValue, directChildren } = computeKhoiValues(parts);

  for (const p of included) {
    const r = rowOf.get(p);

    setCell(ws, r, 1, p.name);
    setCell(ws, r, 2, p.code);
    setCell(ws, r, 3, p.ghiChu);
    setCell(ws, r, 4, p.loai);
    setCell(ws, r, 5, p.loaiChiTiet);
    setCell(ws, r, 6, p.sl);
    setCell(ws, r, 7, p.diaRongHop);
    setCell(ws, r, 8, p.diaDaiHop);
    setCell(ws, r, 9, p.daiChiTiet);
    setCell(ws, r, 10, p.dayPhoi);
    setCell(ws, r, 11, p.loaiKhung);
    setCell(ws, r, 12, p.loaiPhoi);
    setCell(ws, r, 15, p.klRieng);

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

// Computes the (time, batch) pair for a synthetic step (blank time/batch in
// the source sheet) from the part's own geometry. Returns null if sname
// isn't one of the recognized synthetic steps or its required input (e.g.
// Loại chi tiết material) can't be determined — callers fall back to the
// sheet's own time/batch in that case.
function syntheticStepTime(sname, p, khoiValue, dtBmValue) {
  const weight = khoiValue.get(p) ?? 0;
  const area = dtBmValue.get(p) ?? 0;

  if (isXuLyStepName(sname) || isSonTinhDienStepName(sname)) {
    const factor = danTranMatFactor(p.loaiChiTiet);
    if (!factor) return null;
    const f = isXuLyStepName(sname) ? factor.xuLy : factor.sonTinhDien;
    return [Math.ceil(weight * f), 1];
  }

  if (isKiemKhungStepName(sname)) {
    const mat = materialOf(p.loaiChiTiet);
    if (!mat) return null;
    const f = KIEM_KHUNG_FACTOR[mat];
    return [Math.ceil(weight * f.weight + f.base), 1];
  }

  if (isHanSatStepName(sname)) {
    return [Math.ceil(weight * HAN_SAT_FACTOR.weight + area * HAN_SAT_FACTOR.area + HAN_SAT_FACTOR.base), 1];
  }

  const flat = catFlatFactor(sname);
  if (flat != null) return [Math.ceil(flat), 1];

  if (isCatLaserStepName(sname)) {
    const daiChiTiet = Number(p.daiChiTiet) || 0;
    return [Math.ceil(daiChiTiet * CAT_LASER_FACTOR.daiChiTiet + CAT_LASER_FACTOR.base), 1];
  }

  const areaFactor = catAreaFactor(sname);
  if (areaFactor) {
    const catArea = steelCatArea(p);
    return [Math.ceil(catArea * areaFactor.area + areaFactor.base), 1];
  }

  if (isUonStepName(sname)) {
    const rong = Number(p.diaRongHop) || 0;
    const day = Number(p.dayPhoi) || 0;
    const daiChiTiet = Number(p.daiChiTiet) || 0;
    const t = UON_FACTOR.base + UON_FACTOR.rongDay2 * (rong * day * day) + UON_FACTOR.daiChiTiet * daiChiTiet;
    return [Math.ceil(t), 1];
  }

  return null;
}

function fillBomCongDoan(ws, prod, parts, usedSteps) {
  setCell(ws, 5, 2, prod.name);

  const { khoiValue, dtBmValue } = computeKhoiValues(parts);
  const stepCol = Object.fromEntries(
    usedSteps.map((name, i) => [normalizeStepName(name), i + 5])
  );
  const lookupStep = sname => stepCol[normalizeStepName(sname)] ?? null;

  let wr = 7;

  setCell(ws, wr, 1, 'Sản phẩm');
  setCell(ws, wr, 2, prod.name);
  setCell(ws, wr, 3, prod.code);
  wr++;

  for (const p of parts) {
    if (p.code == null) continue;

    setCell(ws, wr, 1, p.loai === 'Cụm' ? 'Cụm' : 'Chi tiết');
    setCell(ws, wr, 2, p.name);
    setCell(ws, wr, 3, p.code);

    const validSteps = p.steps.filter(([sname]) => lookupStep(sname));
    const total = validSteps.length;

    validSteps.forEach(([sname, stime, sbatch], idx) => {
      const order = idx + 1;
      const isLast = order === total ? 1 : 0;
      const col = lookupStep(sname);
      if (!col) return;

      let t, sl;
      const synthetic = stime == null ? syntheticStepTime(sname, p, khoiValue, dtBmValue) : null;

      if (synthetic) {
        [t, sl] = synthetic;
      } else {
        t = Math.ceil(Number(stime));
        if (!isFinite(t)) t = 0;
        sl = Number(sbatch);
        if (!isFinite(sl)) sl = 0;
      }

      setCell(ws, wr, col, `${t}-${sl}-${order}-${isLast}`);
    });

    wr++;
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
