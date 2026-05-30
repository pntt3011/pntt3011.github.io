// app.js — Jig & Fixture Management application logic

import {
  openDB, seedDemoData, clearAllData,
  PHAN_LOAI, PHAN_LOAI_LIST, TRANG_THAI, TRANG_THAI_LIST,
  generateCode,
  getAllItems, addItem, updateItem, deleteItem, queryItems,
  addRequisition,
} from './db.js';

// ─────────────────────────────────────────────────────────────────────────────
//  Settings (persisted in localStorage)
// ─────────────────────────────────────────────────────────────────────────────

const SETTINGS_KEY = 'jig_mgmt_settings';

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) ?? {}; } catch { return {}; }
}
function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

function getRetireThreshold() {
  return Number(loadSettings().retireYears ?? 3);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(iso) {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

function yearsAgo(isoDate) {
  if (!isoDate) return Infinity;
  const ms = Date.now() - new Date(isoDate).getTime();
  return ms / (1000 * 60 * 60 * 24 * 365.25);
}

function pillHtml(trangThaiKey) {
  const t = TRANG_THAI[trangThaiKey] ?? { label: trangThaiKey, colorText: '#6b7280', colorBg: '#f3f4f6' };
  return `<span class="pill" style="color:${t.colorText};background:${t.colorBg}">${esc(t.label)}</span>`;
}

function plLabel(phanLoaiKey) {
  return PHAN_LOAI[phanLoaiKey]?.label ?? phanLoaiKey;
}

// Build QR code data URL for a given code string
function buildQR(text) {
  return new Promise(resolve => {
    const canvas = document.createElement('canvas');
    QRCode.toCanvas(canvas, text, { width: 80, margin: 1 }, err => {
      if (err) { resolve(null); return; }
      resolve(canvas.toDataURL());
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Navigation
// ─────────────────────────────────────────────────────────────────────────────

let _currentView = 'dashboard';

function switchView(viewId) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  const target = document.getElementById(`view-${viewId}`);
  if (target) target.classList.add('active');

  const navBtn = document.querySelector(`.nav-item[data-view="${viewId}"]`);
  if (navBtn) navBtn.classList.add('active');

  _currentView = viewId;

  // lazy-load view data
  if (viewId === 'dashboard')  renderDashboard();
  if (viewId === 'thong-ke')   renderStatsView();
  if (viewId === 'search')     { /* user triggers search manually */ }
  if (viewId === 'settings')   renderSettings();
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

// ─────────────────────────────────────────────────────────────────────────────
//  Populate filter/select dropdowns once from constants
// ─────────────────────────────────────────────────────────────────────────────

function populateSelects() {
  const plSelects = [
    document.getElementById('filterPhanLoai'),
    document.getElementById('srchPhanLoai'),
  ];
  const ttSelects = [document.getElementById('filterTrangThai')];

  plSelects.forEach(sel => {
    if (!sel) return;
    PHAN_LOAI_LIST.forEach(({ key, label }) => {
      const opt = document.createElement('option');
      opt.value = key; opt.textContent = label;
      sel.appendChild(opt);
    });
  });

  ttSelects.forEach(sel => {
    if (!sel) return;
    TRANG_THAI_LIST.forEach(({ key, label }) => {
      const opt = document.createElement('option');
      opt.value = key; opt.textContent = label;
      sel.appendChild(opt);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  1. Dashboard
// ─────────────────────────────────────────────────────────────────────────────

async function renderDashboard() {
  const threshold = getRetireThreshold();
  document.getElementById('retireThresholdLabel').textContent = threshold;

  const items = await getAllItems();
  const active = items.filter(i => i.trangThai === 'HOAT_DONG' || i.trangThai === 'TRONG');
  const baoTri = items.filter(i => i.trangThai === 'BAO_TRI');
  const aging  = items.filter(i => {
    if (i.trangThai === 'HUY') return false;
    return yearsAgo(i.ngaySuDungGanNhat) > threshold;
  });

  // KPIs
  document.getElementById('kpiTotal').textContent  = items.length.toLocaleString('vi-VN');
  document.getElementById('kpiActive').textContent  = active.length.toLocaleString('vi-VN');
  document.getElementById('kpiBaoTri').textContent  = baoTri.length.toLocaleString('vi-VN');
  document.getElementById('kpiRetire').textContent  = aging.length.toLocaleString('vi-VN');
  document.getElementById('agingCount').textContent = aging.length;

  // Breakdown by type
  const breakdownEl = document.getElementById('dashBreakdown');
  const typeCounts = {};
  PHAN_LOAI_LIST.forEach(({ key }) => { typeCounts[key] = 0; });
  items.forEach(i => { if (typeCounts[i.phanLoai] !== undefined) typeCounts[i.phanLoai]++; });
  const typeColors = ['#3b82f6', '#10b981', '#f59e0b'];
  const typeEntries = PHAN_LOAI_LIST.map((pl, idx) => ({ ...pl, count: typeCounts[pl.key], color: typeColors[idx] }));
  const typeMax = Math.max(...typeEntries.map(t => t.count), 1);

  breakdownEl.innerHTML = typeEntries.map(t => `
    <div class="breakdown-item">
      <span class="breakdown-dot" style="background:${t.color}"></span>
      <span class="breakdown-label">${esc(t.label)}</span>
      <div class="breakdown-bar-wrap">
        <div class="breakdown-bar" style="width:${Math.round(t.count / typeMax * 100)}%;background:${t.color}"></div>
      </div>
      <span class="breakdown-count">${t.count}</span>
    </div>
  `).join('');

  // Status breakdown
  const statusEl = document.getElementById('dashStatusBreakdown');
  const statusColors = { HOAT_DONG: '#16a34a', BAO_TRI: '#d97706', TRONG: '#3b82f6', KHONG_SU_DUNG: '#9ca3af', HUY: '#ef4444' };
  const statusCounts = {};
  TRANG_THAI_LIST.forEach(({ key }) => { statusCounts[key] = 0; });
  items.forEach(i => { if (statusCounts[i.trangThai] !== undefined) statusCounts[i.trangThai]++; });
  const statusMax = Math.max(...Object.values(statusCounts), 1);

  statusEl.innerHTML = TRANG_THAI_LIST.map(({ key, label }) => `
    <div class="breakdown-item">
      <span class="breakdown-dot" style="background:${statusColors[key] ?? '#9ca3af'}"></span>
      <span class="breakdown-label">${esc(label)}</span>
      <div class="breakdown-bar-wrap">
        <div class="breakdown-bar" style="width:${Math.round(statusCounts[key] / statusMax * 100)}%;background:${statusColors[key] ?? '#9ca3af'}"></div>
      </div>
      <span class="breakdown-count">${statusCounts[key]}</span>
    </div>
  `).join('');

  // Aging list
  const tbody = document.getElementById('agingTableBody');
  if (aging.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">Không có thiết bị nào lưu kho quá ${threshold} năm</td></tr>`;
  } else {
    tbody.innerHTML = aging.map(item => `
      <tr>
        <td><span class="code-badge">${esc(item.code)}</span></td>
        <td>${esc(item.tenSanPham)}</td>
        <td>${esc(plLabel(item.phanLoai))}</td>
        <td>${fmtDate(item.ngayTao)}</td>
        <td>${fmtDate(item.ngaySuDungGanNhat)}</td>
        <td>${pillHtml(item.trangThai)}</td>
        <td>
          <button class="action-link action-link--del" data-retire-id="${esc(item.id)}">Hủy khuôn</button>
        </td>
      </tr>
    `).join('');
  }

  // wire retire buttons in aging table
  tbody.querySelectorAll('[data-retire-id]').forEach(btn => {
    btn.addEventListener('click', () => retireItem(btn.dataset.retireId));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  2. Create view
// ─────────────────────────────────────────────────────────────────────────────

const tplCreateRow = document.getElementById('tplCreateRow');
const createTableBody = document.getElementById('createTableBody');

function addCreateRow() {
  const clone = tplCreateRow.content.cloneNode(true);
  const tr = clone.querySelector('tr');

  // default today's date
  tr.querySelector('.f-ngayTao').value = new Date().toISOString().slice(0, 10);

  // delete row
  tr.querySelector('.row-del-btn').addEventListener('click', () => {
    tr.remove();
  });

  createTableBody.appendChild(clone);
}

// start with one empty row
addCreateRow();

document.getElementById('addRowBtn').addEventListener('click', addCreateRow);

document.getElementById('completeCreateBtn').addEventListener('click', async () => {
  const rows = [...createTableBody.querySelectorAll('tr')];
  if (rows.length === 0) { alert('Vui lòng thêm ít nhất một dòng.'); return; }

  const btn = document.getElementById('completeCreateBtn');
  btn.disabled = true;
  btn.textContent = 'Đang xử lý…';

  let saved = 0;
  const errors = [];

  for (const tr of rows) {
    // skip rows that already have a code badge (already saved)
    const badge = tr.querySelector('.code-badge');
    if (badge.style.display !== 'none') continue;

    const phanLoai = tr.querySelector('.f-phanLoai').value;
    const quanHe   = tr.querySelector('.f-quanHe').value.trim();
    const soLuong  = Number(tr.querySelector('.f-soLuong').value) || 1;
    const spToiDa  = Number(tr.querySelector('.f-spToida').value) || 0;
    const maSP     = tr.querySelector('.f-maSP').value.trim();
    const tenSP    = tr.querySelector('.f-tenSP').value.trim();
    const ngayTao  = tr.querySelector('.f-ngayTao').value;
    const viTri    = tr.querySelector('.f-viTri').value.trim();

    if (!maSP || !tenSP || !ngayTao) {
      errors.push(`Dòng thiếu Mã SP, Tên SP hoặc Ngày tạo.`);
      tr.style.background = '#fff1f2';
      continue;
    }

    try {
      const code = await generateCode(phanLoai, quanHe);
      await addItem({
        code, phanLoai, quanHe, soLuong,
        spToiDaKhuon: spToiDa,
        maSanPhamVersion: maSP,
        tenSanPham: tenSP,
        ngayTao,
        ngaySuDungGanNhat: null,
        viTriLuuTru: viTri,
        trangThai: 'HOAT_DONG',
        ghiChu: '',
      });

      // show code badge + lock row
      badge.textContent = code;
      badge.style.display = '';
      tr.querySelectorAll('input,select').forEach(el => el.disabled = true);
      tr.querySelector('.row-del-btn').style.display = 'none';
      tr.style.background = '#f0fdf4';
      saved++;
    } catch (err) {
      errors.push(`Lỗi: ${err.message}`);
    }
  }

  btn.disabled = false;
  btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Hoàn thành &amp; Tạo mã`;

  const banner = document.getElementById('createSuccessBanner');
  const msg    = document.getElementById('createSuccessMsg');
  if (saved > 0) {
    msg.textContent = `Đã lưu ${saved} thiết bị thành công. Mã hệ thống đã được tạo.`;
    banner.style.display = 'flex';
    if (errors.length === 0) {
      setTimeout(() => { banner.style.display = 'none'; }, 5000);
    }
  }
  if (errors.length > 0) {
    alert('Có lỗi:\n' + errors.join('\n'));
  }
});

// Import from Excel (basic: expects columns matching the create table)
document.getElementById('importExcelBtn').addEventListener('click', () => {
  document.getElementById('importExcelFile').click();
});

document.getElementById('importExcelFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const wb = XLSX.read(ev.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      // Clear existing unlocked rows
      [...createTableBody.querySelectorAll('tr')].forEach(tr => {
        const badge = tr.querySelector('.code-badge');
        if (badge.style.display === 'none') tr.remove();
      });

      rows.forEach(row => {
        addCreateRow();
        const tr = createTableBody.lastElementChild;
        const map = {
          '.f-phanLoai': row['PHAN_LOAI'] || row['Phân loại'] || 'GA_HAN',
          '.f-quanHe':   row['QUAN_HE']   || row['Quan hệ']   || '',
          '.f-soLuong':  row['SO_LUONG']  || row['Số lượng']  || 1,
          '.f-spToida':  row['SP_TOI_DA'] || row['SP tối đa'] || 0,
          '.f-maSP':     row['MA_SP']     || row['Mã SP']     || '',
          '.f-tenSP':    row['TEN_SP']    || row['Tên SP']    || '',
          '.f-ngayTao':  row['NGAY_TAO']  || row['Ngày tạo'] || new Date().toISOString().slice(0,10),
          '.f-viTri':    row['VI_TRI']    || row['Vị trí']   || '',
        };
        Object.entries(map).forEach(([sel, val]) => {
          const el = tr.querySelector(sel);
          if (el) el.value = val;
        });
      });
    } catch (err) {
      alert(`Lỗi đọc file Excel: ${err.message}`);
    }
  };
  reader.readAsArrayBuffer(file);
  e.target.value = '';
});

// ─────────────────────────────────────────────────────────────────────────────
//  3. Thống kê
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;
let _statsItems  = [];
let _statsPage   = 1;

async function renderStatsView() {
  const filters = {
    phanLoai:        document.getElementById('filterPhanLoai').value  || undefined,
    trangThai:       document.getElementById('filterTrangThai').value || undefined,
    maSanPhamVersion:document.getElementById('filterMaSP').value.trim() || undefined,
    search:          document.getElementById('filterSearch').value.trim() || undefined,
  };
  // strip undefined
  Object.keys(filters).forEach(k => filters[k] === undefined && delete filters[k]);

  _statsItems = await queryItems(filters);
  _statsPage  = 1;
  renderStatsPage();
}

function renderStatsPage() {
  const start = (_statsPage - 1) * PAGE_SIZE;
  const page  = _statsItems.slice(start, start + PAGE_SIZE);
  const tbody = document.getElementById('statsTableBody');
  const total = _statsItems.length;

  document.getElementById('statsPageInfo').textContent =
    `Hiển thị ${start + 1}–${Math.min(start + PAGE_SIZE, total)} trên ${total} kết quả`;

  if (page.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:40px;color:var(--muted)">Không tìm thấy kết quả nào</td></tr>`;
  } else {
    tbody.innerHTML = page.map(item => `
      <tr>
        <td><span class="code-badge">${esc(item.code)}</span></td>
        <td>${esc(plLabel(item.phanLoai))}</td>
        <td style="font-family:monospace;font-size:0.78rem">${esc(item.quanHe)}</td>
        <td style="text-align:center">${item.soLuong}</td>
        <td style="text-align:right">${item.spToiDaKhuon?.toLocaleString('vi-VN') ?? '—'}</td>
        <td style="font-family:monospace;font-size:0.78rem">${esc(item.maSanPhamVersion)}</td>
        <td>${esc(item.tenSanPham)}</td>
        <td>${fmtDate(item.ngayTao)}</td>
        <td>${fmtDate(item.ngaySuDungGanNhat)}</td>
        <td style="font-family:monospace;font-size:0.78rem">${esc(item.viTriLuuTru)}</td>
        <td>${pillHtml(item.trangThai)}</td>
      </tr>
    `).join('');
  }

  // Pagination
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const pagDiv = document.getElementById('statsPagination');
  if (totalPages <= 1) { pagDiv.innerHTML = ''; return; }

  let html = `<button class="page-btn" ${_statsPage === 1 ? 'disabled' : ''} data-p="${_statsPage - 1}">&lsaquo;</button>`;
  for (let p = 1; p <= totalPages; p++) {
    if (totalPages > 7 && p > 2 && p < totalPages - 1 && Math.abs(p - _statsPage) > 1) {
      if (p === 3 || p === totalPages - 2) html += `<span class="page-info">…</span>`;
      continue;
    }
    html += `<button class="page-btn ${p === _statsPage ? 'active' : ''}" data-p="${p}">${p}</button>`;
  }
  html += `<button class="page-btn" ${_statsPage === totalPages ? 'disabled' : ''} data-p="${_statsPage + 1}">&rsaquo;</button>`;
  pagDiv.innerHTML = html;

  pagDiv.querySelectorAll('.page-btn:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => { _statsPage = Number(btn.dataset.p); renderStatsPage(); });
  });
}

// Bind filters
['filterPhanLoai','filterTrangThai','filterMaSP','filterSearch'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', renderStatsView);
});
document.getElementById('filterSearch')?.addEventListener('input', () => {
  clearTimeout(filterDebounce);
  filterDebounce = setTimeout(renderStatsView, 300);
});
let filterDebounce;

document.getElementById('clearFiltersBtn').addEventListener('click', () => {
  ['filterPhanLoai','filterTrangThai'].forEach(id => { document.getElementById(id).value = ''; });
  ['filterMaSP','filterSearch'].forEach(id => { document.getElementById(id).value = ''; });
  renderStatsView();
});

// Export to Excel
document.getElementById('exportExcelBtn').addEventListener('click', async () => {
  const items = _statsItems.length > 0 ? _statsItems : await getAllItems();
  const rows = items.map(item => ({
    'Mã hệ thống':    item.code,
    'Phân loại':      plLabel(item.phanLoai),
    'Quan hệ':        item.quanHe,
    'Số lượng':       item.soLuong,
    'SP tối đa/khuôn':item.spToiDaKhuon,
    'Mã SP/Version':  item.maSanPhamVersion,
    'Tên sản phẩm':   item.tenSanPham,
    'Ngày tạo':       item.ngayTao,
    'Dùng gần nhất':  item.ngaySuDungGanNhat ?? '',
    'Vị trí lưu trữ': item.viTriLuuTru,
    'Trạng thái':     TRANG_THAI[item.trangThai]?.label ?? item.trangThai,
    'Ghi chú':        item.ghiChu,
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Khuon Jig Ga');
  XLSX.writeFile(wb, `KhuonJigGa_${new Date().toISOString().slice(0,10)}.xlsx`);
});

// ─────────────────────────────────────────────────────────────────────────────
//  4. Tìm kiếm & Cập nhật
// ─────────────────────────────────────────────────────────────────────────────

let _searchResults = [];
let _selectedItemId = null;

async function applySearch() {
  const filters = {};
  const code   = document.getElementById('srchCode').value.trim();
  const pl     = document.getElementById('srchPhanLoai').value;
  const maSP   = document.getElementById('srchMaSP').value.trim();
  const tenSP  = document.getElementById('srchTenSP').value.trim();

  // combine search fields into `search` substring match
  const searchTerms = [code, maSP, tenSP].filter(Boolean).join(' ');
  if (searchTerms) filters.search = searchTerms;
  if (pl) filters.phanLoai = pl;

  _searchResults = await queryItems(filters);
  _selectedItemId = null;
  renderSearchResults();

  // check order quantity sufficiency
  const orderQty = Number(document.getElementById('srchOrderQty').value) || 0;
  checkSufficiency(orderQty, maSP || tenSP);
}

function renderSearchResults() {
  const tbody = document.getElementById('srchResultBody');
  document.getElementById('srchResultCount').textContent = `${_searchResults.length} kết quả`;

  if (_searchResults.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--muted)">Không tìm thấy kết quả</td></tr>`;
    return;
  }

  tbody.innerHTML = _searchResults.map(item => {
    const ageYrs = yearsAgo(item.ngaySuDungGanNhat);
    const agePct = Math.min(100, Math.round(ageYrs / getRetireThreshold() * 100));
    const ageColor = agePct >= 100 ? 'var(--danger)' : agePct >= 70 ? '#d97706' : '#16a34a';
    return `
      <tr data-id="${esc(item.id)}" style="cursor:pointer">
        <td><span class="code-badge">${esc(item.code)}</span></td>
        <td><span style="font-size:0.8rem">${esc(item.maSanPhamVersion)}</span><br><span style="font-size:0.75rem;color:var(--muted)">${esc(item.tenSanPham)}</span></td>
        <td>${pillHtml(item.trangThai)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="flex:1;height:5px;background:#f0f4f8;border-radius:999px;overflow:hidden">
              <div style="width:${agePct}%;height:100%;background:${ageColor};border-radius:999px"></div>
            </div>
            <span style="font-size:0.75rem;color:${ageColor};white-space:nowrap">${ageYrs === Infinity ? 'N/A' : ageYrs.toFixed(1) + 'y'}</span>
          </div>
        </td>
        <td style="font-size:0.78rem;font-family:monospace">${esc(item.viTriLuuTru)}</td>
        <td>
          <button class="action-link action-link--edit" data-edit-id="${esc(item.id)}">Sửa</button>
          <button class="action-link action-link--del"  data-retire-id="${esc(item.id)}">Hủy</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('tr[data-id]').forEach(tr => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      selectItem(tr.dataset.id);
    });
  });

  tbody.querySelectorAll('[data-edit-id]').forEach(btn => {
    btn.addEventListener('click', () => selectItem(btn.dataset.editId));
  });

  tbody.querySelectorAll('[data-retire-id]').forEach(btn => {
    btn.addEventListener('click', () => retireItem(btn.dataset.retireId));
  });
}

function checkSufficiency(orderQty, productQuery) {
  const warningEl = document.getElementById('shortageWarning');
  const msgEl     = document.getElementById('shortageMsg');
  if (!orderQty || !productQuery) { warningEl.style.display = 'none'; return; }

  const totalCapacity = _searchResults
    .filter(i => i.trangThai === 'HOAT_DONG' || i.trangThai === 'TRONG')
    .reduce((sum, i) => sum + (i.spToiDaKhuon ?? 0), 0);

  if (totalCapacity < orderQty) {
    const shortage = orderQty - totalCapacity;
    msgEl.textContent =
      `Đơn hàng yêu cầu ${orderQty.toLocaleString('vi-VN')} SP. Jig hiện có đủ cho ${totalCapacity.toLocaleString('vi-VN')} SP. Thiếu ${shortage.toLocaleString('vi-VN')} SP.`;
    warningEl.style.display = 'flex';

    // store for requisition creation
    warningEl.dataset.shortage  = shortage;
    warningEl.dataset.available = totalCapacity;
    warningEl.dataset.required  = orderQty;
    warningEl.dataset.query     = productQuery;
  } else {
    warningEl.style.display = 'none';
  }
}

document.getElementById('applySearchBtn').addEventListener('click', applySearch);

document.getElementById('createRequisitionBtn').addEventListener('click', async () => {
  const w = document.getElementById('shortageWarning');
  const maLo = prompt('Nhập số đơn hàng / lô sản xuất:');
  if (!maLo) return;
  await addRequisition({
    maLo,
    maSanPham:           w.dataset.query,
    tenSanPham:          w.dataset.query,
    soLuongCanSanXuat:   Number(w.dataset.required),
    soLuongHienCo:       Number(w.dataset.available),
    soLuongThieu:        Number(w.dataset.shortage),
    ghiChu:              '',
    trangThai:           'PENDING',
  });
  alert(`Phiếu yêu cầu bổ sung cho đơn "${maLo}" đã được tạo.`);
});

function selectItem(id) {
  _selectedItemId = id;

  // highlight row
  document.querySelectorAll('#srchResultBody tr').forEach(tr => {
    tr.classList.toggle('selected', tr.dataset.id === id);
  });

  const item = _searchResults.find(i => i.id === id);
  if (!item) return;
  renderDetailPanel(item);
}

function renderDetailPanel(item) {
  const panel = document.getElementById('detailPanel');

  const ttOptions = TRANG_THAI_LIST
    .map(({ key, label }) => `<option value="${key}" ${item.trangThai === key ? 'selected' : ''}>${label}</option>`)
    .join('');

  panel.innerHTML = `
    <div style="margin-bottom:12px;">
      <span class="code-badge" style="font-size:0.9rem">${esc(item.code)}</span>
    </div>

    <div class="detail-field">
      <label>Mã SP / Version</label>
      <input class="inline-input" id="dp-maSP" value="${esc(item.maSanPhamVersion)}" />
    </div>
    <div class="detail-field">
      <label>Tên sản phẩm</label>
      <input class="inline-input" id="dp-tenSP" value="${esc(item.tenSanPham)}" />
    </div>
    <div class="detail-field">
      <label>Trạng thái</label>
      <select class="inline-select" id="dp-trangThai">${ttOptions}</select>
    </div>
    <div class="detail-field">
      <label>Số lượng</label>
      <input class="inline-input" id="dp-soLuong" type="number" min="1" value="${item.soLuong}" />
    </div>
    <div class="detail-field">
      <label>Vị trí lưu trữ</label>
      <input class="inline-input" id="dp-viTri" value="${esc(item.viTriLuuTru)}" />
    </div>
    <div class="detail-field">
      <label>Ngày sử dụng gần nhất</label>
      <input class="inline-input" id="dp-ngaySuDung" type="date" value="${item.ngaySuDungGanNhat ?? ''}" />
    </div>
    <div class="detail-field">
      <label>Ghi chú vận hành</label>
      <textarea class="inline-input" id="dp-ghiChu" rows="3" style="resize:vertical">${esc(item.ghiChu)}</textarea>
    </div>

    <button class="primary-button" id="dp-saveBtn" style="width:100%;margin-top:4px;display:flex;align-items:center;justify-content:center;gap:6px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
      Lưu thay đổi
    </button>

    <hr style="border:none;border-top:1px solid var(--card-border);margin:8px 0;" />

    <div style="border:1px solid #fca5a5;border-radius:var(--radius-sm);padding:12px;">
      <div style="font-weight:700;color:var(--danger);font-size:0.84rem;margin-bottom:6px;">Hủy khuôn (Retirement)</div>
      <p style="font-size:0.78rem;color:var(--muted);margin:0 0 10px">Chỉ sử dụng cho các bộ gá đã hết tuổi thọ hoặc hỏng hư không thể sửa chữa.</p>
      <button class="primary-button" id="dp-retireBtn" style="background:var(--danger);width:100%;font-size:0.83rem;">Xác nhận hủy khuôn</button>
    </div>
  `;

  document.getElementById('dp-saveBtn').addEventListener('click', async () => {
    await updateItem(item.id, {
      maSanPhamVersion:  document.getElementById('dp-maSP').value.trim(),
      tenSanPham:        document.getElementById('dp-tenSP').value.trim(),
      trangThai:         document.getElementById('dp-trangThai').value,
      soLuong:           Number(document.getElementById('dp-soLuong').value) || 1,
      viTriLuuTru:       document.getElementById('dp-viTri').value.trim(),
      ngaySuDungGanNhat: document.getElementById('dp-ngaySuDung').value || null,
      ghiChu:            document.getElementById('dp-ghiChu').value,
    });
    alert('Đã lưu thay đổi.');
    await applySearch();
  });

  document.getElementById('dp-retireBtn').addEventListener('click', async () => {
    await retireItem(item.id);
  });
}

async function retireItem(id) {
  if (!confirm('Xác nhận hủy khuôn? Hành động này sẽ đánh dấu thiết bị là "Đã hủy".')) return;
  await updateItem(id, { trangThai: 'HUY' });
  alert('Thiết bị đã được đánh dấu hủy khuôn.');
  // refresh whichever view is visible
  if (_currentView === 'dashboard') renderDashboard();
  if (_currentView === 'search') applySearch();
}

// ─────────────────────────────────────────────────────────────────────────────
//  5. Settings
// ─────────────────────────────────────────────────────────────────────────────

function renderSettings() {
  const s = loadSettings();
  document.getElementById('retireThresholdInput').value = s.retireYears ?? 3;
}

document.getElementById('saveSettingsBtn').addEventListener('click', () => {
  const years = Number(document.getElementById('retireThresholdInput').value);
  if (!years || years < 1) { alert('Ngưỡng phải là số nguyên dương.'); return; }
  saveSettings({ ...loadSettings(), retireYears: years });
  alert('Đã lưu cài đặt.');
});

document.getElementById('exportJsonBtn').addEventListener('click', async () => {
  const items = await getAllItems();
  const blob  = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = `jig_mgmt_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('importJsonBtn').addEventListener('click', () => {
  document.getElementById('importJsonFile').click();
});

document.getElementById('importJsonFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const items = JSON.parse(text);
    if (!Array.isArray(items)) throw new Error('Dữ liệu không hợp lệ (phải là mảng).');
    if (!confirm(`Nhập ${items.length} bản ghi từ file? Dữ liệu trùng ID sẽ bị ghi đè.`)) return;
    for (const item of items) {
      await addItem(item).catch(() => updateItem(item.id, item).catch(() => {}));
    }
    alert(`Nhập thành công ${items.length} bản ghi.`);
    if (_currentView === 'dashboard') renderDashboard();
    if (_currentView === 'thong-ke')  renderStatsView();
  } catch (err) {
    alert(`Lỗi: ${err.message}`);
  }
  e.target.value = '';
});

document.getElementById('clearDataBtn').addEventListener('click', async () => {
  if (!confirm('Xóa TOÀN BỘ dữ liệu? Hành động này không thể hoàn tác!')) return;
  if (!confirm('Lần xác nhận thứ 2: Bạn chắc chắn muốn xóa tất cả?')) return;
  await clearAllData();
  alert('Đã xóa toàn bộ dữ liệu.');
  location.reload();
});

// ─────────────────────────────────────────────────────────────────────────────
//  Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

async function init() {
  const statusEl = document.getElementById('sysStatus');
  try {
    await openDB();
    await seedDemoData();
    populateSelects();
    await renderDashboard();
    statusEl.style.color = '#16a34a';
    statusEl.textContent = '● Hệ thống OK';
  } catch (err) {
    statusEl.style.color = 'var(--danger)';
    statusEl.textContent = '● Lỗi hệ thống';
    console.error('Init error:', err);
  }
}

init();
