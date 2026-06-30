// render.js — UI rendering from viewmodel data only

const numberFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const areaFormatter = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let el = {};

export function init(elements) {
    el = elements;
}

// Collapse state persists across re-renders (e.g. clicking "Tính toán"), keyed by
// order name for groups and product id for per-product parts sections.
const groupExpandedState = new Map();
const productExpandedState = new Map();

// ── Product list ───────────────────────────────────────────────────────────────

export function renderProducts(products, { onToggle, onQtyChange, onGroupToggle, onMethodChange }) {
    if (!products.length) {
        el.productList.innerHTML = '';
        el.productListSection.hidden = true;
        return;
    }

    el.productListSection.hidden = false;
    el.productList.innerHTML = '';

    const groups = new Map();
    for (const product of products) {
        const key = product.order_name ?? '';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(product);
    }

    const fragment = document.createDocumentFragment();
    for (const [orderName, groupProducts] of groups) {
        const itemCheckboxes = [];
        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'product-group-items';

        let groupCheckbox = null;
        const syncGroupCheckbox = () => {
            if (!groupCheckbox) return;
            const allEnabled = itemCheckboxes.every(cb => cb.checked);
            const someEnabled = itemCheckboxes.some(cb => cb.checked);
            groupCheckbox.checked = allEnabled;
            groupCheckbox.indeterminate = !allEnabled && someEnabled;
        };

        if (orderName) {
            const header = buildGroupHeader(orderName, groupProducts, {
                onGroupToggle,
                onGroupCheckboxChange: checked => {
                    for (const cb of itemCheckboxes) {
                        if (cb.checked !== checked) {
                            cb.checked = checked;
                            cb.dispatchEvent(new Event('change'));
                        }
                    }
                },
                itemsContainer,
            });
            groupCheckbox = header.querySelector('.product-group-checkbox');
            fragment.appendChild(header);
        }

        for (const product of groupProducts) {
            const item = buildProductItem(product, { onToggle, onQtyChange, onAfterToggle: syncGroupCheckbox, onMethodChange });
            const checkbox = item.querySelector('.product-checkbox');
            itemCheckboxes.push(checkbox);
            itemsContainer.appendChild(item);
        }

        fragment.appendChild(itemsContainer);
    }
    el.productList.appendChild(fragment);
}

function buildGroupHeader(orderName, groupProducts, { onGroupToggle, onGroupCheckboxChange, itemsContainer }) {
    const header = document.createElement('div');
    header.className = 'product-group-header';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'product-group-collapse';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>';

    const expanded = groupExpandedState.get(orderName) ?? false;
    itemsContainer.hidden = !expanded;
    toggle.setAttribute('aria-expanded', String(expanded));
    const toggleCollapse = () => {
        const nowExpanded = itemsContainer.hidden;
        itemsContainer.hidden = !nowExpanded;
        toggle.setAttribute('aria-expanded', String(nowExpanded));
        groupExpandedState.set(orderName, nowExpanded);
    };

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'product-group-checkbox';
    const allEnabled = groupProducts.every(p => p.enabled);
    const someEnabled = groupProducts.some(p => p.enabled);
    checkbox.checked = allEnabled;
    checkbox.indeterminate = !allEnabled && someEnabled;
    checkbox.addEventListener('change', () => {
        onGroupToggle(groupProducts.map(p => p.id ?? p.sheetName), checkbox.checked);
        onGroupCheckboxChange(checkbox.checked);
    });
    checkbox.addEventListener('click', e => e.stopPropagation());

    const label = document.createElement('span');
    label.className = 'product-group-title';
    label.textContent = formatOrderName(orderName);

    header.appendChild(toggle);
    header.appendChild(checkbox);
    header.appendChild(label);
    header.addEventListener('click', e => {
        if (e.target === checkbox) return;
        toggleCollapse();
    });
    return header;
}

