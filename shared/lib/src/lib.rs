use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

const MAX_ITEMS: usize = 70;
const DEFAULT_MAX_PATTERN_WASTE: u32 = 600;
const MAX_RESIDUAL_PATTERN_CANDIDATES: usize = 45;
const MAX_RESIDUAL_FIRST_PATTERN_CANDIDATES: usize = 32;
const MAX_QTY_SEARCH: u32 = 5000;
const MAX_ENUM_PATTERNS: usize = 20000;

// ─── Input / Output types ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CuttingInput {
    pub lengths: Vec<u32>,
    pub quantities: Vec<u32>,
    pub stock_length: u32,
    pub bundle_size: u32,
    pub max_overcut_ratio: Option<f64>,
    pub max_pattern_waste: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputPattern {
    pub counts: Vec<u32>,
    pub qty: u32,
    pub used_length: u32,
    pub waste: u32,
    pub is_secondary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CuttingResult {
    /// Grouped item lengths, sorted descending.
    pub lengths: Vec<u32>,
    /// Grouped required quantities aligned to `lengths`.
    pub required: Vec<u32>,
    pub produced: Vec<u32>,
    pub patterns: Vec<OutputPattern>,
    pub stock_qty: u32,
    pub total_waste: u64,
    pub percentage_wasted: f64,
    pub valid: bool,
}

/// Result of the optimal-stock-length search.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimalStockResult {
    /// The stock length that minimises `stock_length × stock_qty`.
    pub stock_length: u32,
    /// Full cutting plan at that length.
    pub result: CuttingResult,
    /// How many candidate lengths were actually evaluated (diagnostics).
    pub candidates_evaluated: u32,
}

// ─── Internal types ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy)]
struct Item {
    length: u32,
    qty: u32,
}

#[derive(Debug, Clone, Copy)]
struct Pattern {
    counts: [u16; MAX_ITEMS],
    waste: u32,
}

#[derive(Debug, Clone, Copy)]
struct SelectedPattern {
    counts: [u16; MAX_ITEMS],
    waste: u32,
    qty: u32,
    is_secondary: bool,
}

#[derive(Debug, Clone, Copy)]
struct ScoredPattern {
    pattern: Pattern,
    waste: u32,
    used: u32,
    kind_count: u32,
}

// ─── WASM entry points ────────────────────────────────────────────────────────

// ─── Optimal stock-length search ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimalCuttingInput {
    pub lengths: Vec<u32>,
    pub quantities: Vec<u32>,
    pub bundle_size: u32,
    pub max_overcut_ratio: Option<f64>,
    pub max_pattern_waste: Option<u32>,

    /// Inclusive lower bound for the search. Defaults to the longest item length.
    pub min_stock_length: Option<u32>,

    /// Inclusive upper bound for the search.
    pub max_stock_length: u32,

    /// Coarse search step (mm). Defaults to 100.
    pub stock_step: Option<u32>,

    /// Explicit supplier stock lengths. When non-empty these are used as primary
    /// candidates instead of scanning the coarse grid.
    pub allowed_stock_lengths: Option<Vec<u32>>,

    /// Whether to zoom in around the top candidates after the coarse pass.
    /// Defaults to true.
    pub refine: Option<bool>,

    /// Number of best coarse candidates to refine around. Defaults to 12.
    pub refine_top_k: Option<usize>,

    /// Search radius around each promising length. Defaults to 2 × stock_step.
    pub refine_radius: Option<u32>,

    /// Fine step used during refinement. Defaults to 10, or 1 when stock_step ≤ 10.
    pub refine_step: Option<u32>,

    /// Maximum total candidates to evaluate. Defaults to 512.
    pub max_candidates: Option<usize>,

    /// Whether to add pattern-derived candidates (multiples and pairs of item
    /// lengths). Defaults to true.
    pub include_combination_candidates: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockCandidateResult {
    pub stock_length: u32,
    pub stock_qty: u32,
    pub total_stock_length: u64,
    pub total_waste: u64,
    pub percentage_wasted: f64,
    pub pattern_count: usize,
    pub secondary_stock_qty: u32,
    pub overproduced_length: u64,
    pub valid: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimalCuttingResult {
    pub best_stock_length: u32,
    pub best_score: Vec<u64>,
    pub best_result: CuttingResult,
    pub candidates: Vec<StockCandidateResult>,
}

// ─── WASM entry point ─────────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn compute_cutting_plan_numeric(input: JsValue) -> Result<JsValue, JsValue> {
    let input: CuttingInput = serde_wasm_bindgen::from_value(input)
        .map_err(|e| JsValue::from_str(&format!("Invalid input: {e}")))?;

    let result = compute_cutting_plan(input)
        .map_err(|e| JsValue::from_str(&e))?;

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize failed: {e}")))
}

/// Find the stock length in `[max(item_lengths), input.stock_length]` that
/// minimises `stock_length × stock_qty`, then return the full cutting plan.
#[wasm_bindgen]
pub fn find_optimal_stock_length_numeric(input: JsValue) -> Result<JsValue, JsValue> {
    let input: CuttingInput = serde_wasm_bindgen::from_value(input)
        .map_err(|e| JsValue::from_str(&format!("Invalid input: {e}")))?;

    let result = find_optimal_stock_length(input)
        .map_err(|e| JsValue::from_str(&e))?;

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize failed: {e}")))
}

// ─── Public API ───────────────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn compute_optimal_stock_cutting_plan_numeric(input: JsValue) -> Result<JsValue, JsValue> {
    let input: OptimalCuttingInput = serde_wasm_bindgen::from_value(input)
        .map_err(|e| JsValue::from_str(&format!("Invalid input: {e}")))?;

    let result = compute_optimal_stock_cutting_plan(input)
        .map_err(|e| JsValue::from_str(&e))?;

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize failed: {e}")))
}

