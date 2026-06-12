// view.js — UI rendering from product list and viewmodel data

const numberFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const WASTE_ALERT_PCT = 1.0;

let el = {};

export function init(elements) {
    el = elements;
}

// ── Product selection ─────────────────────────────────────────────────────────

export function renderProductOptions(products) {
    el.productSelect.innerHTML = '';
    for (const product of products) {
        const option = document.createElement('option');
        option.value = product.code;
        option.textContent = product.name ? `${product.code} — ${product.name}` : product.code;
        el.productSelect.appendChild(option);
    }
}

export function renderSelectedProducts(selectedCodes, products, selections, { onQtyChange, onRemove }) {
    el.selectedList.innerHTML = '';

    if (!selectedCodes.length) {
        el.selectedListSection.hidden = true;
        return;
    }

    el.selectedListSection.hidden = false;
    el.selectedCount.textContent = `${selectedCodes.length} sản phẩm`;

    const productMap = new Map(products.map(p => [p.code, p]));
    const fragment = document.createDocumentFragment();

    for (const code of selectedCodes) {
        const product = productMap.get(code);
        if (!product) continue;
        fragment.appendChild(buildSelectedItem(product, selections[code] ?? 1, { onQtyChange, onRemove }));
    }
    el.selectedList.appendChild(fragment);
}

function buildSelectedItem(product, qty, { onQtyChange, onRemove }) {
    const item = document.createElement('div');
    item.className = 'product-item';

    const info = document.createElement('div');
    info.className = 'product-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'product-name';
    nameEl.textContent = product.name || product.code;

    const metaEl = document.createElement('div');
    metaEl.className = 'product-meta';
    metaEl.textContent = product.code;

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
    qtyInput.value = qty;
    qtyInput.addEventListener('change', () => {
        const newQty = Math.max(0, Math.trunc(Number(qtyInput.value) || 0));
        qtyInput.value = newQty;
        onQtyChange(product.code, newQty);
    });

    qtyControl.appendChild(qtyLabel);
    qtyControl.appendChild(qtyInput);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'remove-button';
    removeButton.setAttribute('aria-label', 'Xóa');
    removeButton.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>`;
    removeButton.addEventListener('click', () => onRemove(product.code));

    item.appendChild(info);
    item.appendChild(qtyControl);
    item.appendChild(removeButton);
    return item;
}

// ── Results panel ──────────────────────────────────────────────────────────────

export function renderResults(viewModel, { onExportEnabled }) {
    const { plans, optimizedPlans } = viewModel;

    el.resultsList.innerHTML = '';
    const fragment = document.createDocumentFragment();

    const { badgeEl, setActiveView, wire } = buildCuttingDualBadge(plans, optimizedPlans);
    const cuttingSection = makeCollapsible(
        'Kế hoạch cắt vật tư',
        body => wire(buildCuttingPlansContent(body, plans, optimizedPlans, setActiveView)),
        true,
        badgeEl,
    );
    cuttingSection.dataset.section = 'cutting';
    fragment.appendChild(cuttingSection);

    el.resultsList.appendChild(fragment);
    onExportEnabled(plans.length > 0);
}

function buildCuttingDualBadge(plans, optimizedPlans) {
    const container = document.createElement('div');
    container.className = 'collapsible-waste-badges';

    const slider = document.createElement('div');
    slider.className = 'collapsible-waste-badge-slider';
    container.appendChild(slider);

    const allOk = plans.some(p => p.result) && plans.every(p => !p.result || p.result.percentage_wasted < WASTE_ALERT_PCT);
    const beforeBadge = makeSingleWasteBadge(plans, 'Gốc');
    if (beforeBadge && allOk) beforeBadge.classList.add('collapsible-waste-badge--ok');
    const afterBadge = optimizedPlans
        ? makeSingleWasteBadge(optimizedPlans, 'Tối ưu')
        : plans.length > 0 ? makeLoadingBadge('Tối ưu: đang tính…') : null;
    if (afterBadge) afterBadge.classList.add('collapsible-waste-badge--optimized', 'collapsible-waste-badge--inactive');

    if (beforeBadge) container.appendChild(beforeBadge);
    if (afterBadge) container.appendChild(afterBadge);

    if (container.children.length === 1) return { badgeEl: null, setActiveView: () => { }, wire: fn => fn };

    const group = document.createElement('div');
    group.className = 'collapsible-waste-badge-group';
    const label = document.createElement('span');
    label.className = 'collapsible-waste-label';
    label.textContent = 'Hao hụt';
    group.appendChild(label);
    group.appendChild(container);

    function positionSlider(badge) {
        slider.style.width = badge.offsetWidth + 'px';
        slider.style.transform = `translateX(${badge.offsetLeft - 3}px)`;
    }

    function setActiveView(view) {
        const isAfter = view === 'after';
        beforeBadge?.classList.toggle('collapsible-waste-badge--inactive', isAfter);
        afterBadge?.classList.toggle('collapsible-waste-badge--inactive', !isAfter);
        slider.classList.toggle('collapsible-waste-badge-slider--optimized', isAfter || (!isAfter && allOk));
        positionSlider(isAfter ? afterBadge : beforeBadge);
    }

    function wire(switchView) {
        beforeBadge?.classList.add('collapsible-waste-badge--clickable');
        afterBadge?.classList.add('collapsible-waste-badge--clickable');
        beforeBadge?.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); switchView('before'); });
        afterBadge?.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); switchView('after'); });

        requestAnimationFrame(() => {
            slider.style.transition = 'none';
            positionSlider(beforeBadge);
            slider.classList.toggle('collapsible-waste-badge-slider--optimized', allOk);
            requestAnimationFrame(() => { slider.style.transition = ''; });
        });
    }

    return { badgeEl: group, setActiveView, wire };
}

function makeSingleWasteBadge(plans, label) {
    let totalWaste = 0;
    let totalStock = 0;

    for (const plan of plans) {
        if (!plan.result) continue;
        totalWaste += Number(plan.result.total_waste || 0);
        totalStock += Number(plan.result.stock_qty || 0) * Number(plan.input.stock_length || 0);
    }

    if (!totalStock) return null;

    const wastePct = (totalWaste / totalStock) * 100;
    const badge = document.createElement('span');
    badge.className = 'collapsible-waste-badge';
    badge.textContent = `${label}: ${wastePct.toFixed(2)}%`;
    return badge;
}

function makeLoadingBadge(text) {
    const badge = document.createElement('span');
    badge.className = 'collapsible-waste-badge collapsible-waste-badge--loading';
    badge.textContent = text;
    return badge;
}

function buildOptimizingState() {
    const wrapper = document.createElement('div');
    wrapper.className = 'optimizing-state';
    wrapper.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        <span>Đang tính toán kế hoạch tối ưu…</span>`;
    return wrapper;
}

