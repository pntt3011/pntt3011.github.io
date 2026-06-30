// render.js — UI rendering from viewmodel data only

const numberFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const areaFormatter = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let el = {};

export function init(elements) {
    el = elements;
}

// ── Product list ───────────────────────────────────────────────────────────────

export function renderProducts(products, { onToggle, onQtyChange }) {
    if (!products.length) {
        el.productList.innerHTML = '';
        el.productListSection.hidden = true;
        return;
    }

    el.productListSection.hidden = false;
    el.productCount.textContent = `${products.length} sản phẩm`;
    el.productList.innerHTML = '';

    const fragment = document.createDocumentFragment();
    for (const product of products) {
        fragment.appendChild(buildProductItem(product, { onToggle, onQtyChange }));
    }
    el.productList.appendChild(fragment);
}

function buildProductItem(product, { onToggle, onQtyChange }) {
    const item = document.createElement('div');
    item.className = 'product-item' + (product.enabled ? '' : ' product-item--disabled');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'product-checkbox';
    checkbox.checked = product.enabled;
    checkbox.addEventListener('change', () => {
        item.classList.toggle('product-item--disabled', !checkbox.checked);
        onToggle(product.id ?? product.sheetName, checkbox.checked);
    });

    const info = document.createElement('div');
    info.className = 'product-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'product-name';
    nameEl.textContent = product.name;

    const metaEl = document.createElement('div');
    metaEl.className = 'product-meta';
    metaEl.textContent = product.order_name
        ? `${product.code} (${formatOrderName(product.order_name)})`
        : product.code;

    info.appendChild(nameEl);
    info.appendChild(metaEl);

    const qtyControl = document.createElement('div');
    qtyControl.className = 'product-qty-control';

    const qtyLabel = document.createElement('span');
    qtyLabel.className = 'product-qty-label';
    qtyLabel.textContent = 'SL:';

    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.className = 'product-qty-input';
    qtyInput.min = '0';
    qtyInput.step = '1';
    qtyInput.value = product.qty;
    qtyInput.addEventListener('change', () => {
        const newQty = Math.max(0, Math.trunc(Number(qtyInput.value) || 0));
        qtyInput.value = newQty;
        onQtyChange(product.id ?? product.sheetName, newQty);
    });

    qtyControl.appendChild(qtyLabel);
    qtyControl.appendChild(qtyInput);

    item.appendChild(checkbox);
    item.appendChild(info);
    item.appendChild(qtyControl);
    return item;
}

// ── Results panel ──────────────────────────────────────────────────────────────

export function renderResults(viewModel, { onExportEnabled }) {
    const { order_name, plans, steelWeight, steelArea, aluWeight, aluArea } = viewModel;

    if (el.resultsPanelTitle) {
        el.resultsPanelTitle.textContent = 'Thông tin lệnh sản xuất';
    }

    el.resultsList.innerHTML = '';
    const fragment = document.createDocumentFragment();

    fragment.appendChild(buildStatCardsRow(steelWeight, steelArea, aluWeight, aluArea));
    const cuttingSection = makeSection(body => buildCuttingPlansContent(body, plans));
    cuttingSection.dataset.section = 'cutting';
    fragment.appendChild(cuttingSection);

    el.resultsList.appendChild(fragment);
    onExportEnabled(plans.length > 0);
}

function buildStatCardsRow(steelWeight, steelArea, aluWeight, aluArea) {
    const row = document.createElement('div');
    row.className = 'summary-stats';

    const cards = [
        { label: 'Trọng lượng sắt', value: areaFormatter.format(steelWeight), unit: 'kg' },
        { label: 'Diện tích sắt', value: areaFormatter.format(steelArea), unit: 'm²' },
        { label: 'Trọng lượng nhôm', value: areaFormatter.format(aluWeight), unit: 'kg' },
        { label: 'Diện tích nhôm', value: areaFormatter.format(aluArea), unit: 'm²' },
    ];

    for (const card of cards) {
        const cardEl = document.createElement('div');
        cardEl.className = 'summary-stat-card';
        const labelEl = document.createElement('span');
        labelEl.className = 'summary-stat-label';
        labelEl.textContent = card.label;
        const valueEl = document.createElement('strong');
        valueEl.className = 'summary-stat-value';
        valueEl.textContent = card.value;
        const unitEl = document.createElement('span');
        unitEl.className = 'summary-stat-unit';
        unitEl.textContent = card.unit;
        cardEl.appendChild(labelEl);
        cardEl.appendChild(valueEl);
        cardEl.appendChild(unitEl);
        row.appendChild(cardEl);
    }

    return row;
}

function makeSection(buildBody) {
    const section = document.createElement('div');
    section.className = 'results-collapsible';

    buildBody(section);

    return section;
}