pub fn compute_optimal_stock_cutting_plan(
    input: OptimalCuttingInput,
) -> Result<OptimalCuttingResult, String> {
    if input.lengths.len() != input.quantities.len() {
        return Err("lengths and quantities must have same length".to_string());
    }
    if input.lengths.is_empty() {
        return Err("no items".to_string());
    }
    if input.max_stock_length == 0 {
        return Err("max_stock_length must be > 0".to_string());
    }

    let max_item_length = input
        .lengths
        .iter()
        .zip(input.quantities.iter())
        .filter(|(_, &qty)| qty > 0)
        .map(|(&len, _)| len)
        .max()
        .ok_or_else(|| "no positive-quantity items".to_string())?;

    let min_stock = input
        .min_stock_length
        .unwrap_or(max_item_length)
        .max(max_item_length);
    let max_stock = input.max_stock_length;

    if min_stock > max_stock {
        return Err(
            "min_stock_length must be <= max_stock_length and >= longest item".to_string(),
        );
    }

    let stock_step = input.stock_step.unwrap_or(100).max(1);
    let max_candidates = input.max_candidates.unwrap_or(300).max(1);

    let mut candidates = generate_stock_candidates(
        &input,
        min_stock,
        max_stock,
        stock_step,
        max_candidates,
    );

    if candidates.is_empty() {
        return Err("no stock length candidates generated".to_string());
    }

    let total_req_len = total_required_length(&input.lengths, &input.quantities);
    let mut summaries: Vec<StockCandidateResult> = Vec::new();
    let mut valid_results: Vec<(Vec<u64>, u32, CuttingResult)> = Vec::new();
    let mut best_primary_cost: Option<u64> = None;

    // Sort by lower-bound L×⌈S/L⌉ so the most-promising candidates are evaluated
    // first, establishing a tight upper bound that prunes everything after the break.
    candidates.sort_unstable_by_key(|&l| {
        ceil_div(total_req_len, l as u64) as u64 * l as u64
    });

    for &stock in candidates.iter() {
        let lb_qty = ceil_div(total_req_len, stock as u64) as u64;
        let lb_cost = lb_qty.saturating_mul(stock as u64);
        if let Some(best_cost) = best_primary_cost {
            if lb_cost > best_cost {
                // Candidates are lb-sorted, so all remaining ones are also pruned.
                break;
            }
        }

        let trial = CuttingInput {
            lengths: input.lengths.clone(),
            quantities: input.quantities.clone(),
            stock_length: stock,
            bundle_size: input.bundle_size,
            max_overcut_ratio: input.max_overcut_ratio,
            max_pattern_waste: input.max_pattern_waste,
        };

        match compute_cutting_plan(trial) {
            Ok(result) => {
                let summary = summarize_candidate(stock, &result);
                if result.valid {
                    let score = score_cutting_result(stock, &result);
                    best_primary_cost = Some(match best_primary_cost {
                        None => score[0],
                        Some(current) => current.min(score[0]),
                    });
                    valid_results.push((score, stock, result));
                }
                summaries.push(summary);
            }
            Err(e) => {
                summaries.push(StockCandidateResult {
                    stock_length: stock,
                    stock_qty: 0,
                    total_stock_length: 0,
                    total_waste: 0,
                    percentage_wasted: 0.0,
                    pattern_count: 0,
                    secondary_stock_qty: 0,
                    overproduced_length: 0,
                    valid: false,
                    error: Some(e),
                });
            }
        }
    }

    if input.refine.unwrap_or(true) && !valid_results.is_empty() {
        let refine_top_k = input.refine_top_k.unwrap_or(10).max(1);
        let refine_radius = input
            .refine_radius
            .unwrap_or(stock_step.saturating_mul(2))
            .max(1);
        let refine_step = input
            .refine_step
            .unwrap_or(if stock_step <= 10 { 1 } else { 10 })
            .max(1);

        valid_results.sort_by(|a, b| a.0.cmp(&b.0));

        // O(1) membership check — avoids the O(n²) summaries.iter().any() scan.
        let evaluated: std::collections::HashSet<u32> =
            summaries.iter().map(|s| s.stock_length).collect();

        let mut new_candidates: Vec<u32> = Vec::new();
        for (_, stock, _) in valid_results.iter().take(refine_top_k) {
            let start = stock.saturating_sub(refine_radius).max(min_stock);
            let end = stock.saturating_add(refine_radius).min(max_stock);
            let mut s = start;
            while s <= end {
                if !evaluated.contains(&s) {
                    new_candidates.push(s);
                }
                match s.checked_add(refine_step) {
                    Some(next) if next > s => s = next,
                    _ => break,
                }
            }
        }

        new_candidates.sort_unstable();
        new_candidates.dedup();

        // Sort new candidates by lb and prune before solving.
        new_candidates.sort_unstable_by_key(|&l| {
            ceil_div(total_req_len, l as u64) as u64 * l as u64
        });

        for &stock in new_candidates.iter() {
            let lb_qty = ceil_div(total_req_len, stock as u64) as u64;
            let lb_cost = lb_qty.saturating_mul(stock as u64);
            if let Some(best_cost) = best_primary_cost {
                if lb_cost > best_cost {
                    break;
                }
            }

            let trial = CuttingInput {
                lengths: input.lengths.clone(),
                quantities: input.quantities.clone(),
                stock_length: stock,
                bundle_size: input.bundle_size,
                max_overcut_ratio: input.max_overcut_ratio,
                max_pattern_waste: input.max_pattern_waste,
            };

            match compute_cutting_plan(trial) {
                Ok(result) => {
                    let summary = summarize_candidate(stock, &result);
                    if result.valid {
                        let score = score_cutting_result(stock, &result);
                        best_primary_cost = Some(match best_primary_cost {
                            None => score[0],
                            Some(current) => current.min(score[0]),
                        });
                        valid_results.push((score, stock, result));
                    }
                    summaries.push(summary);
                }
                Err(e) => {
                    summaries.push(StockCandidateResult {
                        stock_length: stock,
                        stock_qty: 0,
                        total_stock_length: 0,
                        total_waste: 0,
                        percentage_wasted: 0.0,
                        pattern_count: 0,
                        secondary_stock_qty: 0,
                        overproduced_length: 0,
                        valid: false,
                        error: Some(e),
                    });
                }
            }
        }
    }

    valid_results.sort_by(|a, b| a.0.cmp(&b.0));
    summaries.sort_by_key(|s| {
        (
            !s.valid,
            if s.total_stock_length == 0 {
                u64::MAX
            } else {
                s.total_stock_length
            },
            s.total_waste,
            s.pattern_count as u64,
            s.stock_length as u64,
        )
    });

    let Some((best_score, best_stock_length, best_result)) =
        valid_results.into_iter().next()
    else {
        return Err(
            "no valid cutting result found for any stock length candidate".to_string(),
        );
    };

    Ok(OptimalCuttingResult {
        best_stock_length,
        best_score,
        best_result,
        candidates: summaries,
    })
}

