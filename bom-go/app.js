// ── Constants (mirror parse.py) ───────────────────────────────────────────────
const STEP_START_COL = 29;  // 1-indexed column where first step block starts
const STEP_WIDTH     = 5;   // columns per step block
const NUM_STEPS      = 25;
const DATA_START_ROW = 19;  // 1-indexed first data row in source sheet

// Step names in order → cols 5–79 of BOM_lay_cong_doan
const CD_STEPS = [
  'Cắt ngang', 'Rong dọc', 'Vẽ rập', 'Lọng cong', 'Sấy 2QT',                          // 5–9
  'Bào ghép 2M', 'Bào ghép 4M', 'Ghép finger', 'Ghép cao tầng', 'Ghép cảo',             // 10–14
  'Bào 2M', 'Tiện tròn', 'Tubi CNC', 'Tubi chép hình', 'Tubi tay',                      // 15–19
  'Chà láng', 'Chuốt chốt', 'Bào 4M',                                                   // 20–22
  '3D chống tâm', '3D kẹp lật',                                                          // 23–24
  'Cắt tay (TC)', 'Cắt thẳng', 'Cắt xéo', 'Cắt router', 'Cắt finger',                  // 25–29
  'CNC (+) 6 dao', 'CNC (+) 2 dao', 'CNC (+) 1 dao',                                    // 30–32
  'Đục CNC', 'Đục lắc', 'Khoan lỗ LR', 'Khoan lỗ vít', 'Khoan lỗ sò',                 // 33–37
  'Khoan lỗ tán bolt', 'Khoan lỗ tán dù', 'Khoan lỗ ngang', 'Khoan lỗ dọc',            // 38–41
  'Bo R', 'Vát góc', 'Soi rãnh', 'Cẩn ngàm', 'Khoét lỗ dù',                           // 42–46
  'XLKT Putty', 'XLKT Epoxy', 'XLKT Vá gỗ', 'Quay bọ',                                 // 47–50
  'Nhám thùng 1M', 'Nhám thùng 2M', 'Nhám thùng 3M', 'Nhám thùng 4M', 'Nhám cong',    // 51–55
  'Ép cước', 'Cào xước', 'Cào tay', 'Bắn cát',                                         // 56–59
  'XL màu gỗ', 'XL lông gỗ', 'Chà Bo', 'Nhám chổi', 'Bắn sò',                         // 60–64
  'Ráp cụm', 'Nhám thùng cụm', 'Ráp tổng', 'Chạy rãnh', 'Mài đĩa',                    // 65–69
  'Nguội (Dầu màu)', 'Nguội (Glaze)', 'Nguội (Pigment)', 'Nguội (Nước)',                // 70–73
  'Sơn Dầu màu', 'Sơn Glaze', 'Sơn Pigment', 'Sơn Nước',                              // 74–77
  'Đan wicker', 'Đan dây dù',                                                           // 78–79
];

// step name → 1-indexed column number
const CD_STEP_COL = Object.fromEntries(CD_STEPS.map((name, i) => [name, i + 5]));

// ── DOM refs ──────────────────────────────────────────────────────────────────
const dropZone    = document.getElementById('dropZone');
const fileInput   = document.getElementById('fileInput');
const fileName    = document.getElementById('fileName');
const sheetSelect = document.getElementById('sheetSelect');
const parseBtn    = document.getElementById('parseBtn');
const statusMsg   = document.getElementById('statusMsg');

let workbook = null;

// ── File loading ──────────────────────────────────────────────────────────────

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

// ── Drag & drop ───────────────────────────────────────────────────────────────

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) loadFile(file);
});
fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));

// ── Parse button ──────────────────────────────────────────────────────────────

