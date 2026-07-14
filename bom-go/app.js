// ── Constants ────────────────────────────────────────────────────────────────
const STEP_WIDTH = 4; // name, Hệ số, Định mức, Thời gian
const DEFAULT_DATA_START_ROW = 19;

// Step names live in the "NHÓM CÔNG ĐOẠN" column of "Bảng tra V2", starting
// the row after that header.
const CD_SHEET_NAME = 'Bảng tra V2';
const CD_STEP_HEADER = 'nhóm công đoạn';

let CD_STEPS = [];
let CD_STEP_COL = {};

function normalizeStepName(s) {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractSteps(rows, startRow, col) {
  const seen = new Set();
  const steps = [];

  for (let r = startRow; r < rows.length; r++) {
    const raw = rows[r]?.[col];
    if (raw == null || raw === '') continue;

    const name = String(raw).replace(/\s+/g, ' ').trim();
    const key = normalizeStepName(name);
    if (seen.has(key)) continue;

    seen.add(key);
    steps.push(name);
  }

  return steps;
}

function loadStepsFromWorkbook(wb) {
  const ws = wb.Sheets[CD_SHEET_NAME];
  if (!ws) throw new Error(`Sheet "${CD_SHEET_NAME}" not found in input file.`);

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const headerRow = rows.find(row => (row ?? []).some(v => normText(v) === CD_STEP_HEADER));
  const headerRowIdx = rows.indexOf(headerRow);

  if (headerRowIdx < 0) {
    throw new Error(`Could not find "NHÓM CÔNG ĐOẠN" column in sheet "${CD_SHEET_NAME}".`);
  }

  const stepCol = headerRow.findIndex(v => normText(v) === CD_STEP_HEADER);
  const steps = extractSteps(rows, headerRowIdx + 1, stepCol);

  if (steps.length === 0) throw new Error(`No steps found in sheet "${CD_SHEET_NAME}".`);

  CD_STEPS = steps;
  CD_STEP_COL = Object.fromEntries(
    CD_STEPS.map((name, i) => [normalizeStepName(name), i + 5])
  );
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
    const parts = parseParts(rows, srcSheet);
    const wb = createWorkbook();

    fillBom(wb.Sheets['bom'], prod, parts);
    fillBomCongDoan(wb.Sheets['BOM_lay_cong_doan'], prod, parts);

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

function cellText(v) {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findCell(rows, predicate, maxRows = 100, maxCols = 250) {
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
function detectLayout(rows) {
  const dataStartRow = findDataStartRow(rows);
  const headerRowIdx = findHeaderRowIdx(rows, dataStartRow);
  const headerRow = rows[headerRowIdx] ?? [];

  let ttCol = -1;

  for (let c = 0; c < headerRow.length; c++) {
    const t = normText(headerRow[c]);
    if (t === 'tt' || t === 'stt') {
      ttCol = c;
      break;
    }
  }

  // Scan from the first data row, not row 0 — process-group header labels
  // above the data (e.g. "Ghép" as a section title) can coincidentally match
  // a real step name. Take the minimum matching column across several data
  // rows, since any single row may be missing its earliest step blocks.
  let stepStartCol = -1;

  for (let r = dataStartRow - 1; r < Math.min(rows.length, dataStartRow + 39); r++) {
    const row = rows[r] ?? [];

    for (let c = 0; c < row.length; c++) {
      if (lookupStep(cellText(row[c]))) {
        if (stepStartCol < 0 || c < stepStartCol) stepStartCol = c;
        break;
      }
    }
  }

  if (stepStartCol < 0) {
    throw new Error('Could not detect first step column.');
  }

  let ghiChuCol = -1;

  for (let c = 0; c < headerRow.length; c++) {
    if (normText(headerRow[c]) === 'ghi chú') {
      ghiChuCol = c;
      break;
    }
  }

  const preGhiChuCol = ghiChuCol > 0 ? ghiChuCol - 1 : -1;

  let cumAttrCol = -1;

  for (let c = 0; c < headerRow.length; c++) {
    if (normText(headerRow[c]).startsWith('thuộc tính cụm')) {
      cumAttrCol = c;
      break;
    }
  }

  let maCumChiTietCol = -1;

  for (let c = 0; c < headerRow.length; c++) {
    if (normText(headerRow[c]).startsWith('mã cụm')) {
      maCumChiTietCol = c;
      break;
    }
  }

  return {
    dataStartRow,
    ttCol,
    stepStartCol,
    ghiChuCol,
    preGhiChuCol,
    cumAttrCol,
    maCumChiTietCol
  };
}

function findDataStartRow(rows) {
  let headerRow = -1;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? [];

    if (
      normText(row[0]) === 'stt' &&
      normText(row[1]).includes('tên chi tiết')
    ) {
      headerRow = r;
      break;
    }
  }

  if (headerRow >= 0) {
    for (let r = headerRow + 1; r < Math.min(rows.length, headerRow + 20); r++) {
      if (Number(rows[r]?.[0]) === 1 && rows[r]?.[1] != null) {
        return r + 1;
      }
    }
  }

  for (let r = 0; r < rows.length; r++) {
    if (Number(rows[r]?.[0]) === 1 && rows[r]?.[1] != null) {
      return r + 1;
    }
  }

  return DEFAULT_DATA_START_ROW;
}

function findHeaderRowIdx(rows, dataStartRow) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? [];

    if (
      normText(row[0]) === 'stt' &&
      normText(row[1]).includes('tên chi tiết')
    ) {
      return r;
    }
  }

  return Math.max(0, dataStartRow - 2);
}

// ── Parts parser ────────────────────────────────────────────────────────────
function parseParts(rows, srcSheet) {
  const parts = [];
  const layout = detectLayout(rows);

  const startRow = layout.dataStartRow;
  const stepStartCol = layout.stepStartCol;
  const codeCol = layout.ttCol;
  const ghiChuCol = layout.ghiChuCol >= 0 ? layout.ghiChuCol : 13;
  const preGhiChuCol = layout.preGhiChuCol >= 0 ? layout.preGhiChuCol : 12;
  const cumAttrCol = layout.cumAttrCol;
  const maCumChiTietCol = layout.maCumChiTietCol;

  for (let r = startRow - 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const name = row[1];

    if (name == null || name === '') continue;

    // The wood-parts table ends at its "Quy cách phôi" (N. Liệu) stock-cut
    // row, immediately followed by "Tổng KL Tinh/Thô" totals, then steel
    // parts and hardware/screws tables — none of which are wood components.
    if (
      normText(row[0]) === 'n. liệu' ||
      normText(name).startsWith('tổng kl tinh')
    ) {
      break;
    }

    const code = codeCol >= 0 ? fmtCode(row[codeCol]) : null;
    const maCumChiTiet = maCumChiTietCol >= 0 ? fmtCode(row[maCumChiTietCol]) : null;
    const steps = [];

    // IMPORTANT:
    // no fixed NUM_STEPS limit.
    // This reaches far columns like FC in sheet 3A (2).
    for (let cs = stepStartCol; cs < row.length; cs += STEP_WIDTH) {
      const sname = row[cs];
      const stime = row[cs + 3];

      if (
        sname &&
        typeof sname === 'string' &&
        stime != null &&
        stime !== ''
      ) {
        steps.push([sname.trim(), stime]);
      }
    }

    parts.push({
      code,
      maCumChiTiet,
      name,

      sl: row[2],
      day_tho: getDisplayCellValue(srcSheet, r + 1, 10),
      rong_tho: row[7],
      dai_tho: row[6],
      dai_tinh: row[8],
      khoi: row[10],
      dt_bm: row[11],
      cum_attr: cumAttrCol >= 0 ? row[cumAttrCol] : null,
      pre_ghi_chu: row[preGhiChuCol],
      ghi_chu: row[ghiChuCol],

      steps
    });
  }

  // A component is a "Cụm" only if some other row's "MÃ CỤM - CHI TIẾT" is a
  // child of its own (e.g. "1" is the parent of "1.1", "1.2"...).
  for (const p of parts) {
    const prefix = p.maCumChiTiet != null ? `${p.maCumChiTiet}.` : null;
    const hasChild = prefix != null && parts.some(other => other.maCumChiTiet?.startsWith(prefix));
    p.loai = hasChild ? 'Cụm' : 'Chi Tiết';
  }

  return parts;
}

function getDisplayCellValue(ws, r1, c1) {
  const cell = ws?.[XLSX.utils.encode_cell({ r: r1 - 1, c: c1 - 1 })];

  if (!cell) return null;

  return cell.w ?? XLSX.utils.format_cell(cell) ?? cell.v ?? null;
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

  const cdRow6 = [null, 'Tên', 'Mã', 'CÔNG ĐOẠN', ...CD_STEPS];

  const cdAoa = [
    ['Chú thích: Định dạng hợp lệ X-X-X-X (vd: 60-20-1-1)'],
    ['LSX:', 'KINGSTON-XƯỞNG GỖ\nBOM CÔNG ĐOẠN'],
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

  let wr = 7;
  let khoiSum = 0;
  let dtBmSum = 0;

  for (const p of parts) {
    if (p.code == null) continue;

    setCell(ws, wr, 1, p.name);
    setCell(ws, wr, 2, p.maCumChiTiet);
    setCell(ws, wr, 3, moTa(p.pre_ghi_chu, p.ghi_chu));
    setCell(ws, wr, 4, p.loai);
    setCell(ws, wr, 5, p.cum_attr);
    setCell(ws, wr, 6, p.sl);
    setCell(ws, wr, 7, p.rong_tho);
    setCell(ws, wr, 8, p.dai_tho);
    setCell(ws, wr, 9, p.dai_tinh);
    setCell(ws, wr, 10, p.day_tho);
    setCell(ws, wr, 11, prod.loaiGo);
    setCell(ws, wr, 13, p.khoi);
    setCell(ws, wr, 14, p.dt_bm);

    // Only first-order components ("1", "2", "3"…, not "1.1", "2.3"…)
    // count toward the product totals — their sub-components are already
    // part of them.
    if (p.maCumChiTiet != null && !p.maCumChiTiet.includes('.')) {
      if (isFinite(Number(p.khoi))) khoiSum += Number(p.khoi);
      if (isFinite(Number(p.dt_bm))) dtBmSum += Number(p.dt_bm);
    }

    wr++;
  }

  setCell(ws, 2, 6, khoiSum);
  setCell(ws, 2, 7, dtBmSum);
}

function moTa(preGhiChu, ghiChu) {
  const a = preGhiChu == null || preGhiChu === '' ? '' : String(preGhiChu).trim();
  const b = ghiChu == null || ghiChu === '' ? '' : String(ghiChu).trim();

  if (a === '' && b === '') return null;
  return `${a}_${b}`;
}

function fillBomCongDoan(ws, prod, parts) {
  setCell(ws, 5, 2, prod.name);

  let wr = 7;

  setCell(ws, wr, 1, 'Sản phẩm');
  setCell(ws, wr, 2, prod.name);
  setCell(ws, wr, 3, prod.code);
  wr++;

  for (const p of parts) {
    if (p.code == null) continue;

    const sl = p.sl ?? 1;

    setCell(ws, wr, 1, p.loai === 'Cụm' ? 'Cụm' : 'Chi tiết');
    setCell(ws, wr, 2, p.name);
    setCell(ws, wr, 3, p.maCumChiTiet);

    const validSteps = p.steps.filter(([sname]) => lookupStep(sname));
    const total = validSteps.length;

    validSteps.forEach(([sname, stime], idx) => {
      const order = idx + 1;
      const isLast = order === total ? 1 : 0;

      let t = Math.round(Number(stime));
      if (!isFinite(t)) t = 0;

      const col = lookupStep(sname);
      if (!col) return;

      setCell(ws, wr, col, `${t}-${sl}-${order}-${isLast}`);
    });

    wr++;
  }
}

// ── Step lookup ─────────────────────────────────────────────────────────────
function lookupStep(sname) {
  return CD_STEP_COL[normalizeStepName(sname)] ?? null;
}

// ── Low-level cell writer ───────────────────────────────────────────────────
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