fn generate_stock_candidates(
    input: &OptimalCuttingInput,
    min_stock: u32,
    max_stock: u32,
    stock_step: u32,
    max_candidates: usize,
) -> Vec<u32> {
    let mut set = std::collections::BTreeSet::new();

    if let Some(allowed) = &input.allowed_stock_lengths {
        for &s in allowed {
            if s >= min_stock && s <= max_stock {
                set.insert(s);
            }
        }
    }

    if set.is_empty() {
        let mut s = ceil_to_step(min_stock, stock_step);
        while s <= max_stock && set.len() < max_candidates {
            set.insert(s);
            match s.checked_add(stock_step) {
                Some(next) if next > s => s = next,
                _ => break,
            }
        }
        set.insert(min_stock);
        set.insert(max_stock);
    }

    if input.include_combination_candidates.unwrap_or(true) {
        add_combination_stock_candidates(
            &mut set,
            &input.lengths,
            &input.quantities,
            min_stock,
            max_stock,
            stock_step,
            max_candidates.saturating_mul(2),
        );
    }

    let mut out: Vec<u32> = set.into_iter().collect();

    if out.len() > max_candidates {
        let stride = (out.len() as f64 / max_candidates as f64).ceil() as usize;
        let mut sampled = Vec::with_capacity(max_candidates);
        let mut i = 0usize;
        while i < out.len() && sampled.len() + 1 < max_candidates {
            sampled.push(out[i]);
            i += stride.max(1);
        }
        if let Some(&last) = out.last() {
            if sampled.last().copied() != Some(last) {
                sampled.push(last);
            }
        }
        out = sampled;
    }

    out.sort_unstable();
    out.dedup();
    out
}

fn add_combination_stock_candidates(
    set: &mut std::collections::BTreeSet<u32>,
    lengths: &[u32],
    quantities: &[u32],
    min_stock: u32,
    max_stock: u32,
    stock_step: u32,
    limit: usize,
) {
    let mut useful: Vec<u32> = lengths
        .iter()
        .zip(quantities.iter())
        .filter_map(|(&len, &qty)| if qty > 0 && len > 0 { Some(len) } else { None })
        .collect();

    useful.sort_unstable_by(|a, b| b.cmp(a));
    useful.dedup();
    useful.truncate(18);

    for &len in &useful {
        let mut used = len;
        while used <= max_stock && set.len() < limit {
            if used >= min_stock {
                set.insert(ceil_to_step(used, stock_step).min(max_stock));
                if stock_step > 1 {
                    set.insert(used);
                }
            }
            match used.checked_add(len) {
                Some(next) if next > used => used = next,
                _ => break,
            }
        }
    }

    'outer: for i in 0..useful.len() {
        for j in i..useful.len() {
            let base = useful[i].saturating_add(useful[j]);
            if base > max_stock {
                continue;
            }
            if base >= min_stock {
                set.insert(ceil_to_step(base, stock_step).min(max_stock));
                if stock_step > 1 {
                    set.insert(base);
                }
            }
            for k in j..useful.len().min(j + 8) {
                if set.len() >= limit {
                    break 'outer;
                }
                let triple = base.saturating_add(useful[k]);
                if triple > max_stock {
                    continue;
                }
                if triple >= min_stock {
                    set.insert(ceil_to_step(triple, stock_step).min(max_stock));
                    if stock_step > 1 {
                        set.insert(triple);
                    }
                }
            }
        }
    }
}

fn ceil_to_step(value: u32, step: u32) -> u32 {
    if step <= 1 {
        value
    } else {
        ((value + step - 1) / step) * step
    }
}

fn total_required_length(lengths: &[u32], quantities: &[u32]) -> u64 {
    lengths
        .iter()
        .zip(quantities.iter())
        .map(|(&len, &qty)| len as u64 * qty as u64)
        .sum()
}

fn summarize_candidate(stock: u32, result: &CuttingResult) -> StockCandidateResult {
    StockCandidateResult {
        stock_length: stock,
        stock_qty: result.stock_qty,
        total_stock_length: stock as u64 * result.stock_qty as u64,
        total_waste: result.total_waste,
        percentage_wasted: result.percentage_wasted,
        pattern_count: result.patterns.len(),
        secondary_stock_qty: result
            .patterns
            .iter()
            .filter(|p| p.is_secondary)
            .map(|p| p.qty)
            .sum(),
        overproduced_length: {
            let mut total = 0u64;
            for i in 0..result.lengths.len() {
                if result.produced[i] > result.required[i] {
                    total += (result.produced[i] - result.required[i]) as u64
                        * result.lengths[i] as u64;
                }
            }
            total
        },
        valid: result.valid,
        error: None,
    }
}

fn score_cutting_result(stock: u32, result: &CuttingResult) -> Vec<u64> {
    let secondary_qty: u32 = result
        .patterns
        .iter()
        .filter(|p| p.is_secondary)
        .map(|p| p.qty)
        .sum();
    let overproduced: u64 = {
        let mut total = 0u64;
        for i in 0..result.lengths.len() {
            if result.produced[i] > result.required[i] {
                total +=
                    (result.produced[i] - result.required[i]) as u64 * result.lengths[i] as u64;
            }
        }
        total
    };
    vec![
        stock as u64 * result.stock_qty as u64,
        result.total_waste,
        secondary_qty as u64,
        overproduced,
        result.patterns.len() as u64,
        result.stock_qty as u64, // prefer fewer bars when total material is tied
    ]
}

// ─── Fixed-stock cutting plan ─────────────────────────────────────────────────

