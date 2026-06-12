import init, {
    compute_cutting_plan_numeric,
    compute_optimal_stock_cutting_plan_numeric,
} from '../shared/lib/pkg/steel_cutting_wasm.js';

init()
    .then(() => postMessage({ type: 'ready' }))
    .catch(err => postMessage({ type: 'initError', message: err?.message || String(err) }));

self.onmessage = ({ data }) => {
    const { type, runId, index } = data;

    if (type === 'computePlan') {
        let result = null;
        let error = null;
        try {
            result = compute_cutting_plan_numeric(data.input);
        } catch (err) {
            error = err?.message || String(err);
        }
        postMessage({ type: 'planResult', runId, index, result, error });

    } else if (type === 'computeOptimalPlan') {
        let optResult = null;
        let error = null;
        try {
            optResult = compute_optimal_stock_cutting_plan_numeric(data.optInput);
        } catch (err) {
            error = err?.message || String(err);
        }
        postMessage({ type: 'optimalPlanResult', runId, index, optResult, error });
    }
};