parseBtn.addEventListener('click', () => {
  if (!workbook) return;

  setStatus('Parsing…');
  parseBtn.disabled = true;

  try {
    const srcSheet = workbook.Sheets[sheetSelect.value];
    const rows     = XLSX.utils.sheet_to_json(srcSheet, { header: 1, defval: null });

    const prod  = parseProduct(rows);
    const parts = parseParts(rows);
    const wb    = createWorkbook();

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

// ── Source-sheet parsers ──────────────────────────────────────────────────────

function fmtCode(v) {
  if (v == null) return null;
  if (typeof v === 'number' && Math.floor(v) === v) return String(Math.floor(v));
  return String(v);
}

function parseProduct(rows) {
  return {
    name: rows[5]?.[6]  ?? null,  // cell(6,7)
    code: rows[6]?.[6]  ?? null,  // cell(7,7)
    dai:  rows[9]?.[6]  ?? null,  // cell(10,7)
    rong: rows[9]?.[7]  ?? null,  // cell(10,8)
    cao:  rows[9]?.[8]  ?? null,  // cell(10,9)
  };
}

function parseParts(rows) {
  const parts = [];
  for (let r = DATA_START_ROW - 1; r < rows.length; r++) {
    const row  = rows[r] ?? [];
    const name = row[1];          // col 2
    if (name == null) continue;

    const steps = [];
    for (let s = 0; s < NUM_STEPS; s++) {
      const cs    = STEP_START_COL - 1 + s * STEP_WIDTH;  // 0-indexed
      const sname = row[cs];
      const stime = row[cs + 4];
      if (sname && typeof sname === 'string' &&
          stime != null && typeof stime !== 'string') {
        steps.push([sname.trim(), stime]);
      }
    }

    parts.push({
      loai:     row[0] == null ? 'Cụm' : 'Chi Tiết',  // col 1 null → assembly
      code:     fmtCode(row[27]),  // col 28
      name,
      sl:       row[2],   // col 3
      day_tho:  row[3],   // col 4
      rong_tho: row[4],   // col 5
      dai_tho:  row[5],   // col 6
      dai_tinh: row[8],   // col 9
      khoi:     row[10],  // col 11
      dt_bm:    row[11],  // col 12
      ghi_chu:  row[13],  // col 14
      steps,
    });
  }
  return parts;
}

// ── Workbook factory ──────────────────────────────────────────────────────────

function createWorkbook() {
  const wb = XLSX.utils.book_new();

  // bom: rows 1–6 are static headers; data written from row 7
  const bomAoa = [
    ['Tên', 'Mã', 'Dài', 'Rộng', 'Cao', 'Khối lượng', 'Diện tích bề mặt'],  // row 1
    [],  // row 2: product data (filled dynamically)
    [], [], [],  // rows 3–5
    ['Tên', 'Mã', 'Mô Tả', 'Loại', 'Số Lượng', 'Dia/rộng hộp', 'Dia/dài hộp',
     'Dài chi tiết', 'Dày Phôi', 'loại khung', 'Loại Phôi',
     'Khối lượng', 'Diện tích bề mặt', 'KLR'],  // row 6
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bomAoa), 'bom');

  // BOM_lay_cong_doan: rows 1–6 are static headers; data from row 7
  const cdRow6 = [null, 'Tên', 'Mã', 'CÔNG ĐOẠN', ...CD_STEPS];  // cols 1–79
  const cdAoa = [
    ['Chú thích: Định dạng hợp lệ X-X-X-X (vd: 60-20-1-1)'],  // row 1
    ['LSX:', 'KINGSTON-XƯỞNG GỖ\nBOM CÔNG ĐOẠN'],              // row 2
    [],                                                          // row 3
    ['CUST:'],                                                   // row 4
    ['Tên SP:'],                                                 // row 5: name filled dynamically
    cdRow6,                                                      // row 6
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cdAoa), 'BOM_lay_cong_doan');

  return wb;
}

// ── Sheet fillers ─────────────────────────────────────────────────────────────

function fillBom(ws, prod, parts) {
  setCell(ws, 2, 1, prod.name);
  setCell(ws, 2, 2, prod.code);
  setCell(ws, 2, 3, prod.dai);
  setCell(ws, 2, 4, prod.rong);
  setCell(ws, 2, 5, prod.cao);

  let wr = 7;
  for (const p of parts) {
    if (p.code == null) continue;
    setCell(ws, wr,  1, p.name);
    setCell(ws, wr,  2, p.code);
    setCell(ws, wr,  3, p.ghi_chu);
    setCell(ws, wr,  4, p.loai);
    setCell(ws, wr,  5, p.sl);
    setCell(ws, wr,  6, p.rong_tho);
    setCell(ws, wr,  7, p.dai_tho);
    setCell(ws, wr,  8, p.dai_tinh);
    setCell(ws, wr,  9, p.day_tho);
    setCell(ws, wr, 12, p.khoi);
    setCell(ws, wr, 13, p.dt_bm);
    wr++;
  }
}

function fillBomCongDoan(ws, prod, parts) {
  setCell(ws, 5, 2, prod.name);  // Tên SP row

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
      const order  = idx + 1;
      const isLast = order === total ? 1 : 0;
      let   t      = Math.round(Number(stime));
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
  const lower = sname.toLowerCase();
  for (const [k, v] of Object.entries(CD_STEP_COL)) {
    if (k.toLowerCase() === lower) return v;
  }
  return null;
}

// ── Low-level cell writer ─────────────────────────────────────────────────────

function setCell(ws, r1, c1, value) {
  const addr = XLSX.utils.encode_cell({ r: r1 - 1, c: c1 - 1 });
  if (value == null || value === '') {
    delete ws[addr];
    return;
  }
  ws[addr] = { v: value, t: typeof value === 'number' ? 'n' : 's' };
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  if (r1 - 1 > range.e.r) range.e.r = r1 - 1;
  if (c1 - 1 > range.e.c) range.e.c = c1 - 1;
  ws['!ref'] = XLSX.utils.encode_range(range);
}

// ── Status helper ─────────────────────────────────────────────────────────────

function setStatus(text, type = '') {
  statusMsg.textContent = text;
  statusMsg.className   = 'status-msg' + (type ? ' ' + type : '');
}
