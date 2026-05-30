// db.js — IndexedDB schema and data-access layer for Jig & Fixture Management

export const DB_NAME    = 'jig_mgmt';
export const DB_VERSION = 1;

// ── Classification constants ───────────────────────────────────────────────────
//
//  phanLoai key  →  { code, label, labelEn }
//  `code` is the 2-letter prefix used in the system code (XX.YYYY[.quanHe])
//
export const PHAN_LOAI = {
  GA_HAN:    { code: 'GH', label: 'Gá hàn',    labelEn: 'Welding Jig'     },
  JIG_GIU:   { code: 'JG', label: 'Jig giữ',   labelEn: 'Holding Fixture' },
  KHUON_UON: { code: 'KU', label: 'Khuôn uốn', labelEn: 'Bending Mold'    },
};

export const PHAN_LOAI_LIST = Object.entries(PHAN_LOAI)
  .map(([key, val]) => ({ key, ...val }));

// ── Status constants ──────────────────────────────────────────────────────────
export const TRANG_THAI = {
  HOAT_DONG:     { label: 'Hoạt động',      colorText: '#166534', colorBg: '#dcfce7' },
  BAO_TRI:       { label: 'Bảo trì',        colorText: '#92400e', colorBg: '#fef3c7' },
  TRONG:         { label: 'Trống',           colorText: '#1e40af', colorBg: '#dbeafe' },
  KHONG_SU_DUNG: { label: 'Không sử dụng',  colorText: '#6b7280', colorBg: '#f3f4f6' },
  HUY:           { label: 'Đã hủy',          colorText: '#991b1b', colorBg: '#fee2e2' },
};

export const TRANG_THAI_LIST = Object.entries(TRANG_THAI)
  .map(([key, val]) => ({ key, ...val }));

// ─────────────────────────────────────────────────────────────────────────────
//  Record shapes  (reference typedefs — not enforced at runtime)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} JigItem
 *   Stored in the `items` object store.
 *
 * @property {string}      id
 *   UUID — primary key, generated automatically on insert.
 *
 * @property {string}      code
 *   System code, format  XX.YYYY[.quanHe]
 *   where  XX    = PHAN_LOAI[phanLoai].code      (e.g. "GH", "JG", "KU")
 *          YYYY  = 4-digit zero-padded sequential counter per classification
 *          quanHe = optional hierarchy suffix from the quanHe field (e.g. "1.2")
 *   Generated and stored when the user clicks "Hoàn thành & Tạo mã".
 *
 * @property {string}      phanLoai
 *   One of the keys of PHAN_LOAI: 'GA_HAN' | 'JIG_GIU' | 'KHUON_UON'
 *
 * @property {string}      quanHe
 *   Hierarchical position within the jig set, notation ZZ[.TT[.LL]].
 *   Examples:
 *     "1"      → single item at position 1
 *     "1.2"    → cluster 1, item 2
 *     "4.2.1"  → cluster 4, sub-cluster 2, item 1
 *   Leave empty string if the item stands alone.
 *
 * @property {number}      soLuong
 *   Physical count of this item currently in stock.
 *
 * @property {number}      spToiDaKhuon
 *   Maximum number of products the full jig set can service in one order.
 *
 * @property {string}      maSanPhamVersion
 *   Product code plus version string, e.g. "PN-2024-V2".
 *
 * @property {string}      tenSanPham
 *   Human-readable product name.
 *
 * @property {string}      ngayTao
 *   ISO date (YYYY-MM-DD) when the physical jig/fixture was first created.
 *
 * @property {string|null} ngaySuDungGanNhat
 *   ISO date of most recent checkout by a worker.
 *   null if the item has never been checked out.
 *
 * @property {string}      viTriLuuTru
 *   Physical storage location code, e.g. "A1-R02-S03"
 *   (workshop A1, rack R02, shelf S03).
 *
 * @property {string}      trangThai
 *   One of the keys of TRANG_THAI:
 *   'HOAT_DONG' | 'BAO_TRI' | 'TRONG' | 'KHONG_SU_DUNG' | 'HUY'
 *
 * @property {string}      ghiChu
 *   Free-text operational notes (e.g. maintenance remarks).
 *
 * @property {string}      createdAt   ISO datetime of DB record creation.
 * @property {string}      updatedAt   ISO datetime of last DB update.
 */

