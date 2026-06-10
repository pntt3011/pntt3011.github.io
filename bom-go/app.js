// ── Constants ────────────────────────────────────────────────────────────────
const STEP_WIDTH = 5;
const NUM_STEPS = 25;
const DEFAULT_DATA_START_ROW = 19;

const CD_STEPS = [
  'Cắt ngang', 'Rong dọc', 'Vẽ rập', 'Lọng cong', 'Sấy 2QT',
  'Bào ghép 2M', 'Bào ghép 4M', 'Ghép finger', 'Ghép cao tầng', 'Ghép cảo',
  'Bào 2M', 'Tiện tròn', 'Tubi CNC', 'Tubi chép hình', 'Tubi tay',
  'Chà láng', 'Chuốt chốt', 'Bào 4M',
  '3D chống tâm', '3D kẹp lật',
  'Cắt tay (TC)', 'Cắt thẳng', 'Cắt xéo', 'Cắt router', 'Cắt finger',
  'CNC (+) 6 dao', 'CNC (+) 2 dao', 'CNC (+) 1 dao',
  'Đục CNC', 'Đục lắc', 'Khoan lỗ LR', 'Khoan lỗ vít', 'Khoan lỗ sò',
  'Khoan lỗ tán bolt', 'Khoan lỗ tán dù', 'Khoan lỗ ngang', 'Khoan lỗ dọc',
  'Bo R', 'Vát góc', 'Soi rãnh', 'Cẩn ngàm', 'Khoét lỗ dù',
  'XLKT Putty', 'XLKT Epoxy', 'XLKT Vá gỗ', 'Quay bọ',
  'Nhám thùng 1M', 'Nhám thùng 2M', 'Nhám thùng 3M', 'Nhám thùng 4M', 'Nhám cong',
  'Ép cước', 'Cào xước', 'Cào tay', 'Bắn cát',
  'XL màu gỗ', 'XL lông gỗ', 'Chà Bo', 'Nhám chổi', 'Bắn sò',
  'Ráp cụm', 'Nhám thùng cụm', 'Ráp tổng', 'Chạy rãnh', 'Mài đĩa',
  'Nguội (Dầu màu)', 'Nguội (Glaze)', 'Nguội (Pigment)', 'Nguội (Nước)',
  'Sơn Dầu màu', 'Sơn Glaze', 'Sơn Pigment', 'Sơn Nước',
  'Đan wicker', 'Đan dây dù',
];

const CD_STEP_COL = Object.fromEntries(CD_STEPS.map((name, i) => [name, i + 5]));

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
      populateSheets(workbook.SheetNames);
      fileName.textContent = file.name;
      dropZone.classList.add('has-file');
      setStatus('');
    } catch {
      setStatus('Failed to read file.', 'error');
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
      defval: null,
    });

    const prod = parseProduct(rows);
    const parts = parseParts(rows);
    const wb = createWorkbook();

    fillBom(wb.Sheets['bom'], prod, parts);
    fillBomCongDoan(wb.Sheets['BOM_lay_cong_doan'], prod, parts);

    XLSX.writeFile(wb, 'output.xlsx');
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
  if (typeof v === 'number' && Math.floor(v) === v) {
    return String(Math.floor(v));
  }
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

