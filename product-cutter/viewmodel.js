// viewmodel.js — aggregate selected products into cutting-plan inputs

const STOCK_LENGTH = 5950;
const STOCK_DISPLAY_OFFSET = 50;
const DEFAULT_MAX_PATTERN_WASTE = 600;

// Optimal stock-length search parameters (mirrors Rust defaults in lib.rs).
const OPT_STOCK_STEP = 100;
const OPT_MAX_CANDIDATES = 300;
const OPT_REFINE = true;
const OPT_REFINE_TOP_K = 10;
const OPT_REFINE_RADIUS = OPT_STOCK_STEP * 2;
const OPT_REFINE_STEP = 10;
const OPT_INCLUDE_COMBINATION_CANDIDATES = true;

export function buildViewModel(products, selections) {
    const grouped = new Map();

    for (const product of products) {
        const qty = selections[product.code] ?? 0;
        if (!qty) continue;

        for (const part of product.parts) {
            if (!part.length) continue;

            const key = JSON.stringify([part.boxLength, part.boxWidth, part.thickness]);

            if (!grouped.has(key)) {
                grouped.set(key, {
                    boxLength: part.boxLength,
                    boxWidth: part.boxWidth,
                    thickness: part.thickness,
                    usageMap: new Map(),
                });
            }

            const group = grouped.get(key);
            const length = Math.round(part.length);
            const existing = group.usageMap.get(length);
            if (existing) {
                existing.qty += qty;
                existing.productCodes.add(product.code);
            } else {
                group.usageMap.set(length, { qty, productCodes: new Set([product.code]) });
            }
        }
    }

    const materials = Array.from(grouped.values())
        .map(item => ({
            boxLength: item.boxLength,
            boxWidth: item.boxWidth,
            thickness: item.thickness,
            usage: Array.from(item.usageMap.entries())
                .sort(([a], [b]) => a - b)
                .map(([length, { qty, productCodes }]) => ({
                    length, qty, productCodes: Array.from(productCodes),
                })),
        }))
        .sort((a, b) => {
            const aL = a.boxLength ?? -Infinity;
            const bL = b.boxLength ?? -Infinity;
            if (aL !== bL) return bL - aL;
            return (a.thickness ?? 0) - (b.thickness ?? 0);
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

    const input = {
        lengths,
        quantities,
        stock_length: STOCK_LENGTH,
        bundle_size: 1,
        max_pattern_waste: maxPatternWaste,
    };

    const optInput = {
        lengths,
        quantities,
        bundle_size: 1,
        max_pattern_waste: maxPatternWaste,
        max_stock_length: STOCK_LENGTH,
        stock_step: OPT_STOCK_STEP,
        max_candidates: OPT_MAX_CANDIDATES,
        refine: OPT_REFINE,
        refine_top_k: OPT_REFINE_TOP_K,
        refine_radius: OPT_REFINE_RADIUS,
        refine_step: OPT_REFINE_STEP,
        include_combination_candidates: OPT_INCLUDE_COMBINATION_CANDIDATES,
    };

    return {
        material,
        input,
        optInput,
        displayStockLength: STOCK_LENGTH + STOCK_DISPLAY_OFFSET,
        result: null,
        error: lengths.length ? null : 'Không có chi tiết hợp lệ.',
        sourceCount: material.usage.length,
        requiredTotal: quantities.reduce((sum, q) => sum + q, 0),
    };
}