/**
 * @typedef {Object} Requisition
 *   Stored in the `requisitions` object store.
 *   Created when a search reveals insufficient jig capacity for a production order.
 *
 * @property {string} id              UUID primary key.
 * @property {string} maLo            Production order / lot number.
 * @property {string} maSanPham       Product code that was searched.
 * @property {string} tenSanPham      Product name.
 * @property {number} soLuongCanSanXuat  Required production quantity for the order.
 * @property {number} soLuongHienCo   Total jig capacity found in current inventory.
 * @property {number} soLuongThieu    Shortfall: soLuongCanSanXuat − soLuongHienCo.
 * @property {string} ghiChu          Notes.
 * @property {string} trangThai       'PENDING' | 'APPROVED' | 'DONE'
 * @property {string} createdAt       ISO datetime.
 */

/**
 * @typedef {Object} Counter
 *   Stored in the `counters` object store.
 *   One record per classification; tracks the next sequential code number.
 *
 * @property {string} phanLoai   Key of PHAN_LOAI — also the keyPath for this store.
 * @property {number} next       Next number to issue. Starts at 1, increments on each use.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  IndexedDB lifecycle
// ─────────────────────────────────────────────────────────────────────────────

let _db = null;

/**
 * Opens (or reuses) the IndexedDB connection and runs any needed migrations.
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // ── items ──
      if (!db.objectStoreNames.contains('items')) {
        const s = db.createObjectStore('items', { keyPath: 'id' });
        // unique index so duplicate codes are caught at the DB layer
        s.createIndex('code',              'code',              { unique: true  });
        s.createIndex('phanLoai',          'phanLoai',          { unique: false });
        s.createIndex('maSanPhamVersion',  'maSanPhamVersion',  { unique: false });
        s.createIndex('viTriLuuTru',       'viTriLuuTru',       { unique: false });
        s.createIndex('trangThai',         'trangThai',         { unique: false });
        s.createIndex('ngaySuDungGanNhat', 'ngaySuDungGanNhat', { unique: false });
        s.createIndex('ngayTao',           'ngayTao',           { unique: false });
      }

      // ── requisitions ──
      if (!db.objectStoreNames.contains('requisitions')) {
        const r = db.createObjectStore('requisitions', { keyPath: 'id' });
        r.createIndex('maSanPham', 'maSanPham', { unique: false });
        r.createIndex('trangThai', 'trangThai', { unique: false });
        r.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // ── counters — one record per PHAN_LOAI key ──
      if (!db.objectStoreNames.contains('counters')) {
        db.createObjectStore('counters', { keyPath: 'phanLoai' });
      }
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = ()  => reject(req.error);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] & 0xf;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

const nowIso = () => new Date().toISOString();

// ─────────────────────────────────────────────────────────────────────────────
//  Code generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Atomically claims the next sequential code for a given classification.
 *
 * Output format:  XX.YYYY[.quanHe]
 *   XX     = PHAN_LOAI[phanLoai].code        e.g. "GH"
 *   YYYY   = 4-digit zero-padded sequence     e.g. "0005"
 *   quanHe = optional hierarchy suffix        e.g. "1.2.1"
 *
 * The counter is incremented inside a readwrite transaction so concurrent calls
 * never receive the same sequence number.
 *
 * @param {string} phanLoai  Key of PHAN_LOAI
 * @param {string} [quanHe]  Hierarchy string; appended after a "." if non-empty
 * @returns {Promise<string>}
 */
