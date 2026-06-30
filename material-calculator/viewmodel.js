// viewmodel.js — aggregate model.js output into render-ready data

const STOCK_LENGTH = 5950;
const STOCK_DISPLAY_OFFSET = 50;
const DEFAULT_MAX_PATTERN_WASTE = 600;
const DEFAULT_METHOD = 'LZ';
const DEFAULT_BUNDLE_SIZE = 1;

// CNC bundle size (qty / lần) by shape + dimension, from the machine's cut sheet.
const CNC_BUNDLE_SIZES = {
    'hop:15x35': 20,
    'hop:20x40': 15,
    'hop:13x26': 40,
    'hop:10x20': 60,
    'hop:25x50': 12,
    'vuong:14x14': 60,
    'vuong:10x10': 90,
    'vuong:20x20': 30,
    'vuong:25x25': 24,
    'vuong:16x16': 56,
    'vuong:12x12': 90,
    'vuong:30x30': 14,
    'vuong:40x40': 10,
    'ong:19x19': 34,
    'ong:16x16': 52,
    'ong:21x21': 31,
    'ong:12.7x12.7': 74,
    'ong:13.8x13.8': 60,
};

function bundleSizeKey(shape, boxWidth, boxHeight) {
    const { normalize } = window.BomParser;
    return `${normalize(shape ?? '')}:${boxWidth}x${boxHeight}`;
}

function getBundleSize(method, shape, boxWidth, boxHeight) {
    if (method !== 'CNC') return DEFAULT_BUNDLE_SIZE;
    return CNC_BUNDLE_SIZES[bundleSizeKey(shape, boxWidth, boxHeight)] ?? DEFAULT_BUNDLE_SIZE;
}

export function buildViewModel(parsedResult, productConfigs, partMethods = {}) {
    const { products = [], order_name = null } = parsedResult;

    const productItems = products.map(p => {
        const id = p.id ?? p.sheetName;
        const cfg = productConfigs[id] ?? { qty: p.qty ?? 0, enabled: true };
        return {
            sheetName: p.sheetName,
            id,
            name: p.name,
            code: p.code,
            order_name: p.order_name ?? null,
            qty: cfg.qty,
            enabled: cfg.enabled,
            parts: (p.components ?? []).flatMap(c => c.parts ?? []).map((part, index) => ({
                ...part,
                key: `${id}::${index}`,
                method: partMethods[`${id}::${index}`] ?? DEFAULT_METHOD,
            })),
        };
    });

    return {
        order_name,
        products: productItems,
        ...aggregateSummary(products, productConfigs),
        ...aggregateCuttingPlan(products, productConfigs, partMethods),
    };
}

function getEnabledQty(product, productConfigs) {
    const id = product.id ?? product.sheetName;
    const cfg = productConfigs[id];
    const qty = cfg?.qty ?? product.qty ?? 0;
    return (cfg?.enabled ?? true) && qty > 0 ? qty : 0;
}

function aggregateSummary(products, productConfigs) {
    const {
        calcSteelWeightPerUnit,
        calcSteelAreaPerUnit,
        normalize,
    } = window.BomParser;

    let steelWeight = 0;
    let steelArea = 0;
    let aluWeight = 0;
    let aluArea = 0;

    for (const product of products) {
        const qty = getEnabledQty(product, productConfigs);
        if (!qty) continue;

        for (const component of product.components) {
            for (const part of component.parts) {
                const total = part.qty * qty;
                const weight = calcSteelWeightPerUnit(part) * total;
                const area = calcSteelAreaPerUnit(part) * total;

                if (normalize(part.type ?? '').startsWith('nhom')) {
                    aluWeight += weight;
                    aluArea += area;
                } else {
                    steelWeight += weight;
                    steelArea += area;
                }
            }
        }
    }

    return { steelWeight, steelArea, aluWeight, aluArea };
}

// ── Cutting plan ───────────────────────────────────────────────────────────────