function findCell(rows, predicate, maxRows = 80, maxCols = 120) {
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

function valueRightOfLabel(rows, labels, maxRows = 80, maxCols = 40) {
  const labelList = Array.isArray(labels) ? labels : [labels];
  const targets = labelList.map(normText);

  const hit = findCell(
    rows,
    v => targets.includes(normText(v)),
    maxRows,
    maxCols
  );

  if (!hit) return null;

  const row = rows[hit.r] ?? [];

  for (let c = hit.c + 1; c < Math.min(row.length, hit.c + 10); c++) {
    if (row[c] != null && row[c] !== '') {
      return row[c];
    }
  }

  return null;
}

function findDimensionValues(rows) {
  const hit = findCell(
    rows,
    v => {
      const t = normText(v);
      return t.startsWith('dimention') || t.startsWith('dimension');
    },
    80,
    40
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
    values[2] ?? null,
  ];
}

// ── Source-sheet parsers ─────────────────────────────────────────────────────

function parseProduct(rows) {
  const [dai, rong, cao] = findDimensionValues(rows);

  return {
    name: valueRightOfLabel(rows, ['Product:', 'Product :', 'Tên SP:', 'Tên SP :']),
    code: valueRightOfLabel(rows, ['Item Code:', 'Item Code :', 'Mã SP:', 'Mã SP :']),
    dai,
    rong,
    cao,
  };
}

function parseParts(rows) {
  const parts = [];
  const layout = detectLayout(rows);

  const startRow = layout.dataStartRow;
  const stepStartCol = layout.stepStartCol;
  const codeCol = layout.ttCol;

  if (stepStartCol < 0) {
    throw new Error('Could not detect first step column.');
  }

  for (let r = startRow - 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const name = row[1];

    if (name == null || name === '') continue;

    const code = fmtCode(row[codeCol]);

    const steps = [];

    for (let s = 0; s < NUM_STEPS; s++) {
      const cs = stepStartCol + s * STEP_WIDTH;

      const sname = row[cs];
      const stime = row[cs + 4];

      if (
        sname &&
        typeof sname === 'string' &&
        stime != null &&
        typeof stime !== 'string'
      ) {
        steps.push([sname.trim(), stime]);
      }
    }

    parts.push({
      loai: row[0] == null ? 'Cụm' : 'Chi Tiết',
      code,
      name,
      sl: row[2],
      day_tho: row[3],
      rong_tho: row[4],
      dai_tho: row[5],
      dai_tinh: row[8],
      khoi: row[10],
      dt_bm: row[11],
      ghi_chu: row[13],
      steps,
    });
  }

  return parts;
}

function detectLayout(rows) {
  const dataStartRow = findDataStartRow(rows);
  const headerRowIdx = Math.max(0, dataStartRow - 2);
  const headerRow = rows[headerRowIdx] ?? [];

  let ttCol = -1;

  for (let c = 0; c < headerRow.length; c++) {
    if (normText(headerRow[c]) === 'tt') {
      ttCol = c;
      break;
    }
  }

  let stepStartCol = ttCol >= 0 ? ttCol + 1 : -1;

  if (stepStartCol < 0) {
    outer:
    for (let r = 0; r < Math.min(rows.length, 35); r++) {
      const row = rows[r] ?? [];

      for (let c = 0; c < row.length; c++) {
        if (lookupStep(cellText(row[c]))) {
          stepStartCol = c;
          break outer;
        }
      }
    }
  }

  return {
    dataStartRow,
    ttCol,
    stepStartCol,
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
    for (let r = headerRow + 1; r < Math.min(rows.length, headerRow + 10); r++) {
      if (Number(rows[r]?.[0]) === 1) {
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

// ── Workbook factory ─────────────────────────────────────────────────────────

function createWorkbook() {
  const wb = XLSX.utils.book_new();

  const bomAoa = [
    ['Tên', 'Mã', 'Dài', 'Rộng', 'Cao', 'Khối lượng', 'Diện tích bề mặt'],
    [],
    [],
    [],
    [],
    [
      'Tên', 'Mã', 'Mô Tả', 'Loại', 'Số Lượng',
      'Dia/rộng hộp', 'Dia/dài hộp', 'Dài chi tiết',
      'Dày Phôi', 'loại khung', 'Loại Phôi',
      'Khối lượng', 'Diện tích bề mặt', 'KLR',
    ],
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
    cdRow6,
  ];

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(cdAoa),
    'BOM_lay_cong_doan'
  );

  return wb;
}

// ── Sheet fillers ────────────────────────────────────────────────────────────

function fillBom(ws, prod, parts) {
  setCell(ws, 2, 1, prod.name);
  setCell(ws, 2, 2, prod.code);
  setCell(ws, 2, 3, prod.dai);
  setCell(ws, 2, 4, prod.rong);
  setCell(ws, 2, 5, prod.cao);

  let wr = 7;

  for (const p of parts) {
    if (p.code == null) continue;

    setCell(ws, wr, 1, p.name);
    setCell(ws, wr, 2, p.code);
    setCell(ws, wr, 3, p.ghi_chu);
    setCell(ws, wr, 4, p.loai);
    setCell(ws, wr, 5, p.sl);
    setCell(ws, wr, 6, p.rong_tho);
    setCell(ws, wr, 7, p.dai_tho);
    setCell(ws, wr, 8, p.dai_tinh);
    setCell(ws, wr, 9, p.day_tho);
    setCell(ws, wr, 12, p.khoi);
    setCell(ws, wr, 13, p.dt_bm);

    wr++;
  }
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

    setCell(ws, wr, 1, 'Chi tiết');
    setCell(ws, wr, 2, p.name);
    setCell(ws, wr, 3, p.code);

    const total = p.steps.length;

    p.steps.forEach(([sname, stime], idx) => {
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

function lookupStep(sname) {
  let col = CD_STEP_COL[sname];

  if (col) return col;

  const lower = String(sname ?? '').toLowerCase().trim();

  for (const [k, v] of Object.entries(CD_STEP_COL)) {
    if (k.toLowerCase() === lower) {
      return v;
    }
  }

  return null;
}

// ── Low-level cell writer ────────────────────────────────────────────────────

function setCell(ws, r1, c1, value) {
  const addr = XLSX.utils.encode_cell({
    r: r1 - 1,
    c: c1 - 1,
  });

  if (value == null || value === '') {
    delete ws[addr];
    return;
  }

  ws[addr] = {
    v: value,
    t: typeof value === 'number' ? 'n' : 's',
  };

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

  if (r1 - 1 > range.e.r) range.e.r = r1 - 1;
  if (c1 - 1 > range.e.c) range.e.c = c1 - 1;

  ws['!ref'] = XLSX.utils.encode_range(range);
}

// ── Status helper ────────────────────────────────────────────────────────────

function setStatus(text, type = '') {
  statusMsg.textContent = text;
  statusMsg.className = 'status-msg' + (type ? ' ' + type : '');
}