function buildCuttingPlansContent(body, plans) {
    if (!plans.length) {
        const empty = document.createElement('p');
        empty.className = 'results-section-empty';
        empty.textContent = 'Không tìm thấy nhóm vật liệu nào đủ dữ liệu.';
        body.appendChild(empty);
        return;
    }

    buildCuttingPlanList(body, plans);
}

function buildCuttingPlanList(container, plans) {
    const sortedPlans = plans.slice().sort((a, b) =>
        materialLabel(a.material).localeCompare(materialLabel(b.material), 'vi', { sensitivity: 'base' })
    );

    for (const plan of sortedPlans) {
        const detail = document.createElement('details');
        detail.className = 'material-details';

        const summary = document.createElement('summary');
        summary.appendChild(buildSummaryText(plan));
        summary.appendChild(buildSummaryBadges(plan));
        detail.appendChild(summary);

        const bodyEl = document.createElement('div');
        bodyEl.className = 'material-body';
        bodyEl.appendChild(buildSourceBlock(plan));
        if (plan.error) {
            bodyEl.appendChild(buildErrorBlock(plan.error));
        } else if (!plan.result) {
            bodyEl.appendChild(buildLoadingBlock());
        } else {
            bodyEl.appendChild(buildPatternBlock(plan));
        }
        detail.appendChild(bodyEl);
        container.appendChild(detail);
    }
}

function buildSummaryText(plan) {
    const wrapper = document.createElement('div');
    wrapper.className = 'summary-left';

    const toggle = document.createElement('span');
    toggle.className = 'toggle-icon';
    toggle.setAttribute('aria-hidden', 'true');
    toggle.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
    `;

    const title = document.createElement('div');
    title.className = 'material-title';
    title.textContent = materialLabel(plan.material);

    wrapper.appendChild(toggle);
    wrapper.appendChild(title);
    return wrapper;
}

function buildSummaryBadges(plan) {
    const badges = document.createElement('div');
    badges.className = 'summary-badges summary-badges--text';

    if (plan.error) {
        badges.textContent = plan.error;
    } else if (!plan.result) {
        const badge = document.createElement('span');
        badge.className = 'waste-badge waste-badge--loading';
        badge.textContent = 'đang tính…';
        badges.appendChild(badge);
    } else {
        const stockQty = document.createElement('strong');
        stockQty.className = 'summary-number';
        stockQty.textContent = formatNumber(plan.result.stock_qty);

        const wastePct = document.createElement('strong');
        wastePct.className = 'summary-number';
        wastePct.textContent = plan.result.percentage_wasted.toFixed(2);

        const stockLen = document.createElement('strong');
        stockLen.className = 'summary-number';
        stockLen.textContent = formatNumber(plan.displayStockLength ?? plan.input.stock_length);

        const badge = document.createElement('span');
        badge.className = 'waste-badge';
        badge.appendChild(stockQty);
        badge.appendChild(document.createTextNode(' thanh '));
        badge.appendChild(stockLen);
        badge.appendChild(document.createTextNode(' mm, hao hụt '));
        badge.appendChild(wastePct);
        badge.appendChild(document.createTextNode('%'));
        badges.appendChild(badge);
    }

    return badges;
}

function buildSourceBlock(plan) {
    const block = document.createElement('section');
    block.className = 'source-block';

    const title = document.createElement('div');
    title.className = 'block-title';
    title.textContent = 'Số lượng cần cắt';

    const chips = document.createElement('div');
    chips.className = 'chip-row';

    for (const usage of plan.material.usage || []) {
        const length = numberOrNull(usage.length);
        const qty = numberOrNull(usage.qty);
        if (length == null || qty == null || qty <= 0) continue;
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = `${formatNumber(length)} mm × ${formatNumber(qty)}`;
        chips.appendChild(chip);
    }

    block.appendChild(title);
    block.appendChild(chips);
    return block;
}

function buildPatternBlock(plan) {
    const block = document.createElement('section');
    block.className = 'pattern-block';

    const title = document.createElement('div');
    title.className = 'block-title';
    title.textContent = 'Kế hoạch cắt chi tiết';

    const list = document.createElement('ul');
    list.className = 'pattern-list';

    const patterns = Array.isArray(plan.result.patterns) ? plan.result.patterns : [];
    const lengths = Array.isArray(plan.result.lengths) ? plan.result.lengths : [];

    const lengthToProductCodes = new Map();
    for (const usage of plan.material.usage || []) {
        lengthToProductCodes.set(Number(usage.length), usage.productCodes || []);
    }

    for (const pattern of patterns) {
        const patternCodes = new Map();
        lengths.forEach((length, i) => {
            if (Number(pattern.counts?.[i] || 0) > 0) {
                (lengthToProductCodes.get(Number(length)) || []).forEach(({ code, order_name }) => {
                    if (!patternCodes.has(code)) patternCodes.set(code, order_name);
                });
            }
        });

        const item = document.createElement('li');
        item.className = 'pattern-item';

        const head = document.createElement('div');
        head.className = 'pattern-head';

        const name = document.createElement('div');
        name.className = 'pattern-name';
        name.textContent = Array.from(patternCodes.entries())
            .map(([code, order_name]) => order_name ? `${code} (${formatOrderName(order_name)})` : code)
            .join(' · ') || '—';

        const meta = document.createElement('div');
        meta.className = 'pattern-meta';
        meta.innerHTML = `<span class="pattern-qty">× ${formatNumber(pattern.qty)}</span>`;

        head.appendChild(name);
        head.appendChild(meta);

        const chipRow = document.createElement('ul');
        chipRow.className = 'pattern-sublist';
        lengths.forEach((length, i) => {
            const count = Number(pattern.counts?.[i] || 0);
            if (count <= 0) return;
            const li = document.createElement('li');
            li.textContent = `${formatNumber(length)} mm × ${formatNumber(count)}`;
            chipRow.appendChild(li);
        });

        const foot = document.createElement('div');
        foot.className = 'pattern-foot';
        const waste = document.createElement('span');
        waste.className = 'waste-tag';
        waste.textContent = `hao hụt ${formatNumber(pattern.waste)} mm / ${formatNumber(plan.displayStockLength ?? plan.input.stock_length)} mm`;
        foot.appendChild(waste);

        item.appendChild(head);
        item.appendChild(chipRow);
        item.appendChild(foot);
        list.appendChild(item);
    }

    block.appendChild(title);
    block.appendChild(list);
    return block;
}

// ── State / status ─────────────────────────────────────────────────────────────

export function renderEmptyState(title, description) {
    el.resultsList.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'empty-state empty-state--wide';

    const icon = document.createElement('div');
    icon.className = 'empty-state-icon';
    icon.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 4h16v16H4z"></path>
            <path d="M4 9h16"></path>
            <path d="M9 4v16"></path>
        </svg>
    `;

    const heading = document.createElement('h4');
    heading.textContent = title;

    const copy = document.createElement('p');
    copy.textContent = description;

    wrapper.appendChild(icon);
    wrapper.appendChild(heading);
    wrapper.appendChild(copy);
    el.resultsList.appendChild(wrapper);
}

