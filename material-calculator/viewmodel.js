// viewmodel.js — aggregate parser.js output into render-ready data

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
        // summary stats: stubbed at 0 until calculation logic is wired
        totalWeight: 0,
        totalArea: 0,
        totalVolume: 0,
        // cutting plan: empty until aggregation is wired from parser.js components
        materials: [],
        plans: [],
        powderCoating: [],
    };
}