export async function generateCode(phanLoai, quanHe = '') {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction('counters', 'readwrite');
    const store = tx.objectStore('counters');
    const get   = store.get(phanLoai);

    get.onsuccess = () => {
      const rec  = get.result ?? { phanLoai, next: 1 };
      const seq  = rec.next;
      rec.next   = seq + 1;
      store.put(rec);

      const xx     = PHAN_LOAI[phanLoai]?.code ?? 'XX';
      const yyyy   = String(seq).padStart(4, '0');
      const suffix = quanHe ? `.${quanHe}` : '';
      resolve(`${xx}.${yyyy}${suffix}`);
    };

    get.onerror = () => reject(get.error);
    tx.onerror  = () => reject(tx.error);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Items  (CRUD + query)
// ─────────────────────────────────────────────────────────────────────────────

/** @returns {Promise<JigItem[]>} */
export async function getAllItems() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('items', 'readonly')
                  .objectStore('items').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/** @returns {Promise<JigItem|null>} */
export async function getItemById(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('items', 'readonly')
                  .objectStore('items').get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Inserts a new item. The caller is responsible for supplying a `code`
 * obtained via generateCode(). Fields `id`, `createdAt`, and `updatedAt`
 * are assigned automatically.
 *
 * @param {Omit<JigItem, 'id'|'createdAt'|'updatedAt'>} data
 * @returns {Promise<JigItem>}
 */
export async function addItem(data) {
  const db = await openDB();
  const ts   = nowIso();
  const item = { ...data, id: uuid(), createdAt: ts, updatedAt: ts };
  return new Promise((resolve, reject) => {
    const req = db.transaction('items', 'readwrite')
                  .objectStore('items').add(item);
    req.onsuccess = () => resolve(item);
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Merges `changes` into the existing item and refreshes `updatedAt`.
 * @param {string}           id
 * @param {Partial<JigItem>} changes
 * @returns {Promise<JigItem>}
 */
export async function updateItem(id, changes) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction('items', 'readwrite');
    const store = tx.objectStore('items');
    const get   = store.get(id);

    get.onsuccess = () => {
      const existing = get.result;
      if (!existing) { reject(new Error(`Item not found: ${id}`)); return; }
      const updated = { ...existing, ...changes, id, updatedAt: nowIso() };
      const put = store.put(updated);
      put.onsuccess = () => resolve(updated);
      put.onerror   = () => reject(put.error);
    };
    get.onerror = () => reject(get.error);
  });
}

/**
 * Hard-deletes an item from the store.
 * Prefer setting trangThai = 'HUY' (retirement) over permanent deletion.
 * @param {string} id
 */
export async function deleteItem(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('items', 'readwrite')
                  .objectStore('items').delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Returns items matching all supplied filters (AND logic, all optional).
 * Filters the full store in memory — suitable for up to a few thousand records.
 *
 * @param {{
 *   phanLoai?:         string,
 *   trangThai?:        string,
 *   maSanPhamVersion?: string,  substring match
 *   viTriLuuTru?:      string,  substring match
 *   search?:           string,  substring match across code/maSP/tenSP/viTri
 * }} filters
 * @returns {Promise<JigItem[]>}
 */
export async function queryItems(filters = {}) {
  const all = await getAllItems();
  return all.filter(item => {
    if (filters.phanLoai  && item.phanLoai  !== filters.phanLoai)  return false;
    if (filters.trangThai && item.trangThai !== filters.trangThai) return false;
    if (filters.maSanPhamVersion) {
      if (!item.maSanPhamVersion?.toLowerCase()
            .includes(filters.maSanPhamVersion.toLowerCase())) return false;
    }
    if (filters.viTriLuuTru) {
      if (!item.viTriLuuTru?.toLowerCase()
            .includes(filters.viTriLuuTru.toLowerCase())) return false;
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const hay = [item.code, item.maSanPhamVersion, item.tenSanPham, item.viTriLuuTru]
        .join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Requisitions
// ─────────────────────────────────────────────────────────────────────────────

/** @returns {Promise<Requisition[]>} */
export async function getAllRequisitions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('requisitions', 'readonly')
                  .objectStore('requisitions').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/**
 * @param {Omit<Requisition, 'id'|'createdAt'>} data
 * @returns {Promise<Requisition>}
 */
export async function addRequisition(data) {
  const db   = await openDB();
  const item = { ...data, id: uuid(), createdAt: nowIso() };
  return new Promise((resolve, reject) => {
    const req = db.transaction('requisitions', 'readwrite')
                  .objectStore('requisitions').add(item);
    req.onsuccess = () => resolve(item);
    req.onerror   = () => reject(req.error);
  });
}

/**
 * @param {string}               id
 * @param {Partial<Requisition>} changes
 * @returns {Promise<Requisition>}
 */
export async function updateRequisition(id, changes) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction('requisitions', 'readwrite');
    const store = tx.objectStore('requisitions');
    const get   = store.get(id);

    get.onsuccess = () => {
      const existing = get.result;
      if (!existing) { reject(new Error(`Requisition not found: ${id}`)); return; }
      const updated = { ...existing, ...changes, id };
      const put = store.put(updated);
      put.onsuccess = () => resolve(updated);
      put.onerror   = () => reject(put.error);
    };
    get.onerror = () => reject(get.error);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Demo seed data
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Populates the database with representative records the first time it is opened.
 * No-ops if the items store already contains any data.
 */
export async function seedDemoData() {
  const existing = await getAllItems();
  if (existing.length > 0) return;

  const seeds = [
    {
      phanLoai: 'GA_HAN',    quanHe: '1.1', soLuong: 2,  spToiDaKhuon: 500000,
      maSanPhamVersion: 'PRD-X9-V2',    tenSanPham: 'Vỏ ốp Smartphone X9',
      ngayTao: '2024-01-12', ngaySuDungGanNhat: new Date().toISOString().slice(0, 10),
      viTriLuuTru: 'A1-R01-S01', trangThai: 'HOAT_DONG', ghiChu: '',
    },
    {
      phanLoai: 'GA_HAN',    quanHe: '2.1', soLuong: 10, spToiDaKhuon: 100000,
      maSanPhamVersion: 'FRM-02-A',     tenSanPham: 'Khung sườn Motor A',
      ngayTao: '2023-05-11', ngaySuDungGanNhat: '2024-09-22',
      viTriLuuTru: 'B2-R03-S05', trangThai: 'HOAT_DONG', ghiChu: '',
    },
    {
      phanLoai: 'KHUON_UON', quanHe: '1.1', soLuong: 1,  spToiDaKhuon: 800000,
      maSanPhamVersion: 'CAM-S1-V1',    tenSanPham: 'Ống kính Camera S1',
      ngayTao: '2024-02-15', ngaySuDungGanNhat: '2024-05-19',
      viTriLuuTru: 'A1-R02-S03', trangThai: 'HOAT_DONG', ghiChu: '',
    },
    {
      phanLoai: 'JIG_GIU',   quanHe: '1.1', soLuong: 1,  spToiDaKhuon: 50000,
      maSanPhamVersion: 'CK-UNIT-B4',   tenSanPham: 'Unit kiểm tra QC-04',
      ngayTao: '2022-08-20', ngaySuDungGanNhat: '2024-01-04',
      viTriLuuTru: 'C3-R01-S02', trangThai: 'BAO_TRI',   ghiChu: 'Đang chờ thay lò xo',
    },
    {
      phanLoai: 'GA_HAN',    quanHe: '1.1', soLuong: 3,  spToiDaKhuon: 200000,
      maSanPhamVersion: 'FRM-XY-V1',    tenSanPham: 'Khung xe đạp điện XY',
      ngayTao: '2018-03-10', ngaySuDungGanNhat: '2019-12-15',
      viTriLuuTru: 'D4-R02-S01', trangThai: 'KHONG_SU_DUNG', ghiChu: 'Sản phẩm ngừng SX',
    },
    {
      phanLoai: 'KHUON_UON', quanHe: '1.1', soLuong: 1,  spToiDaKhuon: 600000,
      maSanPhamVersion: 'TUB-45-PH20',  tenSanPham: 'Ống thép 45° - Phi 20',
      ngayTao: '2017-06-22', ngaySuDungGanNhat: '2018-05-30',
      viTriLuuTru: 'B1-R05-S03', trangThai: 'KHONG_SU_DUNG', ghiChu: '',
    },
  ];

  for (const seed of seeds) {
    const code = await generateCode(seed.phanLoai, seed.quanHe);
    await addItem({ ...seed, code });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Utility: clear all data (used by Settings → "Xóa toàn bộ dữ liệu")
// ─────────────────────────────────────────────────────────────────────────────

export async function clearAllData() {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['items', 'requisitions', 'counters'], 'readwrite');
    tx.objectStore('items').clear();
    tx.objectStore('requisitions').clear();
    tx.objectStore('counters').clear();
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
  // also reset cached db so openDB re-seeds on next call if needed
}