function aggregateCuttingPlan(products, productConfigs, partMethods = {}) {
    const { normalize } = window.BomParser;
    const grouped = new Map();

    for (const product of products) {
        const qty = getEnabledQty(product, productConfigs);
        if (!qty) continue;

        const id = product.id ?? product.sheetName;
        let partIndex = -1;

        for (const component of product.components) {
            for (const part of component.parts) {
                partIndex++;
                if (component.kind !== 'steel') continue;
                if (!part.length || !part.qty) continue;
                if (normalize(part.shape ?? '') === 'la det') continue;

                const method = partMethods[`${id}::${partIndex}`] ?? DEFAULT_METHOD;

                const key = JSON.stringify([
                    part.box_width,
                    part.box_height,
                    normalize(part.type ?? ''),
                    normalize(part.shape ?? ''),
                    part.thickness,
                    method,
                ]);

                if (!grouped.has(key)) {
                    grouped.set(key, {
                        box_width: part.box_width,
                        box_length: part.box_height,
                        type: part.type,
                        shape: part.shape,
                        thickness: part.thickness,
                        method,
                        usageMap: new Map(),
                    });
                }

                const group = grouped.get(key);
                const totalQty = Math.round(part.qty * qty);
                if (totalQty <= 0) continue;

                const existing = group.usageMap.get(part.length);
                if (!existing) {
                    group.usageMap.set(part.length, { qty: totalQty, productCodes: new Map([[product.code, product.order_name ?? null]]) });
                } else {
                    existing.qty += totalQty;
                    existing.productCodes.set(product.code, product.order_name ?? null);
                }
            }
        }
    }

    const materials = Array.from(grouped.values())
        .map(item => ({
            box_width: item.box_width,
            box_length: item.box_length,
            type: item.type,
            shape: item.shape,
            thickness: item.thickness,
            method: item.method,
            usage: Array.from(item.usageMap.entries())
                .sort(([a], [b]) => a - b)
                .map(([length, { qty, productCodes }]) => ({
                    length, qty, productCodes: Array.from(productCodes.entries()).map(([code, order_name]) => ({ code, order_name })),
                })),
        }))
        .sort((a, b) => {
            const aL = a.box_length ?? -Infinity;
            const bL = b.box_length ?? -Infinity;
            if (aL !== bL) return bL - aL;
            return `${a.type}${a.shape}${a.method}`.localeCompare(`${b.type}${b.shape}${b.method}`, 'vi', { sensitivity: 'base' });
        });

    const plans = materials.map(computeMaterialPlan);
    return { materials, plans };
}

function collectMaterialItems(material) {
    const lengths = [];
    const quantities = [];
    for (const usage of material.usage) {
        const length = Number(usage.length);
        const qty = Number(usage.qty);
        if (!Number.isFinite(length) || !Number.isFinite(qty) || qty <= 0) continue;
        lengths.push(Math.trunc(length));
        quantities.push(Math.trunc(qty));
    }
    const maxInputLength = lengths.length ? Math.max(...lengths) : 0;
    const maxPatternWaste = Math.max(DEFAULT_MAX_PATTERN_WASTE, maxInputLength - 1);
    return { lengths, quantities, maxPatternWaste };
}

function computeMaterialPlan(material) {
    const { lengths, quantities, maxPatternWaste } = collectMaterialItems(material);
    const bundleSize = getBundleSize(material.method, material.shape, material.box_width, material.box_length);

    const input = {
        lengths,
        quantities,
        stock_length: STOCK_LENGTH,
        bundle_size: bundleSize,
        max_pattern_waste: maxPatternWaste,
    };

    return {
        material,
        input,
        displayStockLength: STOCK_LENGTH + STOCK_DISPLAY_OFFSET,
        result: null,
        error: lengths.length ? null : 'Không có chi tiết hợp lệ.',
        sourceCount: material.usage.length,
        requiredTotal: quantities.reduce((sum, q) => sum + q, 0),
    };
}