pub fn compute_cutting_plan(input: CuttingInput) -> Result<CuttingResult, String> {
    let bundle_size = input.bundle_size.max(1);
    let stock = input.stock_length;
    let max_overcut_ratio = input.max_overcut_ratio.unwrap_or(0.01).max(0.0);
    let max_pattern_waste = input.max_pattern_waste.unwrap_or(DEFAULT_MAX_PATTERN_WASTE);

    if stock == 0 {
        return Err("stock_length must be > 0".to_string());
    }

    if input.lengths.len() != input.quantities.len() {
        return Err("lengths and quantities must have same length".to_string());
    }

    if input.lengths.is_empty() {
        return Err("no items".to_string());
    }

    let items = group_and_sort_items(&input.lengths, &input.quantities, stock)?;

    let n = items.len();
    if n == 0 {
        return Ok(empty_result());
    }

    let mut lengths = [0u32; MAX_ITEMS];
    let mut required = [0u32; MAX_ITEMS];

    for (i, item) in items.iter().enumerate() {
        lengths[i] = item.length;
        required[i] = item.qty;
    }

    let mut patterns = Vec::with_capacity(2048);
    enumerate_patterns(&lengths, n, stock, max_pattern_waste, &mut patterns);

    if patterns.is_empty() {
        return Err("no feasible patterns generated".to_string());
    }

    sort_patterns(&mut patterns, &lengths, n);
    if patterns.len() > MAX_ENUM_PATTERNS {
        patterns.truncate(MAX_ENUM_PATTERNS);
    }

    let selected = if bundle_size <= 1 {
        solve_bundle_one(&lengths, &required, n, stock, max_overcut_ratio, &patterns)
    } else {
        solve_with_bundle(
            &lengths,
            &required,
            n,
            stock,
            bundle_size,
            max_overcut_ratio,
            &patterns,
        )
    };

    let mut final_selected = selected;
    let produced = produced_by(&final_selected, n);
    let mut shortage = [0u32; MAX_ITEMS];

    let mut has_shortage = false;
    for i in 0..n {
        if produced[i] < required[i] {
            shortage[i] = required[i] - produced[i];
            has_shortage = true;
        }
    }

    if has_shortage {
        repair_shortage(&mut final_selected, &lengths, &shortage, n, stock, true);
    }

    Ok(build_result(final_selected, &lengths, &required, n, stock))
}

/// Search for the stock length L in `[max(item_lengths), input.stock_length]`
/// that minimises `L × stock_qty(L)`.
///
/// # Candidate generation
///
/// Two complementary sets cover all practically optimal lengths:
///
/// 1. **Arithmetic candidates** — for each bar-count k, the minimum L that
///    could pack all material into k bars is `ceil(S / k)` (where S is total
///    useful length). The set `{ ceil(S/k) : k = 1..total_pieces }` has only
///    O(√S) distinct values (same argument as `floor(n/k)` divisors).
///
/// 2. **Zero-waste candidates** — lengths reachable as a sum of item lengths
///    (via DP), i.e. lengths where at least one pattern has zero waste.
///    These are the best candidates for minimising total material.
///
/// Every candidate is lower-bound-pruned: `L × ceil(S/L) ≥ best_cost` ⟹ skip.
pub fn find_optimal_stock_length(input: CuttingInput) -> Result<OptimalStockResult, String> {
    if input.stock_length == 0 {
        return Err("stock_length must be > 0".to_string());
    }
    if input.lengths.len() != input.quantities.len() {
        return Err("lengths and quantities must have same length".to_string());
    }
    if input.lengths.is_empty() {
        return Err("no items".to_string());
    }

    let max_l = input.stock_length;

    // Validate and find min_L (must fit the largest item).
    let min_l = input.lengths.iter().copied().max().unwrap_or(0);
    if min_l == 0 {
        return Err("all item lengths are zero".to_string());
    }
    if min_l > max_l {
        return Err(format!(
            "largest item length {min_l} exceeds stock_length {max_l}"
        ));
    }

    // Total useful material (fixed regardless of L).
    let total_useful: u64 = input
        .lengths
        .iter()
        .zip(input.quantities.iter())
        .map(|(&l, &q)| l as u64 * q as u64)
        .sum();

    if total_useful == 0 {
        return Err("no items".to_string());
    }

    let total_pieces: u32 = input.quantities.iter().sum();

    // ── Candidate set 1: arithmetic ─────────────────────────────────────────
    // For bar count k, minimum L is ceil(S / k). O(√S) distinct values.
    let mut candidates: Vec<u32> = Vec::new();
    for k in 1..=total_pieces {
        let l_k = (((total_useful + k as u64 - 1) / k as u64) as u32).max(min_l);
        if l_k <= max_l {
            candidates.push(l_k);
        }
    }

    // ── Candidate set 2: zero-waste lengths via DP ───────────────────────────
    // Reachable sums of item lengths up to max_l. At these lengths at least
    // one pattern can have zero waste.
    let zero_waste = reachable_sums(&input.lengths, max_l);
    for l in zero_waste {
        if l >= min_l {
            candidates.push(l);
        }
    }

    // Always include the caller's own stock_length as a baseline.
    candidates.push(max_l);

    // Deduplicate and sort by lower bound L × ceil(S/L) ascending so the
    // best-potential candidates are evaluated first (faster pruning).
    candidates.sort_unstable();
    candidates.dedup();
    candidates.sort_unstable_by_key(|&l| {
        let k = ceil_div(total_useful, l as u64) as u64;
        l as u64 * k
    });

    // ── Evaluate with pruning ────────────────────────────────────────────────
    let mut best_cost = u64::MAX;
    let mut best: Option<(u32, CuttingResult)> = None;
    let mut evaluated: u32 = 0;

    for l in candidates {
        // Lower bound: even perfect packing can't beat L × ceil(S/L).
        let lower_bound = {
            let k = ceil_div(total_useful, l as u64) as u64;
            l as u64 * k
        };
        if lower_bound >= best_cost {
            continue;
        }

        let candidate_input = CuttingInput {
            stock_length: l,
            ..input.clone()
        };

        let Ok(result) = compute_cutting_plan(candidate_input) else {
            continue;
        };

        if !result.valid {
            continue;
        }

        evaluated += 1;
        let cost = l as u64 * result.stock_qty as u64;
        if cost < best_cost {
            best_cost = cost;
            best = Some((l, result));
        }
    }

    match best {
        Some((stock_length, result)) => Ok(OptimalStockResult {
            stock_length,
            result,
            candidates_evaluated: evaluated,
        }),
        None => Err("no valid cutting plan found for any candidate stock length".to_string()),
    }
}