function buildProductItem(product, { onToggle, onQtyChange, onAfterToggle, onMethodChange }) {
    const item = document.createElement('div');
    item.className = 'product-item' + (product.enabled ? '' : ' product-item--disabled');

    const row = document.createElement('div');
    row.className = 'product-item-row';

    const productKey = product.id ?? product.sheetName;
    const hasParts = product.parts.length > 0;
    let partsContainer = null;

    if (hasParts) {
        partsContainer = buildProductParts(product.parts, { onMethodChange });
        const expanded = productExpandedState.get(productKey) ?? false;
        partsContainer.hidden = !expanded;
    }

    const collapseToggle = document.createElement('button');
    collapseToggle.type = 'button';
    collapseToggle.className = 'product-item-collapse';
    collapseToggle.setAttribute('aria-expanded', String(!!partsContainer && !partsContainer.hidden));
    collapseToggle.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>';
    if (!hasParts) collapseToggle.disabled = true;
    collapseToggle.addEventListener('click', () => {
        if (!partsContainer) return;
        const nowExpanded = partsContainer.hidden;
        partsContainer.hidden = !nowExpanded;
        collapseToggle.setAttribute('aria-expanded', String(nowExpanded));
        productExpandedState.set(productKey, nowExpanded);
    });

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'product-checkbox';
    checkbox.checked = product.enabled;
    checkbox.addEventListener('change', () => {
        item.classList.toggle('product-item--disabled', !checkbox.checked);
        onToggle(product.id ?? product.sheetName, checkbox.checked);
        if (onAfterToggle) onAfterToggle();
    });

    const info = document.createElement('div');
    info.className = 'product-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'product-name';
    nameEl.textContent = product.name;

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
    qtyInput.value = product.qty;
    qtyInput.addEventListener('change', () => {
        const newQty = Math.max(0, Math.trunc(Number(qtyInput.value) || 0));
        qtyInput.value = newQty;
        onQtyChange(product.id ?? product.sheetName, newQty);
    });

    qtyControl.appendChild(qtyLabel);
    qtyControl.appendChild(qtyInput);

    row.appendChild(collapseToggle);
    row.appendChild(checkbox);
    row.appendChild(info);
    row.appendChild(qtyControl);
    item.appendChild(row);

    if (partsContainer) {
        item.appendChild(partsContainer);
    }

    return item;
}

function buildProductParts(parts, { onMethodChange }) {
    const wrapper = document.createElement('div');
    wrapper.className = 'product-parts';

    for (const part of parts) {
        const partRow = document.createElement('div');
        partRow.className = 'product-part-row';

        const info = document.createElement('div');
        info.className = 'product-part-info';

        const nameEl = document.createElement('div');
        nameEl.className = 'product-part-name';
        nameEl.textContent = part.name || partMeta(part);

        const metaEl = document.createElement('div');
        metaEl.className = 'product-part-meta';
        metaEl.textContent = partMeta(part);

        info.appendChild(nameEl);
        info.appendChild(metaEl);
        partRow.appendChild(info);

        const methodToggle = document.createElement('button');
        methodToggle.type = 'button';
        methodToggle.className = 'method-toggle';
        methodToggle.dataset.method = part.method;
        methodToggle.textContent = part.method;
        methodToggle.addEventListener('click', () => {
            const nextMethod = part.method === 'LZ' ? 'CNC' : 'LZ';
            part.method = nextMethod;
            methodToggle.dataset.method = nextMethod;
            methodToggle.textContent = nextMethod;
            onMethodChange(part.key, nextMethod);
        });
        partRow.appendChild(methodToggle);

        wrapper.appendChild(partRow);
    }

    return wrapper;
}

function partMeta(part) {
    const dim = part.box_width && part.box_height ? `${part.box_width}x${part.box_height}` : null;
    const length = part.length != null ? `L${part.length}` : null;
    const thickness = part.thickness != null ? `${part.thickness}mm` : null;
    const segments = [part.shape, part.type, dim, length, thickness].filter(Boolean);
    return segments.join(' · ');
}

// ── Results panel ──────────────────────────────────────────────────────────────