function makeCollapsible(titleText, buildBody, defaultOpen = true, badge = null) {
    const details = document.createElement('details');
    details.className = 'results-collapsible';
    details.open = defaultOpen;

    const summary = document.createElement('summary');
    summary.className = 'results-collapsible-header';
    summary.innerHTML = `
        <span class="toggle-icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
        </span>`;
    const titleEl = document.createElement('span');
    titleEl.textContent = titleText;
    summary.appendChild(titleEl);
    if (badge) summary.appendChild(badge);
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'results-collapsible-body';
    buildBody(body);
    details.appendChild(body);

    return details;
}

function buildCuttingPlansContent(body, plans, optimizedPlans, setActiveView) {
    if (!plans.length) {
        const empty = document.createElement('p');
        empty.className = 'results-section-empty';
        empty.textContent = 'Không tìm thấy nhóm vật liệu nào đủ dữ liệu.';
        body.appendChild(empty);
        return view => { };
    }

    const beforeSection = document.createElement('div');
    buildCuttingPlanList(beforeSection, plans);
    body.appendChild(beforeSection);

    const afterSection = document.createElement('div');
    afterSection.hidden = true;
    if (optimizedPlans) {
        const readyPlans = optimizedPlans.filter(Boolean);
        if (readyPlans.length) buildCuttingPlanList(afterSection, readyPlans);
        if (optimizedPlans.some(p => p === null)) afterSection.appendChild(buildOptimizingState());
    } else {
        afterSection.appendChild(buildOptimizingState());
    }
    body.appendChild(afterSection);

    return function switchView(view) {
        beforeSection.hidden = view === 'after';
        afterSection.hidden = view === 'before';
        setActiveView(view);
    };
}