// ─── Candidate helpers ────────────────────────────────────────────────────────

/// DP: collect all lengths reachable as sums of item lengths up to `max_val`.
/// These are the stock lengths where at least one zero-waste pattern exists.
fn reachable_sums(item_lengths: &[u32], max_val: u32) -> Vec<u32> {
    let sz = (max_val + 1) as usize;
    let mut dp = vec![false; sz];
    dp[0] = true;

    for s in 0..sz {
        if !dp[s] {
            continue;
        }
        for &l in item_lengths {
            let next = s + l as usize;
            if next < sz {
                dp[next] = true;
            }
        }
    }

    dp.iter()
        .enumerate()
        .filter(|&(i, &r)| r && i > 0)
        .map(|(i, _)| i as u32)
        .collect()
}

// ─── Core helpers (unchanged from original) ───────────────────────────────────

fn empty_result() -> CuttingResult {
    CuttingResult {
        lengths: vec![],
        required: vec![],
        produced: vec![],
        patterns: vec![],
        stock_qty: 0,
        total_waste: 0,
        percentage_wasted: 0.0,
        valid: true,
    }
}

fn group_and_sort_items(
    input_lengths: &[u32],
    input_qty: &[u32],
    stock: u32,
) -> Result<Vec<Item>, String> {
    let mut grouped: Vec<Item> = Vec::new();

    for (&length, &qty) in input_lengths.iter().zip(input_qty.iter()) {
        if qty == 0 {
            continue;
        }

        if length == 0 || length > stock {
            return Err(format!("invalid item length {length}"));
        }

        let mut found = false;
        for g in grouped.iter_mut() {
            if g.length == length {
                g.qty = g.qty.saturating_add(qty);
                found = true;
                break;
            }
        }

        if !found {
            grouped.push(Item { length, qty });
        }
    }

    if grouped.len() > MAX_ITEMS {
        return Err(format!("too many item types; max is {MAX_ITEMS}"));
    }

    grouped.sort_by_key(|x| std::cmp::Reverse(x.length));
    Ok(grouped)
}

fn used_length(pattern: &Pattern, lengths: &[u32; MAX_ITEMS], n: usize) -> u32 {
    let mut used = 0u32;
    for i in 0..n {
        used = used.saturating_add(pattern.counts[i] as u32 * lengths[i]);
    }
    used
}

fn kind_count(pattern: &Pattern, n: usize) -> u32 {
    let mut count = 0;
    for i in 0..n {
        if pattern.counts[i] > 0 {
            count += 1;
        }
    }
    count
}

fn ceil_div(a: u64, b: u64) -> u32 {
    if a == 0 {
        0
    } else {
        ((a + b - 1) / b) as u32
    }
}

fn round_up_bundle(q: u32, bundle_size: u32) -> u32 {
    if q == 0 {
        0
    } else {
        ((q + bundle_size - 1) / bundle_size) * bundle_size
    }
}

fn enumerate_patterns(
    lengths: &[u32; MAX_ITEMS],
    n: usize,
    stock: u32,
    max_waste: u32,
    out: &mut Vec<Pattern>,
) {
    let mut counts = [0u16; MAX_ITEMS];
    dfs_patterns(0, 0, lengths, n, stock, max_waste, &mut counts, out);
}

fn dfs_patterns(
    index: usize,
    used: u32,
    lengths: &[u32; MAX_ITEMS],
    n: usize,
    stock: u32,
    max_waste: u32,
    counts: &mut [u16; MAX_ITEMS],
    out: &mut Vec<Pattern>,
) {
    if out.len() >= MAX_ENUM_PATTERNS * 2 {
        return;
    }

    if index == n {
        if used > 0 {
            let waste = stock - used;
            if waste <= max_waste {
                out.push(Pattern {
                    counts: *counts,
                    waste,
                });
            }
        }
        return;
    }

    let len = lengths[index];
    let max_count = (stock - used) / len;

    for c in 0..=max_count {
        counts[index] = c as u16;
        let next_used = used + c * len;
        dfs_patterns(
            index + 1,
            next_used,
            lengths,
            n,
            stock,
            max_waste,
            counts,
            out,
        );
    }

    counts[index] = 0;
}

fn sort_patterns(patterns: &mut Vec<Pattern>, lengths: &[u32; MAX_ITEMS], n: usize) {
    let mut scored: Vec<ScoredPattern> = Vec::with_capacity(patterns.len());

    for &p in patterns.iter() {
        scored.push(ScoredPattern {
            pattern: p,
            waste: p.waste,
            used: used_length(&p, lengths, n),
            kind_count: kind_count(&p, n),
        });
    }

    scored.sort_by_key(|s| {
        (
            s.waste,
            std::cmp::Reverse(s.used),
            std::cmp::Reverse(s.kind_count),
        )
    });

    patterns.clear();
    for s in scored {
        patterns.push(s.pattern);
    }
}

fn add_or_merge(
    selected: &mut Vec<SelectedPattern>,
    pattern: Pattern,
    qty: u32,
    is_secondary: bool,
) {
    if qty == 0 {
        return;
    }

    for s in selected.iter_mut() {
        if s.counts == pattern.counts
            && s.waste == pattern.waste
            && s.is_secondary == is_secondary
        {
            s.qty = s.qty.saturating_add(qty);
            return;
        }
    }

    selected.push(SelectedPattern {
        counts: pattern.counts,
        waste: pattern.waste,
        qty,
        is_secondary,
    });
}

fn produced_by(selected: &[SelectedPattern], n: usize) -> [u32; MAX_ITEMS] {
    let mut produced = [0u32; MAX_ITEMS];

    for s in selected {
        for i in 0..n {
            produced[i] = produced[i].saturating_add(s.counts[i] as u32 * s.qty);
        }
    }

    produced
}

