// viewmodel.js — aggregate model.js output into render-ready data

export function buildViewModel(parsedResult, productConfigs) {
    const { products = [], order_name = null } = parsedResult;

    const productItems = products.map(p => {
        const cfg = productConfigs[p.sheetName] ?? { qty: p.qty ?? 0, enabled: true };
        return {
            sheetName: p.sheetName,
            name: p.name,
            code: p.code,
            qty: cfg.qty,
            enabled: cfg.enabled,
        };
    });

    return {
        order_name,
        products: productItems,
        ...aggregateSummary(products, productConfigs),
        // cutting plan: empty until aggregation is wired
        materials: [],
        plans: [],
        powderCoating: [],
    };
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
        const cfg = productConfigs[product.sheetName];
        const qty = cfg?.qty ?? product.qty ?? 0;
        if (!(cfg?.enabled ?? true) || !qty) continue;

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
