use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use wasm_bindgen::prelude::*;

// Low-allocation WASM-friendly solver.
// Hot path uses fixed-size arrays and linear buffers instead of HashMap/HashSet/Vec<Vec<_>>.
// Tune these based on your expected data size.
const MAX_ITEMS: usize = 32;
const MAX_CANDIDATES: usize = 384;
const MAX_STATES: usize = 320;
const MAX_SELECTED_PATTERNS: usize = 10;
const MAX_RANDOM_GREEDY: usize = 48;
const MIN_FILL_PERCENT: u32 = 50;

// Overcut control. Extra produced pieces are allowed, but strongly penalized.
// This helps match commercial optimizers that accept small overproduction to save bars/material.
const ALLOW_OVERCUT: bool = true;
const MAX_OVERCUT_PERCENT_PER_ITEM: u32 = 3;
const MAX_OVERCUT_ABSOLUTE_PER_ITEM: u32 = 8;
const OVERCUT_LENGTH_PENALTY: i64 = 50_000_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Item {
    pub label: String,
    pub length: u32,
    pub qty: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pattern {
    pub cuts: Vec<String>,
    pub qty: u32,
    pub used_length: u32,
    pub waste: u32,
    pub is_fallback: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CuttingResult {
    pub patterns: Vec<Pattern>,
    pub stock_qty: u32,
    pub percentage_wasted: f64,
    pub used_fallback: bool,
}

#[derive(Clone, Copy)]
struct Candidate {
    counts: [u16; MAX_ITEMS],
    used: u32,
}

impl Candidate {
    fn empty() -> Self {
        Self { counts: [0; MAX_ITEMS], used: 0 }
    }
}

#[derive(Clone, Copy)]
struct SelectedPattern {
    candidate_index: u16,
    qty: u32,
}

#[derive(Clone, Copy)]
struct SearchState {
    remaining: [u32; MAX_ITEMS],
    overcut: [u32; MAX_ITEMS],
    selected: [SelectedPattern; MAX_SELECTED_PATTERNS],
    selected_len: usize,
    stock_qty: u32,
    score: i64,
}

impl SearchState {
    fn new(remaining: [u32; MAX_ITEMS]) -> Self {
        Self {
            remaining,
            overcut: [0; MAX_ITEMS],
            selected: [SelectedPattern { candidate_index: 0, qty: 0 }; MAX_SELECTED_PATTERNS],
            selected_len: 0,
            stock_qty: 0,
            score: i64::MAX,
        }
    }
}

#[wasm_bindgen]
pub fn compute_cutting_plan(
    items: JsValue,
    stock_length: u32,
    bundle_size: u32,
) -> Result<JsValue, JsValue> {
    let items: Vec<Item> = serde_wasm_bindgen::from_value(items)
        .map_err(|e| JsValue::from_str(&format!("Invalid items input: {}", e)))?;

    let grouped_items = group_items_by_length(&items);

    let mut result = compute_with_fallback(&grouped_items, stock_length, bundle_size)
        .map_err(|e| JsValue::from_str(&e))?;

    result.patterns = repopulate_original_labels(result.patterns, items);

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {}", e)))
}

fn group_items_by_length(items: &[Item]) -> Vec<Item> {
    let mut length_to_items: BTreeMap<u32, Vec<Item>> = BTreeMap::new();

    for item in items {
        length_to_items.entry(item.length).or_default().push(item.clone());
    }

    let mut grouped_items = Vec::new();

    for (&length, group) in &length_to_items {
        let total_qty: u32 = group.iter().map(|x| x.qty).sum();
        grouped_items.push(Item { label: length.to_string(), length, qty: total_qty });
    }

    grouped_items.sort_by_key(|i| std::cmp::Reverse(i.length));
    grouped_items
}

pub fn compute_with_fallback(
    items: &[Item],
    stock_length: u32,
    bundle_size: u32,
) -> Result<CuttingResult, String> {
    validate(items, stock_length, bundle_size)?;

    let n = items.len();
    if n > MAX_ITEMS {
        return Err(format!("Too many grouped item lengths: {}. MAX_ITEMS is {}", n, MAX_ITEMS));
    }

    let total_required: u32 = items.iter().map(|x| x.length.saturating_mul(x.qty)).sum();
    if total_required == 0 {
        return Ok(CuttingResult { patterns: vec![], stock_qty: 0, percentage_wasted: 0.0, used_fallback: false });
    }

    let mut lengths = [0u32; MAX_ITEMS];
    let mut demand = [0u32; MAX_ITEMS];
    let mut primary_demand = [0u32; MAX_ITEMS];

    for i in 0..n {
        lengths[i] = items[i].length;
        demand[i] = items[i].qty;
        primary_demand[i] = (items[i].qty / bundle_size) * bundle_size;
    }

    let mut candidates = [Candidate::empty(); MAX_CANDIDATES];
    let candidate_count;

    // Exact and fastest path for one grouped length.
    let primary = if n == 1 {
        let max_per_bar = if lengths[0] == 0 { 0 } else { stock_length / lengths[0] };
        if max_per_bar > 0 {
            candidates[0].counts[0] = max_per_bar.min(u16::MAX as u32) as u16;
            candidates[0].used = max_per_bar * lengths[0];
            candidate_count = 1;
        } else {
            candidate_count = 0;
        }
        solve_single_length_primary(&lengths, &primary_demand, n, stock_length, bundle_size)
    } else {
        candidate_count = generate_candidates_low(
            &lengths,
            &primary_demand,
            n,
            stock_length,
            &mut candidates,
        );

        solve_quantity_low(
            &lengths,
            &primary_demand,
            n,
            stock_length,
            bundle_size,
            &candidates,
            candidate_count,
        )
    };

    let mut remaining = [0u32; MAX_ITEMS];
    for i in 0..n {
        // If primary overcuts an item, fallback must not cut it again.
        remaining[i] = primary.remaining[i];
    }

    let fallback_bars = best_fit_fallback_low(&lengths, &remaining, n, stock_length);
    let used_fallback = fallback_bars.iter().any(|b| b.used > 0);

    Ok(build_result_low(
        primary,
        fallback_bars,
        &lengths,
        n,
        items,
        stock_length,
        total_required,
        used_fallback,
        &candidates,
        candidate_count,
    ))
}

fn solve_single_length_primary(
    lengths: &[u32; MAX_ITEMS],
    demand: &[u32; MAX_ITEMS],
    n: usize,
    stock_length: u32,
    bundle_size: u32,
) -> SearchState {
    let mut state = SearchState::new(*demand);
    if n == 0 || lengths[0] == 0 || demand[0] == 0 {
        state.score = 0;
        return state;
    }

    let max_per_bar = stock_length / lengths[0];
    if max_per_bar == 0 {
        return state;
    }

    // Keep the old business rule: primary pattern qty must be divisible by bundle_size.
    let primary_bars = demand[0] / max_per_bar;
    let q = if bundle_size <= 1 {
        primary_bars
    } else {
        (primary_bars / bundle_size) * bundle_size
    };

    if q > 0 {
        let mut cand = Candidate::empty();
        cand.counts[0] = max_per_bar as u16;
        cand.used = max_per_bar * lengths[0];
        state.remaining[0] = demand[0].saturating_sub(max_per_bar * q);
        state.selected[0] = SelectedPattern { candidate_index: 0, qty: q };
        state.selected_len = 1;
        state.stock_qty = q;
    }

    state.score = final_score(&state, lengths, n, stock_length);
    state
}

fn generate_candidates_low(
    lengths: &[u32; MAX_ITEMS],
    remaining: &[u32; MAX_ITEMS],
    n: usize,
    stock_length: u32,
    out: &mut [Candidate; MAX_CANDIDATES],
) -> usize {
    let mut count = 0usize;
    let mut order_len = [0usize; MAX_ITEMS];
    let mut order_qty = [0usize; MAX_ITEMS];
    for i in 0..n {
        order_len[i] = i;
        order_qty[i] = i;
    }
    sort_order_desc(&mut order_len, n, lengths);
    sort_order_qty_desc(&mut order_qty, n, remaining);

    let cand = greedy_candidate(lengths, remaining, n, stock_length, &order_len, n, None);
    push_candidate_linear(out, &mut count, cand, n, stock_length);

    let cand = greedy_candidate(lengths, remaining, n, stock_length, &order_qty, n, None);
    push_candidate_linear(out, &mut count, cand, n, stock_length);

    for k in 0..n {
        let seed = order_len[k];
        if remaining[seed] == 0 { continue; }
        let cand = greedy_candidate(lengths, remaining, n, stock_length, &order_len, n, Some(seed));
        push_candidate_linear(out, &mut count, cand, n, stock_length);
    }

    // Single-length max-fill candidates.
    for k in 0..n {
        let i = order_len[k];
        if remaining[i] == 0 || lengths[i] == 0 { continue; }
        let max_count = remaining[i].min(stock_length / lengths[i]);
        if max_count > 0 && max_count <= u16::MAX as u32 {
            let mut cand = Candidate::empty();
            cand.counts[i] = max_count as u16;
            cand.used = max_count * lengths[i];
            push_candidate_linear(out, &mut count, cand, n, stock_length);
        }
    }

    // Deterministic shuffled greedy variants, no RNG allocation.
    let mut rng = Lcg::new(0x9E3779B97F4A7C15);
    let mut order = [0usize; MAX_ITEMS];
    for _ in 0..MAX_RANDOM_GREEDY {
        for i in 0..n { order[i] = order_len[i]; }
        for i in 0..n {
            let j = rng.next_usize(n);
            order.swap(i, j);
        }
        let cand = greedy_candidate(lengths, remaining, n, stock_length, &order, n, None);
        push_candidate_linear(out, &mut count, cand, n, stock_length);
    }

    generate_knapsack_candidates_low(lengths, remaining, n, stock_length, out, &mut count);

    sort_candidates(out, count, stock_length);
    count
}

fn greedy_candidate(
    lengths: &[u32; MAX_ITEMS],
    remaining: &[u32; MAX_ITEMS],
    n: usize,
    stock_length: u32,
    order: &[usize; MAX_ITEMS],
    order_n: usize,
    seed: Option<usize>,
) -> Candidate {
    let mut cand = Candidate::empty();

    if let Some(i) = seed {
        if i < n && remaining[i] > 0 && lengths[i] <= stock_length {
            cand.counts[i] = 1;
            cand.used = lengths[i];
        }
    }

    let mut changed = true;
    while changed {
        changed = false;
        for k in 0..order_n {
            let i = order[k];
            if i >= n { continue; }
            if cand.counts[i] as u32 >= remaining[i] { continue; }
            if cand.used + lengths[i] <= stock_length {
                cand.counts[i] += 1;
                cand.used += lengths[i];
                changed = true;
            }
        }
    }

    cand
}

fn generate_knapsack_candidates_low(
    lengths: &[u32; MAX_ITEMS],
    remaining: &[u32; MAX_ITEMS],
    n: usize,
    stock_length: u32,
    out: &mut [Candidate; MAX_CANDIDATES],
    count: &mut usize,
) {
    let cap = stock_length as usize;
    if cap == 0 || cap > 30000 { return; }

    let mut reachable = vec![false; cap + 1];
    let mut dp = vec![Candidate::empty(); cap + 1];
    reachable[0] = true;

    for i in 0..n {
        if lengths[i] == 0 || remaining[i] == 0 { continue; }
        let len = lengths[i] as usize;
        if len > cap { continue; }
        let max_count = remaining[i].min(stock_length / lengths[i]).min(u16::MAX as u32);

        for _ in 0..max_count {
            for used in (0..=cap - len).rev() {
                if !reachable[used] { continue; }
                let next_used = used + len;
                let mut next = dp[used];
                if next.counts[i] == u16::MAX { continue; }
                next.counts[i] += 1;
                next.used += lengths[i];

                if !reachable[next_used] || candidate_better_for_same_used(&next, &dp[next_used], n) {
                    reachable[next_used] = true;
                    dp[next_used] = next;
                }
            }
        }
    }

    let min_used = stock_length * MIN_FILL_PERCENT / 100;
    let mut added = 0usize;
    for used in (1..=cap).rev() {
        if !reachable[used] { continue; }
        let cand = dp[used];
        if cand.used < min_used && added > 16 { break; }
        push_candidate_linear(out, count, cand, n, stock_length);
        added += 1;
        if added >= 160 || *count >= MAX_CANDIDATES { break; }
    }
}

fn solve_quantity_low(
    lengths: &[u32; MAX_ITEMS],
    demand: &[u32; MAX_ITEMS],
    n: usize,
    stock_length: u32,
    bundle_size: u32,
    candidates: &[Candidate; MAX_CANDIDATES],
    candidate_count: usize,
) -> SearchState {
    let mut states = [SearchState::new([0; MAX_ITEMS]); MAX_STATES];
    let mut next_states = [SearchState::new([0; MAX_ITEMS]); MAX_STATES];

    states[0] = SearchState::new(*demand);
    states[0].score = final_score(&states[0], lengths, n, stock_length);
    let mut state_count = 1usize;
    let mut best = states[0];

    let depth_limit = MAX_SELECTED_PATTERNS.min(candidate_count);

    for _depth in 0..depth_limit {
        let mut next_count = 0usize;

        for s_idx in 0..state_count {
            let state = states[s_idx];
            if all_done(&state.remaining, n) {
                if state.score < best.score { best = state; }
                continue;
            }

            for c_idx in 0..candidate_count {
                let cand = candidates[c_idx];
                let max_rep = max_repeat_with_overcut(&cand, &state.remaining, &state.overcut, demand, n);
                if max_rep == 0 { continue; }

                let mut trials = [0u32; 14];
                let trial_count = make_trial_quantities_overcut(
                    &cand,
                    &state.remaining,
                    max_rep,
                    bundle_size,
                    n,
                    &mut trials,
                );
                for t in 0..trial_count {
                    let q = trials[t];
                    if q == 0 { continue; }
                    let mut ns = state;
                    if !apply_candidate_with_overcut(&mut ns.remaining, &mut ns.overcut, demand, &cand, q, n) { continue; }
                    ns.stock_qty = ns.stock_qty.saturating_add(q);
                    add_selected(&mut ns, c_idx, q);
                    ns.score = final_score(&ns, lengths, n, stock_length);

                    if ns.score < best.score { best = ns; }
                    push_state_dedup(&mut next_states, &mut next_count, ns, n);
                }
            }
        }

        if next_count == 0 { break; }
        sort_states(&mut next_states, next_count);
        if next_count > MAX_STATES { next_count = MAX_STATES; }

        for i in 0..next_count {
            states[i] = next_states[i];
        }
        state_count = next_count;
    }

    // If search produced nothing good, use a greedy candidate walk as safe fallback.
    if best.stock_qty == 0 && !all_done(demand, n) {
        best = greedy_quantity_solution(lengths, demand, n, stock_length, bundle_size, candidates, candidate_count);
    }

    best
}

fn greedy_quantity_solution(
    lengths: &[u32; MAX_ITEMS],
    demand: &[u32; MAX_ITEMS],
    n: usize,
    stock_length: u32,
    bundle_size: u32,
    candidates: &[Candidate; MAX_CANDIDATES],
    candidate_count: usize,
) -> SearchState {
    let mut state = SearchState::new(*demand);

    for c_idx in 0..candidate_count {
        let cand = candidates[c_idx];
        let max_rep = max_repeat_with_overcut(&cand, &state.remaining, &state.overcut, demand, n);
        if max_rep == 0 { continue; }
        let q = if bundle_size <= 1 { max_rep } else { (max_rep / bundle_size) * bundle_size };
        if q == 0 { continue; }
        apply_candidate_with_overcut(&mut state.remaining, &mut state.overcut, demand, &cand, q, n);
        state.stock_qty += q;
        add_selected(&mut state, c_idx, q);
        if all_done(&state.remaining, n) { break; }
    }

    state.score = final_score(&state, lengths, n, stock_length);
    state
}

fn best_fit_fallback_low(
    lengths: &[u32; MAX_ITEMS],
    remaining: &[u32; MAX_ITEMS],
    n: usize,
    stock_length: u32,
) -> Vec<Candidate> {
    let mut bars: Vec<Candidate> = Vec::new();

    let mut order = [0usize; MAX_ITEMS];
    for i in 0..n { order[i] = i; }
    sort_order_desc(&mut order, n, lengths);

    for k in 0..n {
        let i = order[k];
        for _ in 0..remaining[i] {
            let len = lengths[i];
            let mut best_index: Option<usize> = None;
            let mut best_rem = u32::MAX;

            for b in 0..bars.len() {
                if bars[b].used + len <= stock_length {
                    let rem = stock_length - (bars[b].used + len);
                    if rem < best_rem {
                        best_rem = rem;
                        best_index = Some(b);
                    }
                }
            }

            match best_index {
                Some(b) => {
                    bars[b].counts[i] += 1;
                    bars[b].used += len;
                }
                None => {
                    let mut cand = Candidate::empty();
                    cand.counts[i] = 1;
                    cand.used = len;
                    bars.push(cand);
                }
            }
        }
    }

    bars
}

fn build_result_low(
    primary: SearchState,
    fallback_bars: Vec<Candidate>,
    lengths: &[u32; MAX_ITEMS],
    n: usize,
    items: &[Item],
    stock_length: u32,
    total_required: u32,
    used_fallback: bool,
    candidates: &[Candidate; MAX_CANDIDATES],
    candidate_count: usize,
) -> CuttingResult {
    let mut patterns: Vec<Pattern> = Vec::new();

    for s in 0..primary.selected_len {
        let sel = primary.selected[s];
        if sel.qty == 0 { continue; }
        let idx = sel.candidate_index as usize;
        if idx >= candidate_count { continue; }
        let cand = candidates[idx];
        insert_or_merge_pattern(&mut patterns, cand, sel.qty, items, stock_length, false, n);
    }

    for cand in fallback_bars {
        if cand.used > 0 {
            insert_or_merge_pattern(&mut patterns, cand, 1, items, stock_length, true, n);
        }
    }

    patterns.sort_by_key(|p| {
        (
            p.is_fallback,
            std::cmp::Reverse(p.qty),
            p.waste,
            std::cmp::Reverse(p.used_length),
        )
    });

    let stock_qty: u32 = patterns.iter().map(|p| p.qty).sum();
    let total_stock = stock_qty.saturating_mul(stock_length);
    let total_waste = total_stock.saturating_sub(total_required);
    let percentage_wasted = if total_stock == 0 { 0.0 } else { total_waste as f64 / total_stock as f64 * 100.0 };

    CuttingResult { patterns, stock_qty, percentage_wasted, used_fallback }
}

fn insert_or_merge_pattern(
    patterns: &mut Vec<Pattern>,
    cand: Candidate,
    qty: u32,
    items: &[Item],
    stock_length: u32,
    is_fallback: bool,
    n: usize,
) {
    let mut cuts = Vec::new();
    let mut order = [0usize; MAX_ITEMS];
    for i in 0..n { order[i] = i; }
    order[..n].sort_by_key(|&i| std::cmp::Reverse(items[i].length));

    for k in 0..n {
        let i = order[k];
        for _ in 0..cand.counts[i] {
            cuts.push(format!("{} ({})", items[i].label, items[i].length));
        }
    }

    for p in patterns.iter_mut() {
        if p.is_fallback == is_fallback && p.cuts == cuts {
            p.qty += qty;
            return;
        }
    }

    patterns.push(Pattern {
        cuts,
        qty,
        used_length: cand.used,
        waste: stock_length.saturating_sub(cand.used),
        is_fallback,
    });
}

fn array_from_items_qty(items: &[Item]) -> [u32; MAX_ITEMS] {
    let mut a = [0u32; MAX_ITEMS];
    for i in 0..items.len().min(MAX_ITEMS) {
        a[i] = items[i].qty;
    }
    a
}

fn repopulate_original_labels(patterns: Vec<Pattern>, items: Vec<Item>) -> Vec<Pattern> {
    let mut pool: HashMap<u32, Vec<Item>> = HashMap::new();
    for item in items {
        pool.entry(item.length).or_default().push(item);
    }

    let mut pool_state: HashMap<u32, (usize, u32)> = HashMap::new();
    for &length in pool.keys() {
        pool_state.insert(length, (0, 0));
    }

    let mut final_patterns: Vec<Pattern> = Vec::new();
    for pattern in patterns {
        for _ in 0..pattern.qty {
            let mut new_cuts = Vec::new();
            for cut_str in &pattern.cuts {
                match extract_length_from_cut(cut_str) {
                    Some(length) => {
                        let Some(state) = pool_state.get_mut(&length) else {
                            new_cuts.push(cut_str.clone());
                            continue;
                        };
                        let Some(items_of_length) = pool.get(&length) else {
                            new_cuts.push(cut_str.clone());
                            continue;
                        };

                        let mut idx = state.0;
                        let mut used = state.1;
                        while idx < items_of_length.len() && used >= items_of_length[idx].qty {
                            idx += 1;
                            used = 0;
                        }

                        if idx < items_of_length.len() {
                            let original = &items_of_length[idx];
                            new_cuts.push(format!("{} ({})", original.label, length));
                            used += 1;
                            state.0 = idx;
                            state.1 = used;
                        } else {
                            new_cuts.push(cut_str.clone());
                        }
                    }
                    None => new_cuts.push(cut_str.clone()),
                }
            }

            let mut merged = false;
            for p in final_patterns.iter_mut().rev() {
                if p.cuts == new_cuts && p.is_fallback == pattern.is_fallback {
                    p.qty += 1;
                    merged = true;
                    break;
                }
            }
            if !merged {
                final_patterns.push(Pattern {
                    cuts: new_cuts,
                    qty: 1,
                    used_length: pattern.used_length,
                    waste: pattern.waste,
                    is_fallback: pattern.is_fallback,
                });
            }
        }
    }

    final_patterns
}

fn extract_length_from_cut(cut: &str) -> Option<u32> {
    if let Some(start) = cut.rfind('(') {
        if let Some(end) = cut.rfind(')') {
            if end > start + 1 {
                return cut[start + 1..end].trim().parse::<u32>().ok();
            }
        }
    }
    cut.split_whitespace().next()?.parse::<u32>().ok()
}

fn validate(items: &[Item], stock_length: u32, bundle_size: u32) -> Result<(), String> {
    if stock_length == 0 { return Err("stock_length must be greater than 0".to_string()); }
    if bundle_size == 0 { return Err("bundle_size must be greater than 0".to_string()); }
    if items.len() > MAX_ITEMS { return Err(format!("Too many grouped lengths. Max is {}", MAX_ITEMS)); }

    for item in items {
        if item.length == 0 { return Err(format!("Item '{}' has zero length", item.label)); }
        if item.length > stock_length {
            return Err(format!("Item '{}' length {} is longer than stock length {}", item.label, item.length, stock_length));
        }
    }
    Ok(())
}

fn push_candidate_linear(
    out: &mut [Candidate; MAX_CANDIDATES],
    count: &mut usize,
    cand: Candidate,
    n: usize,
    stock_length: u32,
) {
    if cand.used == 0 || cand.used > stock_length { return; }
    if cand.used * 100 < stock_length * MIN_FILL_PERCENT && *count > 32 { return; }

    for i in 0..*count {
        if same_counts(&out[i], &cand, n) { return; }
    }
    if *count < MAX_CANDIDATES {
        out[*count] = cand;
        *count += 1;
    }
}

fn same_counts(a: &Candidate, b: &Candidate, n: usize) -> bool {
    for i in 0..n {
        if a.counts[i] != b.counts[i] { return false; }
    }
    true
}

fn candidate_better_for_same_used(a: &Candidate, b: &Candidate, n: usize) -> bool {
    count_kinds(a, n) > count_kinds(b, n)
}

fn count_kinds(c: &Candidate, n: usize) -> u32 {
    let mut k = 0;
    for i in 0..n {
        if c.counts[i] > 0 { k += 1; }
    }
    k
}

fn sort_candidates(cands: &mut [Candidate; MAX_CANDIDATES], count: usize, stock_length: u32) {
    cands[..count].sort_by_key(|c| {
        let waste = stock_length.saturating_sub(c.used);
        (waste, std::cmp::Reverse(c.used))
    });
}

fn max_repeat(cand: &Candidate, remaining: &[u32; MAX_ITEMS], n: usize) -> u32 {
    let mut max_rep = u32::MAX;
    let mut has = false;
    for i in 0..n {
        let c = cand.counts[i] as u32;
        if c > 0 {
            has = true;
            max_rep = max_rep.min(remaining[i] / c);
        }
    }
    if has { max_rep } else { 0 }
}

fn make_trial_quantities(max_rep: u32, bundle_size: u32, out: &mut [u32; 8]) -> usize {
    let mut count = 0usize;
    let step = bundle_size.max(1);
    let max_q = (max_rep / step) * step;
    if max_q == 0 { return 0; }

    push_u32_unique(out, &mut count, max_q);
    push_u32_unique(out, &mut count, step);
    push_u32_unique(out, &mut count, (max_q / 2 / step) * step);
    if max_q > step { push_u32_unique(out, &mut count, max_q - step); }
    if max_q >= step * 3 { push_u32_unique(out, &mut count, step * 2); }
    if max_q >= step * 4 { push_u32_unique(out, &mut count, (max_q / 3 / step) * step); }
    if max_q >= step * 4 { push_u32_unique(out, &mut count, ((max_q * 2) / 3 / step) * step); }

    out[..count].sort_by_key(|&q| std::cmp::Reverse(q));
    count
}

fn push_u32_unique(out: &mut [u32; 8], count: &mut usize, v: u32) {
    if v == 0 || *count >= out.len() { return; }
    for i in 0..*count {
        if out[i] == v { return; }
    }
    out[*count] = v;
    *count += 1;
}

fn subtract_candidate(remaining: &mut [u32; MAX_ITEMS], cand: &Candidate, q: u32, n: usize) -> bool {
    for i in 0..n {
        let need = cand.counts[i] as u32 * q;
        if need > remaining[i] { return false; }
    }
    for i in 0..n {
        remaining[i] -= cand.counts[i] as u32 * q;
    }
    true
}

fn add_selected(state: &mut SearchState, c_idx: usize, qty: u32) {
    for i in 0..state.selected_len {
        if state.selected[i].candidate_index as usize == c_idx {
            state.selected[i].qty += qty;
            return;
        }
    }
    if state.selected_len < MAX_SELECTED_PATTERNS {
        state.selected[state.selected_len] = SelectedPattern { candidate_index: c_idx as u16, qty };
        state.selected_len += 1;
    }
}

fn push_state_dedup(states: &mut [SearchState; MAX_STATES], count: &mut usize, state: SearchState, n: usize) {
    for i in 0..*count {
        if same_state_balance(&states[i], &state, n) {
            if state.score < states[i].score {
                states[i] = state;
            }
            return;
        }
    }

    if *count < MAX_STATES {
        states[*count] = state;
        *count += 1;
        return;
    }

    // Replace current worst state if the new one is better.
    let mut worst = 0usize;
    for i in 1..MAX_STATES {
        if states[i].score > states[worst].score { worst = i; }
    }
    if state.score < states[worst].score {
        states[worst] = state;
    }
}

fn same_remaining(a: &[u32; MAX_ITEMS], b: &[u32; MAX_ITEMS], n: usize) -> bool {
    for i in 0..n {
        if a[i] != b[i] { return false; }
    }
    true
}

fn sort_states(states: &mut [SearchState; MAX_STATES], count: usize) {
    states[..count].sort_by_key(|s| s.score);
}

fn all_done(remaining: &[u32; MAX_ITEMS], n: usize) -> bool {
    for i in 0..n {
        if remaining[i] != 0 { return false; }
    }
    true
}

fn remaining_length(lengths: &[u32; MAX_ITEMS], remaining: &[u32; MAX_ITEMS], n: usize) -> u32 {
    let mut total = 0u32;
    for i in 0..n {
        total = total.saturating_add(lengths[i].saturating_mul(remaining[i]));
    }
    total
}

fn selected_used_length(state: &SearchState, lengths: &[u32; MAX_ITEMS], n: usize, stock_length: u32) -> u32 {
    // Exact selected used length is not stored per state in order to keep state compact.
    // Use stock-based lower-bound for scoring; final result is exact after rebuilding patterns.
    let rem = remaining_length(lengths, &state.remaining, n);
    let demand_total = 0u32.saturating_add(rem);
    state.stock_qty.saturating_mul(stock_length).saturating_sub(demand_total)
}

fn estimate_fallback_bars(lengths: &[u32; MAX_ITEMS], remaining: &[u32; MAX_ITEMS], n: usize, stock_length: u32) -> u32 {
    let total = remaining_length(lengths, remaining, n);
    if total == 0 { 0 } else { (total + stock_length - 1) / stock_length }
}

fn final_score(state: &SearchState, lengths: &[u32; MAX_ITEMS], n: usize, stock_length: u32) -> i64 {
    let fallback = estimate_fallback_bars(lengths, &state.remaining, n, stock_length);
    let total_bars = state.stock_qty + fallback;
    let rem_len = remaining_length(lengths, &state.remaining, n);
    let fallback_waste = fallback.saturating_mul(stock_length).saturating_sub(rem_len);
    let overcut_len = overcut_length(lengths, &state.overcut, n);
    let pattern_count = state.selected_len as i64;

    // Priority:
    // 1. lowest total bars
    // 2. lowest fallback bars
    // 3. avoid excessive overcut
    // 4. lowest estimated material waste
    // 5. lower remaining length / fewer pattern types
    total_bars as i64 * 1_000_000_000
        + fallback as i64 * 100_000_000
        + overcut_len as i64 * OVERCUT_LENGTH_PENALTY
        + fallback_waste as i64 * 10_000
        + rem_len as i64
        + pattern_count * 10
}

fn max_allowed_overcut(demand: u32) -> u32 {
    if !ALLOW_OVERCUT {
        return 0;
    }
    let percent_allowance = demand.saturating_mul(MAX_OVERCUT_PERCENT_PER_ITEM) / 100;
    percent_allowance.max(MAX_OVERCUT_ABSOLUTE_PER_ITEM)
}

fn max_repeat_with_overcut(
    cand: &Candidate,
    remaining: &[u32; MAX_ITEMS],
    overcut: &[u32; MAX_ITEMS],
    demand: &[u32; MAX_ITEMS],
    n: usize,
) -> u32 {
    let mut max_rep = u32::MAX;
    let mut has = false;

    for i in 0..n {
        let c = cand.counts[i] as u32;
        if c == 0 { continue; }
        has = true;
        let allowance = max_allowed_overcut(demand[i]);
        let over_left = allowance.saturating_sub(overcut[i]);
        let allowed_extra_cuts = remaining[i].saturating_add(over_left);
        max_rep = max_rep.min(allowed_extra_cuts / c);
    }

    if has { max_rep } else { 0 }
}

fn make_trial_quantities_overcut(
    cand: &Candidate,
    remaining: &[u32; MAX_ITEMS],
    max_rep: u32,
    bundle_size: u32,
    n: usize,
    out: &mut [u32; 14],
) -> usize {
    let mut count = 0usize;
    let step = bundle_size.max(1);
    let max_q = (max_rep / step) * step;
    if max_q == 0 { return 0; }

    push_u32_unique_dyn(out, &mut count, max_q);
    push_u32_unique_dyn(out, &mut count, step);
    push_u32_unique_dyn(out, &mut count, (max_q / 2 / step) * step);
    if max_q > step { push_u32_unique_dyn(out, &mut count, max_q - step); }
    if max_q >= step * 3 { push_u32_unique_dyn(out, &mut count, step * 2); }
    if max_q >= step * 4 { push_u32_unique_dyn(out, &mut count, (max_q / 3 / step) * step); }
    if max_q >= step * 4 { push_u32_unique_dyn(out, &mut count, ((max_q * 2) / 3 / step) * step); }

    // Critical for overcut: try the quantity that just covers a remaining item.
    // Example: remaining 1736, candidate uses 5 pieces => ceil(1736/5) = 348.
    for i in 0..n {
        let c = cand.counts[i] as u32;
        if c == 0 || remaining[i] == 0 { continue; }
        let ceil_q = (remaining[i] + c - 1) / c;
        let ceil_q = ((ceil_q + step - 1) / step) * step;
        if ceil_q <= max_q {
            push_u32_unique_dyn(out, &mut count, ceil_q);
        }
        if ceil_q > step {
            push_u32_unique_dyn(out, &mut count, ceil_q - step);
        }
        if ceil_q + step <= max_q {
            push_u32_unique_dyn(out, &mut count, ceil_q + step);
        }
    }

    out[..count].sort_by_key(|&q| std::cmp::Reverse(q));
    count
}

fn push_u32_unique_dyn<const N: usize>(out: &mut [u32; N], count: &mut usize, v: u32) {
    if v == 0 || *count >= out.len() { return; }
    for i in 0..*count {
        if out[i] == v { return; }
    }
    out[*count] = v;
    *count += 1;
}

fn apply_candidate_with_overcut(
    remaining: &mut [u32; MAX_ITEMS],
    overcut: &mut [u32; MAX_ITEMS],
    demand: &[u32; MAX_ITEMS],
    cand: &Candidate,
    q: u32,
    n: usize,
) -> bool {
    let mut new_remaining = *remaining;
    let mut new_overcut = *overcut;

    for i in 0..n {
        let produce = cand.counts[i] as u32 * q;
        if produce == 0 { continue; }

        if produce <= new_remaining[i] {
            new_remaining[i] -= produce;
        } else {
            let extra = produce - new_remaining[i];
            new_remaining[i] = 0;
            new_overcut[i] = new_overcut[i].saturating_add(extra);
            if new_overcut[i] > max_allowed_overcut(demand[i]) {
                return false;
            }
        }
    }

    *remaining = new_remaining;
    *overcut = new_overcut;
    true
}

fn overcut_length(lengths: &[u32; MAX_ITEMS], overcut: &[u32; MAX_ITEMS], n: usize) -> u32 {
    let mut total = 0u32;
    for i in 0..n {
        total = total.saturating_add(lengths[i].saturating_mul(overcut[i]));
    }
    total
}

fn same_state_balance(a: &SearchState, b: &SearchState, n: usize) -> bool {
    for i in 0..n {
        if a.remaining[i] != b.remaining[i] || a.overcut[i] != b.overcut[i] { return false; }
    }
    true
}

fn sort_order_desc(order: &mut [usize; MAX_ITEMS], n: usize, lengths: &[u32; MAX_ITEMS]) {
    order[..n].sort_by_key(|&i| std::cmp::Reverse(lengths[i]));
}

fn sort_order_qty_desc(order: &mut [usize; MAX_ITEMS], n: usize, qty: &[u32; MAX_ITEMS]) {
    order[..n].sort_by_key(|&i| std::cmp::Reverse(qty[i]));
}

struct Lcg { state: u64 }

impl Lcg {
    fn new(seed: u64) -> Self { Self { state: seed } }
    fn next_u32(&mut self) -> u32 {
        self.state = self.state.wrapping_mul(6364136223846793005).wrapping_add(1);
        (self.state >> 32) as u32
    }
    fn next_usize(&mut self, max: usize) -> usize {
        if max == 0 { 0 } else { self.next_u32() as usize % max }
    }
}
