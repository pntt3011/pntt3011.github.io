// viewmodel.js — aggregate model.js output into render-ready data

import {
    compute_cutting_plan_numeric,
    compute_optimal_stock_cutting_plan_numeric,
} from '../shared/lib/pkg/steel_cutting_wasm.js';

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

export function buildViewModel(parsedResult, productConfigs) {
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
        };
    });

    return {
        order_name,
        products: productItems,
        ...aggregateSummary(products, productConfigs),
        powderCoating: aggregateSteelPainting(products, productConfigs),
        woodPainting: aggregateWoodPainting(products, productConfigs),
        ...aggregateCuttingPlan(products, productConfigs),
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
        calcWoodAreaPerUnit,
        calcWoodVolumePerUnit,
    } = window.BomParser;

    let steelWeight = 0;
    let steelArea = 0;
    let woodArea = 0;
    let woodVolume = 0;

    for (const product of products) {
        const qty = getEnabledQty(product, productConfigs);
        if (!qty) continue;

        for (const component of product.components) {
            for (const part of component.parts) {
                const total = part.qty * qty;
                if (component.kind === 'steel') {
                    steelWeight += calcSteelWeightPerUnit(part) * total;
                    steelArea += calcSteelAreaPerUnit(part) * total;
                } else {
                    woodArea += calcWoodAreaPerUnit(part) * total;
                    woodVolume += calcWoodVolumePerUnit(part) * total;
                }
            }
        }
    }

    return { steelWeight, steelArea, woodArea, woodVolume };
}

// Steel: color code from _(TĐ.<code>) on component headers, area per part via calcSteelAreaPerUnit
function aggregateSteelPainting(products, productConfigs) {
    const { calcSteelAreaPerUnit } = window.BomParser;
    const map = new Map();

    for (const product of products) {
        const qty = getEnabledQty(product, productConfigs);
        if (!qty) continue;

        for (const component of product.components) {
            if (component.kind !== 'steel' || !component.paint_color) continue;
            for (const part of component.parts) {
                const area = calcSteelAreaPerUnit(part) * part.qty * qty;
                map.set(component.paint_color, (map.get(component.paint_color) ?? 0) + area);
            }
        }
    }

    return Array.from(map.entries())
        .map(([code, area]) => ({ code, area }))
        .sort((a, b) => a.code.localeCompare(b.code));
}

// Wood: color code from _(S.<code>) on component headers, area per part via calcWoodAreaPerUnit

const WOOD_PAINT_RE = /\(S\.([^)]+)\)/;

function aggregateWoodPainting(products, productConfigs) {
    const { calcWoodAreaPerUnit } = window.BomParser;
    const map = new Map();

    for (const product of products) {
        const qty = getEnabledQty(product, productConfigs);
        if (!qty) continue;

        for (const component of product.components) {
            if (component.kind !== 'wood') continue;
            const match = component.name.match(WOOD_PAINT_RE);
            if (!match) continue;
            const code = match[1].trim();
            for (const part of component.parts) {
                const area = calcWoodAreaPerUnit(part) * part.qty * qty;
                map.set(code, (map.get(code) ?? 0) + area);
            }
        }
    }

    return Array.from(map.entries())
        .map(([code, area]) => ({ code, area }))
        .sort((a, b) => a.code.localeCompare(b.code));
}

// ── Cutting plan ───────────────────────────────────────────────────────────────

function aggregateCuttingPlan(products, productConfigs) {
    const { normalize } = window.BomParser;
    const grouped = new Map();

    for (const product of products) {
        const qty = getEnabledQty(product, productConfigs);
        if (!qty) continue;

        for (const component of product.components) {
            if (component.kind !== 'steel') continue;

            for (const part of component.parts) {
                if (!part.length || !part.qty) continue;
                if (normalize(part.shape ?? '') === 'la det') continue;

                const key = JSON.stringify([
                    part.box_width,
                    part.box_height,
                    normalize(part.type ?? ''),
                    normalize(part.shape ?? ''),
                    part.thickness,
                    part.cut,
                ]);

                if (!grouped.has(key)) {
                    grouped.set(key, {
                        box_width: part.box_width,
                        box_length: part.box_height,
                        type: part.type,
                        shape: part.shape,
                        thickness: part.thickness,
                        cut: part.cut,
                        usageMap: new Map(),
                    });
                }

                const group = grouped.get(key);
                const totalQty = Math.round(part.qty * qty);
                if (totalQty <= 0) continue;

                const existing = group.usageMap.get(part.length);
                if (!existing) {
                    group.usageMap.set(part.length, { qty: totalQty, productCodes: new Set([product.code]) });
                } else {
                    existing.qty += totalQty;
                    existing.productCodes.add(product.code);
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
            cut: item.cut,
            usage: Array.from(item.usageMap.entries())
                .sort(([a], [b]) => a - b)
                .map(([length, { qty, productCodes }]) => ({
                    length, qty, productCodes: Array.from(productCodes),
                })),
        }))
        .sort((a, b) => {
            const aL = a.box_length ?? -Infinity;
            const bL = b.box_length ?? -Infinity;
            if (aL !== bL) return bL - aL;
            return `${a.type}${a.shape}${a.cut}`.localeCompare(`${b.type}${b.shape}${b.cut}`, 'vi', { sensitivity: 'base' });
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

    let result = null;
    let error = null;

    if (!lengths.length) {
        error = 'Không có chi tiết hợp lệ.';
    } else {
        try {
            result = compute_cutting_plan_numeric(input);
        } catch (caught) {
            error = caught?.message || String(caught);
        }
    }

    return {
        material,
        input,
        displayStockLength: STOCK_LENGTH + STOCK_DISPLAY_OFFSET,
        result,
        error,
        sourceCount: material.usage.length,
        requiredTotal: quantities.reduce((sum, q) => sum + q, 0),
    };
}

export function computeOptimalMaterialPlan(material) {
    const { lengths, quantities, maxPatternWaste } = collectMaterialItems(material);

    if (!lengths.length) {
        return {
            material,
            input: { lengths, quantities, stock_length: STOCK_LENGTH, bundle_size: 1, max_pattern_waste: maxPatternWaste },
            result: null,
            error: 'Không có chi tiết hợp lệ.',
            sourceCount: material.usage.length,
            requiredTotal: 0,
        };
    }

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

    let result = null;
    let error = null;
    let bestStockLength = STOCK_LENGTH;

    try {
        const optResult = compute_optimal_stock_cutting_plan_numeric(optInput);
        result = optResult.best_result;
        bestStockLength = optResult.best_stock_length;
    } catch (caught) {
        error = caught?.message || String(caught);
    }

    return {
        material,
        input: {
            lengths,
            quantities,
            stock_length: bestStockLength,
            bundle_size: 1,
            max_pattern_waste: maxPatternWaste,
        },
        displayStockLength: bestStockLength + STOCK_DISPLAY_OFFSET,
        result,
        error,
        sourceCount: material.usage.length,
        requiredTotal: quantities.reduce((sum, q) => sum + q, 0),
    };
}