fn select_anchor_pattern(
    lengths: &[u32; MAX_ITEMS],
    remaining: &[i64; MAX_ITEMS],
    n: usize,
    stock: u32,
    bundle_size: u32,
    max_overcut_ratio: f64,
    patterns: &[Pattern],
) -> Option<(Pattern, u32, [i64; MAX_ITEMS])> {
    let mut anchor: Option<usize> = None;

    for i in 0..n {
        if remaining[i] > 0 {
            match anchor {
                None => anchor = Some(i),
                Some(j) => {
                    if lengths[i] > lengths[j] {
                        anchor = Some(i);
                    }
                }
            }
        }
    }

    let anchor = anchor?;

    let mut allowed_overcut = [0i64; MAX_ITEMS];
    for i in 0..n {
        let r = remaining[i].max(0) as f64;
        allowed_overcut[i] = ((r * max_overcut_ratio).ceil() as i64).max(1);
    }

    let mut best: Option<((u64, u64, u64, u32, u32), Pattern, u32, [i64; MAX_ITEMS])> = None;

    for &p in patterns {
        let ca = p.counts[anchor] as u32;
        if ca == 0 {
            continue;
        }

        let rem_anchor = remaining[anchor].max(0) as u32;
        let q_floor = rem_anchor / ca;
        let q_ceil = ceil_div(rem_anchor as u64, ca as u64);

        let q_values = [
            round_up_bundle(q_floor, bundle_size),
            round_up_bundle(q_ceil, bundle_size),
        ];

        for &q in &q_values {
            if q == 0 {
                continue;
            }

            let mut new_rem = *remaining;

            for i in 0..n {
                new_rem[i] -= p.counts[i] as i64 * q as i64;
            }

            if new_rem[anchor] > 0 {
                continue;
            }

            let mut bad_overcut = false;
            for i in 0..n {
                if -new_rem[i] > allowed_overcut[i] {
                    bad_overcut = true;
                    break;
                }
            }

            if bad_overcut {
                continue;
            }

            let mut rem_len = 0u64;
            let mut over_len = 0u64;

            for i in 0..n {
                if new_rem[i] > 0 {
                    rem_len += new_rem[i] as u64 * lengths[i] as u64;
                } else {
                    over_len += (-new_rem[i]) as u64 * lengths[i] as u64;
                }
            }

            let future_lb = ceil_div(rem_len, stock as u64) as u64;
            let waste = p.waste as u64 * q as u64;

            let score = (
                q as u64 + future_lb,
                waste,
                over_len,
                p.waste,
                std::u32::MAX - ca,
            );

            match best {
                None => best = Some((score, p, q, new_rem)),
                Some((best_score, _, _, _)) => {
                    if score < best_score {
                        best = Some((score, p, q, new_rem));
                    }
                }
            }
        }
    }

    best.map(|(_, p, q, r)| (p, q, r))
}

fn solve_bundle_one(
    lengths: &[u32; MAX_ITEMS],
    required: &[u32; MAX_ITEMS],
    n: usize,
    stock: u32,
    max_overcut_ratio: f64,
    all_patterns: &[Pattern],
) -> Vec<SelectedPattern> {
    let mut selected = Vec::new();
    let mut remaining = [0i64; MAX_ITEMS];

    for i in 0..n {
        remaining[i] = required[i] as i64;
    }

    let mut first_anchor = true;

    loop {
        let mut positive_count = 0usize;
        let mut largest_positive = 0u32;

        for i in 0..n {
            if remaining[i] > 0 {
                positive_count += 1;
                largest_positive = largest_positive.max(lengths[i]);
            }
        }

        if positive_count == 0 {
            break;
        }

        if positive_count <= 3 && !first_anchor {
            break;
        }

        if positive_count <= 3 && largest_positive < 1000 {
            break;
        }

        let Some((p, q, new_remaining)) = select_anchor_pattern(
            lengths,
            &remaining,
            n,
            stock,
            1,
            max_overcut_ratio,
            all_patterns,
        ) else {
            break;
        };

        add_or_merge(&mut selected, p, q, false);
        remaining = new_remaining;
        first_anchor = false;
    }

    let residual = solve_residual_master(
        lengths,
        &remaining,
        n,
        stock,
        1,
        max_overcut_ratio,
        all_patterns,
    );

    for s in residual {
        add_or_merge(
            &mut selected,
            Pattern {
                counts: s.counts,
                waste: s.waste,
            },
            s.qty,
            false,
        );
    }

    let produced = produced_by(&selected, n);
    let mut shortage = [0u32; MAX_ITEMS];
    let mut has_shortage = false;

    for i in 0..n {
        if produced[i] < required[i] {
            shortage[i] = required[i] - produced[i];
            has_shortage = true;
        }
    }

    if has_shortage {
        repair_shortage(&mut selected, lengths, &shortage, n, stock, true);
    }

    selected
}

fn solve_with_bundle(
    lengths: &[u32; MAX_ITEMS],
    required: &[u32; MAX_ITEMS],
    n: usize,
    stock: u32,
    bundle_size: u32,
    max_overcut_ratio: f64,
    all_patterns: &[Pattern],
) -> Vec<SelectedPattern> {
    let ideal = solve_bundle_one(
        lengths,
        required,
        n,
        stock,
        max_overcut_ratio,
        all_patterns,
    );

    let mut selected = Vec::new();

    for s in &ideal {
        if s.is_secondary {
            continue;
        }

        let q = (s.qty / bundle_size) * bundle_size;
        if q > 0 {
            add_or_merge(
                &mut selected,
                Pattern {
                    counts: s.counts,
                    waste: s.waste,
                },
                q,
                false,
            );
        }
    }

    let produced = produced_by(&selected, n);
    let mut shortage_i64 = [0i64; MAX_ITEMS];

    for i in 0..n {
        if required[i] > produced[i] {
            shortage_i64[i] = (required[i] - produced[i]) as i64;
        }
    }

    let residual = solve_residual_master(
        lengths,
        &shortage_i64,
        n,
        stock,
        1,
        max_overcut_ratio,
        all_patterns,
    );

    for s in residual {
        add_or_merge(
            &mut selected,
            Pattern {
                counts: s.counts,
                waste: s.waste,
            },
            s.qty,
            true,
        );
    }

    let produced = produced_by(&selected, n);
    let mut shortage = [0u32; MAX_ITEMS];
    let mut has_shortage = false;

    for i in 0..n {
        if required[i] > produced[i] {
            shortage[i] = required[i] - produced[i];
            has_shortage = true;
        }
    }

    if has_shortage {
        repair_shortage(&mut selected, lengths, &shortage, n, stock, true);
    }

    selected
}