export function renderErrorState(title, detail) {
    el.resultsList.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'error-state';

    const heading = document.createElement('h4');
    heading.textContent = title;

    const copy = document.createElement('p');
    copy.textContent = 'Hãy kiểm tra lại workbook hoặc thử một file khác.';
    wrapper.appendChild(heading);
    wrapper.appendChild(copy);

    if (detail) {
        const detailBox = document.createElement('div');
        detailBox.className = 'error-detail';
        detailBox.textContent = detail;
        wrapper.appendChild(detailBox);
    }

    el.resultsList.appendChild(wrapper);
}

function buildErrorBlock(message) {
    const wrapper = document.createElement('div');
    wrapper.className = 'error-state';
    const heading = document.createElement('h4');
    heading.textContent = 'Không thể tính kế hoạch';
    const copy = document.createElement('p');
    copy.textContent = message;
    wrapper.appendChild(heading);
    wrapper.appendChild(copy);
    return wrapper;
}

function buildLoadingBlock() {
    const wrapper = document.createElement('div');
    wrapper.className = 'optimizing-state';
    wrapper.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        <span>Đang tính toán kế hoạch cắt…</span>`;
    return wrapper;
}

export function setStatus(element, kind, text) {
    element.className = `status-pill status-pill--${kind}`;
    element.textContent = text;
}

// ── Targeted section refresh (called after async cutting-plan computation completes) ───

export function refreshCuttingSection(viewModel) {
    const { plans } = viewModel;
    const existing = el.resultsList.querySelector('[data-section="cutting"]');
    if (!existing) return;

    const next = makeSection(body => buildCuttingPlansContent(body, plans));
    next.dataset.section = 'cutting';
    existing.replaceWith(next);
}

// ── Shared helpers (exported for app.js export logic) ─────────────────────────

export function materialLabel(material) {
    const type = material?.type || null;
    const shape = material?.shape || null;
    const boxL = material?.box_length || null;
    const boxW = material?.box_width || null;
    const dim = boxL || boxW ? `${boxL}x${boxW}` : null;
    const thickness = material?.thickness != null ? `${material.thickness} mm` : null;
    const parts = [type, shape, dim, thickness].filter(Boolean);
    return (parts.length ? parts.join(' · ') : 'Vật liệu').toLocaleLowerCase('vi');
}

function formatOrderName(order_name) {
    if (!order_name) return order_name;
    const m = order_name.match(/^(\d+\/\d+)/);
    return "LSX " + (m ? m[1] : order_name);
}

function numberOrNull(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value) {
    const parsed = numberOrNull(value);
    if (parsed == null) return '0';
    return numberFormatter.format(Math.trunc(parsed));
}