function buildCuttingPlanList(container, plans) {
    const sortedPlans = plans.slice().sort((a, b) =>
        materialLabel(a.material).localeCompare(materialLabel(b.material), 'vi', { sensitivity: 'base' })
    );

    for (const plan of sortedPlans) {
        const isAlert = !plan.error && plan.result?.percentage_wasted >= WASTE_ALERT_PCT;

        const detail = document.createElement('details');
        detail.className = 'material-details' + (isAlert ? ' material-details--alert' : '');

        const summary = document.createElement('summary');
        summary.appendChild(buildSummaryText(plan));
        summary.appendChild(buildSummaryBadges(plan, isAlert));
        detail.appendChild(summary);

        const bodyEl = document.createElement('div');
        bodyEl.className = 'material-body';
        bodyEl.appendChild(buildSourceBlock(plan));
        if (plan.error) {
            bodyEl.appendChild(buildErrorBlock(plan.error));
        } else if (!plan.result) {
            bodyEl.appendChild(buildLoadingBlock());
        } else {
            bodyEl.appendChild(buildPatternBlock(plan, isAlert));
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

function buildSummaryBadges(plan, isAlert) {
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
        badge.className = 'waste-badge' + (isAlert ? ' waste-badge--alert' : ' waste-badge--ok');
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

function buildPatternBlock(plan, materialIsAlert = false) {
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
        const patternWastePct = plan.input.stock_length > 0
            ? (pattern.waste / plan.input.stock_length) * 100
            : 0;
        const patternAlert = materialIsAlert && patternWastePct >= WASTE_ALERT_PCT;

        const patternCodes = new Set();
        lengths.forEach((length, i) => {
            if (Number(pattern.counts?.[i] || 0) > 0) {
                (lengthToProductCodes.get(Number(length)) || []).forEach(code => patternCodes.add(code));
            }
        });

        const item = document.createElement('li');
        item.className = 'pattern-item' + (patternAlert ? ' pattern-item--alert' : '');

        const head = document.createElement('div');
        head.className = 'pattern-head';

        const name = document.createElement('div');
        name.className = 'pattern-name';
        name.textContent = Array.from(patternCodes).join(' · ') || '—';

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
        waste.className = 'waste-tag' + (patternAlert ? ' waste-tag--alert' : '');
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
    copy.textContent = 'Hãy kiểm tra lại dữ liệu hoặc thử lại.';
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

// ── Targeted section refresh (called after async optimization completes) ───────

export function refreshCuttingSection(viewModel) {
    const { plans, optimizedPlans } = viewModel;
    const existing = el.resultsList.querySelector('[data-section="cutting"]');
    if (!existing) return;

    const wasOpen = existing.open;
    const { badgeEl, setActiveView, wire } = buildCuttingDualBadge(plans, optimizedPlans);
    const next = makeCollapsible(
        'Kế hoạch cắt vật tư',
        body => wire(buildCuttingPlansContent(body, plans, optimizedPlans, setActiveView)),
        wasOpen,
        badgeEl,
    );
    next.dataset.section = 'cutting';
    existing.replaceWith(next);
}

// ── Shared helpers ──────────────────────────────────────────────────────────────

export function materialLabel(material) {
    const boxL = material?.boxLength || null;
    const boxW = material?.boxWidth || null;
    const dim = boxL || boxW ? `${formatNumber(boxL)}x${formatNumber(boxW)} mm` : null;
    const thickness = material?.thickness != null ? `dày ${formatDecimal(material.thickness)} mm` : null;
    const parts = [dim, thickness].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'Vật liệu';
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

function formatDecimal(value) {
    const parsed = numberOrNull(value);
    if (parsed == null) return '0';
    return numberFormatter.format(parsed);
}