fn evaluate_selection(
    selection: &[(Pattern, u32); 3],
    lengths: &[u32; MAX_ITEMS],
    remaining: &[i64; MAX_ITEMS],
    allowed_overcut: &[i64; MAX_ITEMS],
    n: usize,
) -> Option<((u32, u32, u64, u64, u64), [(Pattern, u32); 3])> {
    let mut produced = [0i64; MAX_ITEMS];
    let mut bars = 0u32;
    let mut waste = 0u64;
    let mut pattern_count = 0u32;

    for &(p, q) in selection.iter() {
        if q == 0 {
            continue;
        }

        pattern_count += 1;
        bars += q;
        waste += p.waste as u64 * q as u64;

        for i in 0..n {
            produced[i] += p.counts[i] as i64 * q as i64;
        }
    }

    if pattern_count == 0 {
        return None;
    }

    for i in 0..n {
        if produced[i] < remaining[i] {
            return None;
        }
    }

    let mut overcut_len = 0u64;
    let mut excess_overcut_len = 0u64;
    let mut max_single_overcut_len = 0u64;

    for i in 0..n {
        let over_qty = produced[i] - remaining[i];
        if over_qty > 0 {
            let over_len = over_qty as u64 * lengths[i] as u64;
            overcut_len += over_len;
            max_single_overcut_len = max_single_overcut_len.max(over_len);

            let excess_qty = (over_qty - allowed_overcut[i]).max(0) as u64;
            excess_overcut_len += excess_qty * lengths[i] as u64;
        }
    }

    let score = (
        bars,
        pattern_count,
        waste + max_single_overcut_len,
        waste,
        overcut_len + 1000 * excess_overcut_len,
    );

    Some((score, *selection))
}

fn solve_residual_master(
    lengths: &[u32; MAX_ITEMS],
    remaining: &[i64; MAX_ITEMS],
    n: usize,
    stock: u32,
    bundle_size: u32,
    max_overcut_ratio: f64,
    all_patterns: &[Pattern],
) -> Vec<SelectedPattern> {
    let mut positives = [false; MAX_ITEMS];
    let mut positive_count = 0usize;

    for i in 0..n {
        if remaining[i] > 0 {
            positives[i] = true;
            positive_count += 1;
        }
    }

    if positive_count == 0 {
        return vec![];
    }

    let mut allowed_overcut = [0i64; MAX_ITEMS];

    for i in 0..n {
        allowed_overcut[i] =
            (((remaining[i].max(0) as f64) * max_overcut_ratio).ceil() as i64).max(1);
    }

    let mut patterns: Vec<Pattern> = Vec::with_capacity(MAX_RESIDUAL_PATTERN_CANDIDATES);

    for &p in all_patterns {
        let mut uses_completed = false;
        let mut uses_positive = false;

        for i in 0..n {
            if p.counts[i] > 0 {
                if remaining[i] <= 0 {
                    uses_completed = true;
                    break;
                }

                if positives[i] {
                    uses_positive = true;
                }
            }
        }

        if !uses_completed && uses_positive {
            patterns.push(p);
            if patterns.len() >= MAX_RESIDUAL_PATTERN_CANDIDATES {
                break;
            }
        }
    }

    if patterns.is_empty() {
        return vec![];
    }

    let zero = Pattern {
        counts: [0u16; MAX_ITEMS],
        waste: 0,
    };

    let first_limit = patterns.len().min(MAX_RESIDUAL_FIRST_PATTERN_CANDIDATES);

    let mut cleanup_options: Vec<(Option<usize>, Pattern)> = Vec::new();
    cleanup_options.push((None, zero));

    for cleanup_index in 0..n {
        if !positives[cleanup_index] {
            continue;
        }

        let mut best: Option<(u32, Pattern)> = None;

        for &p in &patterns {
            if p.counts[cleanup_index] == 0 {
                continue;
            }

            let mut single_only = true;
            for j in 0..n {
                if j != cleanup_index && p.counts[j] > 0 {
                    single_only = false;
                    break;
                }
            }

            if !single_only {
                continue;
            }

            let used = used_length(&p, lengths, n);
            match best {
                None => best = Some((used, p)),
                Some((best_used, _)) => {
                    if used > best_used {
                        best = Some((used, p));
                    }
                }
            }
        }

        if let Some((_, p)) = best {
            cleanup_options.push((Some(cleanup_index), p));
        }
    }

    let mut best: Option<((u32, u32, u64, u64, u64), [(Pattern, u32); 3])> = None;

    for &(cleanup_index, cleanup_pattern) in cleanup_options.iter() {
        for first_pos in 0..=first_limit {
            let first = if first_pos == 0 {
                zero
            } else {
                patterns[first_pos - 1]
            };

            let mut max_first = 0u32;

            if first_pos != 0 {
                for i in 0..n {
                    let c = first.counts[i] as u32;
                    if c > 0 && remaining[i] > 0 {
                        let allowed = allowed_overcut[i].max(0) as u32;
                        max_first = max_first.max(ceil_div(
                            (remaining[i] as u32 + allowed) as u64,
                            c as u64,
                        ));
                    }
                }

                max_first = max_first.min(MAX_QTY_SEARCH);
            }

            let mut q_first = 0u32;
            while q_first <= max_first {
                let mut rem_after_first = *remaining;

                if q_first > 0 {
                    for i in 0..n {
                        rem_after_first[i] -= first.counts[i] as i64 * q_first as i64;
                    }
                }

                let mut bad = false;
                for i in 0..n {
                    if -rem_after_first[i] > allowed_overcut[i] * 3 + 50 {
                        bad = true;
                        break;
                    }
                }

                if bad {
                    q_first += bundle_size;
                    continue;
                }

                for &second in patterns.iter() {
                    let mut q_second = 0u32;
                    let mut ok = true;

                    for i in 0..n {
                        if Some(i) == cleanup_index {
                            continue;
                        }

                        if positives[i] {
                            let need = rem_after_first[i];

                            if need > 0 {
                                let c = second.counts[i] as u32;
                                if c == 0 {
                                    ok = false;
                                    break;
                                }

                                q_second = q_second.max(ceil_div(need as u64, c as u64));
                            }
                        }
                    }

                    if !ok {
                        continue;
                    }

                    q_second = round_up_bundle(q_second, bundle_size);

                    let mut rem_after_second = rem_after_first;

                    if q_second > 0 {
                        for i in 0..n {
                            rem_after_second[i] -= second.counts[i] as i64 * q_second as i64;
                        }
                    }

                    let mut bad_non_cleanup = false;

                    for i in 0..n {
                        if Some(i) == cleanup_index {
                            continue;
                        }

                        if -rem_after_second[i] > allowed_overcut[i] * 3 + 50 {
                            bad_non_cleanup = true;
                            break;
                        }
                    }

                    if bad_non_cleanup {
                        continue;
                    }

                    let mut q_cleanup = 0u32;

                    if let Some(ci) = cleanup_index {
                        if rem_after_second[ci] > 0 {
                            let c = cleanup_pattern.counts[ci] as u32;
                            if c == 0 {
                                continue;
                            }

                            q_cleanup = round_up_bundle(
                                ceil_div(rem_after_second[ci] as u64, c as u64),
                                bundle_size,
                            );
                        }
                    }

                    let selection = [
                        (first, q_first),
                        (second, q_second),
                        (cleanup_pattern, q_cleanup),
                    ];

                    if let Some(candidate) = evaluate_selection(
                        &selection,
                        lengths,
                        remaining,
                        &allowed_overcut,
                        n,
                    ) {
                        match best {
                            None => best = Some(candidate),
                            Some((best_score, _)) => {
                                if candidate.0 < best_score {
                                    best = Some(candidate);
                                }
                            }
                        }
                    }
                }

                q_first += bundle_size;
            }
        }
    }

    let Some((_, chosen)) = best else {
        return vec![];
    };

    let mut result = Vec::new();

    for &(p, q) in chosen.iter() {
        if q > 0 {
            add_or_merge(&mut result, p, q, false);
        }
    }

    result
}