export function renderResults(viewModel, { onExportEnabled }) {
    const { order_name, plans, flatSheetPlans, steelWeight, steelArea, aluWeight, aluArea } = viewModel;

    if (el.resultsPanelTitle) {
        el.resultsPanelTitle.textContent = 'Thông tin lệnh sản xuất';
    }

    el.resultsList.innerHTML = '';
    const fragment = document.createDocumentFragment();

    fragment.appendChild(buildStatCardsRow(steelWeight, steelArea, aluWeight, aluArea));
    const cuttingSection = makeSection(body => buildCuttingPlansContent(body, plans));
    cuttingSection.dataset.section = 'cutting';
    fragment.appendChild(cuttingSection);

    if (flatSheetPlans && flatSheetPlans.length) {
        const flatSheetSection = makeSection(body => buildFlatSheetPlanList(body, flatSheetPlans));
        flatSheetSection.dataset.section = 'flat-sheet';
        fragment.appendChild(flatSheetSection);
    }

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

function buildFlatSheetPlanList(container, flatSheetPlans) {
    for (const sheetPlan of flatSheetPlans) {
        const detail = document.createElement('details');
        detail.className = 'material-details';

        const summary = document.createElement('summary');
        summary.appendChild(buildFlatSheetSummaryText(sheetPlan));
        summary.appendChild(buildFlatSheetSummaryBadges(sheetPlan));
        detail.appendChild(summary);

        const bodyEl = document.createElement('div');
        bodyEl.className = 'material-body';
        bodyEl.appendChild(buildFlatSheetSourceBlock(sheetPlan));
        detail.appendChild(bodyEl);

        container.appendChild(detail);
    }
}

function buildFlatSheetSummaryText(sheetPlan) {
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
    title.textContent = `sắt tấm · ${sheetPlan.thickness} mm`;

    wrapper.appendChild(toggle);
    wrapper.appendChild(title);
    return wrapper;
}

function buildFlatSheetSummaryBadges(sheetPlan) {
    const badges = document.createElement('div');
    badges.className = 'summary-badges summary-badges--text';

    const sheetQty = document.createElement('strong');
    sheetQty.className = 'summary-number';
    sheetQty.textContent = formatNumber(sheetPlan.sheetCount);

    const badge = document.createElement('span');
    badge.className = 'waste-badge';
    badge.appendChild(sheetQty);
    badge.appendChild(document.createTextNode(` tấm ${formatNumber(sheetPlan.sheetWidth)}x${formatNumber(sheetPlan.sheetHeight)} mm`));
    badges.appendChild(badge);

    return badges;
}

function buildFlatSheetSourceBlock(sheetPlan) {
    const block = document.createElement('section');
    block.className = 'source-block';

    const title = document.createElement('div');
    title.className = 'block-title';
    title.textContent = `Số lượng cần cắt (tổng ${areaFormatter.format(sheetPlan.totalArea)} m²)`;

    const chips = document.createElement('div');
    chips.className = 'chip-row';

    for (const usage of sheetPlan.usage || []) {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = `${formatNumber(usage.box_height)}x${formatNumber(usage.length)} mm × ${formatNumber(usage.qty)}`;
        chips.appendChild(chip);
    }

    block.appendChild(title);
    block.appendChild(chips);
    return block;
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

    const rawPatterns = Array.isArray(plan.result.patterns) ? plan.result.patterns : [];
    const lengths = Array.isArray(plan.result.lengths) ? plan.result.lengths : [];
    const bundleSize = Number(plan.input?.bundle_size) || 1;

    const patterns = rawPatterns.flatMap(pattern => {
        if (!pattern.is_secondary || bundleSize <= 1) {
            return [{ ...pattern, manual: pattern.is_secondary && pattern.qty < bundleSize }];
        }
        if (pattern.qty < bundleSize) {
            return [{ ...pattern, manual: true }];
        }

        const bundledQty = Math.floor(pattern.qty / bundleSize) * bundleSize;
        const remainderQty = pattern.qty % bundleSize;
        const rows = [];
        if (bundledQty > 0) {
            rows.push({ ...pattern, qty: bundledQty, manual: false });
        }
        if (remainderQty > 0) {
            rows.push({ ...pattern, qty: remainderQty, manual: true });
        }
        return rows;
    });

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
        if (plan.material.method === 'CNC' && pattern.manual) {
            const manualTag = document.createElement('span');
            manualTag.className = 'pattern-manual-tag';
            manualTag.textContent = 'cắt cơ';
            meta.appendChild(manualTag);
        }

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
    const label = (parts.length ? parts.join(' · ') : 'Vật liệu').toLocaleLowerCase('vi');
    return material?.method ? `${label} · ${material.method}` : label;
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