fn repair_shortage(
    selected: &mut Vec<SelectedPattern>,
    lengths: &[u32; MAX_ITEMS],
    shortage: &[u32; MAX_ITEMS],
    n: usize,
    stock: u32,
    is_secondary: bool,
) {
    let mut bars: Vec<Pattern> = Vec::new();
    let mut used: Vec<u32> = Vec::new();

    for i in 0..n {
        let mut qty = shortage[i];

        while qty > 0 {
            let len = lengths[i];
            let mut best_bar: Option<usize> = None;
            let mut best_remaining = u32::MAX;

            for (bar_index, &u) in used.iter().enumerate() {
                if u + len <= stock {
                    let rem = stock - (u + len);
                    if rem < best_remaining {
                        best_remaining = rem;
                        best_bar = Some(bar_index);
                    }
                }
            }

            match best_bar {
                Some(bar_index) => {
                    bars[bar_index].counts[i] += 1;
                    used[bar_index] += len;
                }
                None => {
                    let mut counts = [0u16; MAX_ITEMS];
                    counts[i] = 1;
                    bars.push(Pattern {
                        counts,
                        waste: stock - len,
                    });
                    used.push(len);
                }
            }

            qty -= 1;
        }
    }

    for (mut p, u) in bars.into_iter().zip(used.into_iter()) {
        p.waste = stock - u;
        add_or_merge(selected, p, 1, is_secondary);
    }
}

fn build_result(
    mut selected: Vec<SelectedPattern>,
    lengths: &[u32; MAX_ITEMS],
    required: &[u32; MAX_ITEMS],
    n: usize,
    stock: u32,
) -> CuttingResult {
    selected.sort_by_key(|p| {
        (
            p.is_secondary,
            std::cmp::Reverse(p.qty),
            p.waste,
            std::cmp::Reverse(selected_used_length(p, lengths, n)),
        )
    });

    let produced = produced_by(&selected, n);

    let mut output_patterns = Vec::new();
    let mut stock_qty = 0u32;
    let mut total_waste = 0u64;

    for p in selected {
        let mut counts = Vec::with_capacity(n);
        for i in 0..n {
            counts.push(p.counts[i] as u32);
        }

        let used = selected_used_length(&p, lengths, n);

        stock_qty = stock_qty.saturating_add(p.qty);
        total_waste = total_waste.saturating_add(p.waste as u64 * p.qty as u64);

        output_patterns.push(OutputPattern {
            counts,
            qty: p.qty,
            used_length: used,
            waste: p.waste,
            is_secondary: p.is_secondary,
        });
    }

    let total_stock = stock_qty as u64 * stock as u64;
    let percentage_wasted = if total_stock == 0 {
        0.0
    } else {
        total_waste as f64 / total_stock as f64 * 100.0
    };

    let mut valid = true;
    for i in 0..n {
        if produced[i] < required[i] {
            valid = false;
            break;
        }
    }

    CuttingResult {
        lengths: (0..n).map(|i| lengths[i]).collect(),
        required: (0..n).map(|i| required[i]).collect(),
        produced: (0..n).map(|i| produced[i]).collect(),
        patterns: output_patterns,
        stock_qty,
        total_waste,
        percentage_wasted,
        valid,
    }
}

fn selected_used_length(p: &SelectedPattern, lengths: &[u32; MAX_ITEMS], n: usize) -> u32 {
    let mut used = 0u32;
    for i in 0..n {
        used += p.counts[i] as u32 * lengths[i];
    }
    used
}
