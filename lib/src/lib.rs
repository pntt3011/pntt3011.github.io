use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use wasm_bindgen::prelude::*;

// Balanced defaults for browser/WASM use.
// Increase these for slightly better material saving, decrease for faster results.
const MAX_PRIMARY_PATTERNS: usize = 6;
const MAX_CANDIDATES: usize = 420;
const KNAPSACK_CANDIDATE_LIMIT: usize = 180;
const QUANTITY_BEAM_WIDTH: usize = 450;
const RANDOM_CANDIDATE_COUNT: usize = 80;
const MIN_FILL_PERCENT_TO_KEEP: u32 = 55;

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

#[derive(Debug, Clone, Hash, PartialEq, Eq)]
struct Candidate {
    counts: Vec<u32>,
    used: u32,
}

#[derive(Debug, Clone)]
struct State {
    remaining: Vec<u32>,
    selected: Vec<(Candidate, u32)>,
    stock_qty: u32,
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

        grouped_items.push(Item {
            label: length.to_string(),
            length,
            qty: total_qty,
        });
    }

    grouped_items.sort_by_key(|i| std::cmp::Reverse(i.length));
    grouped_items
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
                let length = extract_length_from_cut(cut_str);

                match length {
                    Some(length) => {
                        let state = match pool_state.get_mut(&length) {
                            Some(s) => s,
                            None => {
                                new_cuts.push(cut_str.clone());
                                continue;
                            }
                        };

                        let items_of_length = match pool.get(&length) {
                            Some(items) => items,
                            None => {
                                new_cuts.push(cut_str.clone());
                                continue;
                            }
                        };

                        let mut current_item_idx = state.0;
                        let mut used_from_current = state.1;

                        while current_item_idx < items_of_length.len()
                            && used_from_current >= items_of_length[current_item_idx].qty
                        {
                            current_item_idx += 1;
                            used_from_current = 0;
                        }

                        if current_item_idx < items_of_length.len() {
                            let original = &items_of_length[current_item_idx];
                            new_cuts.push(format!("{} ({})", original.label, length));
                            used_from_current += 1;
                            state.0 = current_item_idx;
                            state.1 = used_from_current;
                        } else {
                            new_cuts.push(cut_str.clone());
                        }
                    }
                    None => new_cuts.push(cut_str.clone()),
                }
            }

            let mut found = false;

            for p in final_patterns.iter_mut().rev() {
                if p.cuts == new_cuts && p.is_fallback == pattern.is_fallback {
                    p.qty += 1;
                    found = true;
                    break;
                }
            }

            if !found {
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

pub fn compute_with_fallback(
    items: &[Item],
    stock_length: u32,
    bundle_size: u32,
) -> Result<CuttingResult, String> {
    validate(items, stock_length, bundle_size)?;

    let total_required: u32 = items.iter().map(|x| x.length * x.qty).sum();

    if total_required == 0 {
        return Ok(CuttingResult {
            patterns: vec![],
            stock_qty: 0,
            percentage_wasted: 0.0,
            used_fallback: false,
        });
    }

    let lengths: Vec<u32> = items.iter().map(|x| x.length).collect();

    // Keep your previous rule: primary production handles full bundles only.
    // Remainders below bundle_size are packed by fallback.
    let primary_demand: Vec<u32> = items
        .iter()
        .map(|x| (x.qty / bundle_size) * bundle_size)
        .collect();

    let primary_state = solve_primary_patterns(&lengths, &primary_demand, stock_length);

    let mut remaining = vec![0; items.len()];

    for i in 0..items.len() {
        let used_by_primary = primary_demand[i].saturating_sub(primary_state.remaining[i]);
        remaining[i] = items[i].qty.saturating_sub(used_by_primary);
    }

    let fallback_bars = if remaining.iter().any(|&x| x > 0) {
        best_fit_decreasing_fallback(&lengths, &remaining, stock_length)
    } else {
        vec![]
    };

    let used_fallback = !fallback_bars.is_empty();

    Ok(build_result(
        primary_state,
        fallback_bars,
        items,
        stock_length,
        total_required,
        used_fallback,
    ))
}

fn solve_primary_patterns(lengths: &[u32], demand: &[u32], stock_length: u32) -> State {
    if demand.iter().all(|&x| x == 0) {
        return State {
            remaining: demand.to_vec(),
            selected: vec![],
            stock_qty: 0,
        };
    }

    if let Some(state) = solve_single_length_exact(lengths, demand, stock_length) {
        return state;
    }

    let mut candidates = generate_candidate_pool(lengths, demand, stock_length);
    prune_and_sort_candidates(&mut candidates, lengths, demand, stock_length);

    let beam_state = quantity_beam_search(lengths, demand, stock_length, &candidates);
    local_improve_with_fallback(lengths, stock_length, beam_state, &candidates)
}

fn solve_single_length_exact(lengths: &[u32], demand: &[u32], stock_length: u32) -> Option<State> {
    let active: Vec<usize> = demand
        .iter()
        .enumerate()
        .filter_map(|(i, &q)| if q > 0 { Some(i) } else { None })
        .collect();

    if active.len() != 1 {
        return None;
    }

    let i = active[0];
    let per_full_bar = stock_length / lengths[i];

    if per_full_bar == 0 {
        return None;
    }

    let full_bars = demand[i] / per_full_bar;
    let rem = demand[i] % per_full_bar;

    let mut selected = Vec::new();
    let mut stock_qty = 0;

    if full_bars > 0 {
        let mut counts = vec![0; lengths.len()];
        counts[i] = per_full_bar;
        selected.push((
            Candidate {
                counts,
                used: per_full_bar * lengths[i],
            },
            full_bars,
        ));
        stock_qty += full_bars;
    }

    if rem > 0 {
        let mut counts = vec![0; lengths.len()];
        counts[i] = rem;
        selected.push((
            Candidate {
                counts,
                used: rem * lengths[i],
            },
            1,
        ));
        stock_qty += 1;
    }

    Some(State {
        remaining: vec![0; lengths.len()],
        selected,
        stock_qty,
    })
}

fn generate_candidate_pool(lengths: &[u32], demand: &[u32], stock_length: u32) -> Vec<Candidate> {
    let n = lengths.len();
    let mut candidates = Vec::new();
    let mut seen: HashSet<Vec<u32>> = HashSet::new();

    let mut desc_len: Vec<usize> = (0..n).collect();
    desc_len.sort_by_key(|&i| std::cmp::Reverse(lengths[i]));

    let mut asc_len = desc_len.clone();
    asc_len.reverse();

    let mut desc_qty: Vec<usize> = (0..n).collect();
    desc_qty.sort_by_key(|&i| std::cmp::Reverse(demand[i]));

    let mut desc_len_qty: Vec<usize> = (0..n).collect();
    desc_len_qty.sort_by_key(|&i| (std::cmp::Reverse(lengths[i]), std::cmp::Reverse(demand[i])));

    for order in [&desc_len, &asc_len, &desc_qty, &desc_len_qty] {
        push_candidate(
            &mut seen,
            &mut candidates,
            greedy_pattern(lengths, demand, stock_length, order, None),
        );

        for &seed in order.iter() {
            push_candidate(
                &mut seen,
                &mut candidates,
                greedy_pattern(lengths, demand, stock_length, order, Some(seed)),
            );
        }
    }

    add_single_length_candidates(&mut seen, &mut candidates, lengths, demand, stock_length);

    for cand in generate_knapsack_candidates(lengths, demand, stock_length, KNAPSACK_CANDIDATE_LIMIT) {
        push_candidate(&mut seen, &mut candidates, cand);
    }

    let mut rng = Lcg::new(0x4d59_5df4_d0f3_3173);

    for _ in 0..RANDOM_CANDIDATE_COUNT {
        let mut order = desc_len.clone();

        for i in 0..order.len() {
            let j = rng.next_usize(order.len());
            order.swap(i, j);
        }

        push_candidate(
            &mut seen,
            &mut candidates,
            greedy_pattern(lengths, demand, stock_length, &order, None),
        );
    }

    candidates
}

fn add_single_length_candidates(
    seen: &mut HashSet<Vec<u32>>,
    candidates: &mut Vec<Candidate>,
    lengths: &[u32],
    demand: &[u32],
    stock_length: u32,
) {
    for i in 0..lengths.len() {
        if demand[i] == 0 {
            continue;
        }

        let max_count = std::cmp::min(demand[i], stock_length / lengths[i]);

        if max_count == 0 {
            continue;
        }

        let mut useful_counts = vec![max_count, 1];

        if max_count > 1 {
            useful_counts.push(max_count - 1);
            useful_counts.push((max_count + 1) / 2);
        }

        if demand[i] < max_count {
            useful_counts.push(demand[i]);
        }

        useful_counts.sort();
        useful_counts.dedup();

        for count in useful_counts {
            if count == 0 {
                continue;
            }

            let mut counts = vec![0; lengths.len()];
            counts[i] = count;
            push_candidate(
                seen,
                candidates,
                Candidate {
                    counts,
                    used: count * lengths[i],
                },
            );
        }
    }
}

fn greedy_pattern(
    lengths: &[u32],
    demand: &[u32],
    stock_length: u32,
    order: &[usize],
    seed: Option<usize>,
) -> Candidate {
    let mut counts = vec![0; lengths.len()];
    let mut used = 0;

    if let Some(i) = seed {
        if demand[i] > 0 && lengths[i] <= stock_length {
            counts[i] += 1;
            used += lengths[i];
        }
    }

    loop {
        let mut changed = false;

        for &i in order {
            if counts[i] < demand[i] && used + lengths[i] <= stock_length {
                counts[i] += 1;
                used += lengths[i];
                changed = true;
            }
        }

        if !changed {
            break;
        }
    }

    Candidate { counts, used }
}

fn generate_knapsack_candidates(
    lengths: &[u32],
    demand: &[u32],
    stock_length: u32,
    limit: usize,
) -> Vec<Candidate> {
    if lengths.is_empty() || stock_length == 0 || limit == 0 {
        return vec![];
    }

    let capacity = stock_length as usize;
    let mut dp: Vec<Option<Candidate>> = vec![None; capacity + 1];

    dp[0] = Some(Candidate {
        counts: vec![0; lengths.len()],
        used: 0,
    });

    for i in 0..lengths.len() {
        if demand[i] == 0 || lengths[i] == 0 || lengths[i] > stock_length {
            continue;
        }

        let item_len = lengths[i] as usize;
        let max_in_bar = std::cmp::min(demand[i], stock_length / lengths[i]);

        for _ in 0..max_in_bar {
            for used in (0..=capacity - item_len).rev() {
                let prev = match dp[used].clone() {
                    Some(p) => p,
                    None => continue,
                };

                let next_used = used + item_len;
                let mut next = prev;
                next.counts[i] += 1;
                next.used += lengths[i];

                let should_replace = match &dp[next_used] {
                    None => true,
                    Some(existing) => candidate_quality_key(&next, stock_length)
                        < candidate_quality_key(existing, stock_length),
                };

                if should_replace {
                    dp[next_used] = Some(next);
                }
            }
        }
    }

    let mut out = Vec::new();
    let mut seen: HashSet<Vec<u32>> = HashSet::new();

    for used in (1..=capacity).rev() {
        let cand = match dp[used].clone() {
            Some(c) => c,
            None => continue,
        };

        if seen.insert(cand.counts.clone()) {
            out.push(cand);
        }

        if out.len() >= limit {
            break;
        }
    }

    out
}

fn candidate_quality_key(c: &Candidate, stock_length: u32) -> (u32, std::cmp::Reverse<usize>, std::cmp::Reverse<u32>) {
    (
        stock_length - c.used,
        std::cmp::Reverse(c.counts.iter().filter(|&&x| x > 0).count()),
        std::cmp::Reverse(c.used),
    )
}

fn prune_and_sort_candidates(
    candidates: &mut Vec<Candidate>,
    lengths: &[u32],
    demand: &[u32],
    stock_length: u32,
) {
    let min_used = stock_length.saturating_mul(MIN_FILL_PERCENT_TO_KEEP) / 100;

    let active_count = demand.iter().filter(|&&q| q > 0).count();

    candidates.retain(|c| {
        if c.used == 0 || c.used > stock_length {
            return false;
        }

        let is_single_active = c.counts.iter().filter(|&&x| x > 0).count() == 1;
        let is_small_but_needed = active_count <= 2 && is_single_active;

        c.used >= min_used || is_small_but_needed
    });

    candidates.sort_by_key(|c| {
        let total_piece_count: u32 = c.counts.iter().sum();
        let kind_count = c.counts.iter().filter(|&&x| x > 0).count();

        (
            stock_length - c.used,
            std::cmp::Reverse(kind_count),
            std::cmp::Reverse(total_piece_count),
            std::cmp::Reverse(c.used),
        )
    });

    // Do not aggressively remove smaller patterns; they are often needed for remainders.
    let _ = lengths;

    if candidates.len() > MAX_CANDIDATES {
        candidates.truncate(MAX_CANDIDATES);
    }
}

fn quantity_beam_search(
    lengths: &[u32],
    demand: &[u32],
    stock_length: u32,
    candidates: &[Candidate],
) -> State {
    let greedy = greedy_quantity_solution(lengths, demand, stock_length, candidates);
    let mut best = greedy.clone();
    let mut beam = vec![State {
        remaining: demand.to_vec(),
        selected: vec![],
        stock_qty: 0,
    }];

    for cand in candidates {
        let mut next_states = beam.clone();

        for state in &beam {
            let max_repeat = max_pattern_repeat(cand, &state.remaining);

            for q in quantity_options(max_repeat) {
                if q == 0 {
                    continue;
                }

                let mut remaining = state.remaining.clone();

                for i in 0..remaining.len() {
                    remaining[i] -= cand.counts[i] * q;
                }

                if state.selected.len() >= MAX_PRIMARY_PATTERNS
                    && !state.selected.iter().any(|(c, _)| c.counts == cand.counts)
                {
                    continue;
                }

                let mut selected = state.selected.clone();
                add_or_merge_pattern(&mut selected, cand.clone(), q);

                let new_state = State {
                    remaining,
                    selected,
                    stock_qty: state.stock_qty + q,
                };

                if final_objective_score(&new_state, lengths, stock_length)
                    < final_objective_score(&best, lengths, stock_length)
                {
                    best = new_state.clone();
                }

                next_states.push(new_state);
            }
        }

        dedup_states_by_remaining(&mut next_states, lengths, stock_length);
        next_states.sort_by_key(|s| search_score(s, lengths, stock_length));
        next_states.truncate(QUANTITY_BEAM_WIDTH);
        beam = next_states;

        for s in &beam {
            if final_objective_score(s, lengths, stock_length)
                < final_objective_score(&best, lengths, stock_length)
            {
                best = s.clone();
            }
        }

        if is_done(&best.remaining) && best.selected.len() <= MAX_PRIMARY_PATTERNS {
            // Continue a little would sometimes reduce waste, but for speed this is good enough.
            // The final local improvement still gets a chance below.
        }
    }

    // Prefer compact pattern count if material score is equal.
    for s in beam {
        let s_score = final_objective_score(&s, lengths, stock_length);
        let b_score = final_objective_score(&best, lengths, stock_length);

        if s_score < b_score
            || (s_score == b_score && s.selected.len() < best.selected.len())
        {
            best = s;
        }
    }

    best
}

fn quantity_options(max_repeat: u32) -> Vec<u32> {
    if max_repeat == 0 {
        return vec![];
    }

    let mut values = vec![max_repeat, 1];

    if max_repeat > 1 {
        values.push(max_repeat - 1);
        values.push((max_repeat + 1) / 2);
    }

    if max_repeat > 3 {
        values.push(max_repeat / 3);
        values.push((max_repeat * 2) / 3);
    }

    if max_repeat <= 8 {
        for q in 2..=max_repeat {
            values.push(q);
        }
    }

    values.retain(|&q| q > 0 && q <= max_repeat);
    values.sort_by_key(|&q| std::cmp::Reverse(q));
    values.dedup();
    values
}

fn greedy_quantity_solution(
    lengths: &[u32],
    demand: &[u32],
    stock_length: u32,
    candidates: &[Candidate],
) -> State {
    let mut remaining = demand.to_vec();
    let mut selected: Vec<(Candidate, u32)> = Vec::new();
    let mut stock_qty = 0;

    for cand in candidates {
        let q = max_pattern_repeat(cand, &remaining);

        if q == 0 {
            continue;
        }

        for i in 0..remaining.len() {
            remaining[i] -= cand.counts[i] * q;
        }

        add_or_merge_pattern(&mut selected, cand.clone(), q);
        stock_qty += q;

        if is_done(&remaining) || selected.len() >= MAX_PRIMARY_PATTERNS {
            break;
        }
    }

    let state = State {
        remaining,
        selected,
        stock_qty,
    };

    // Ensure greedy starts with a usable bound even when candidate pool is weak.
    if final_objective_score(&state, lengths, stock_length) < i64::MAX {
        state
    } else {
        State {
            remaining: demand.to_vec(),
            selected: vec![],
            stock_qty: 0,
        }
    }
}

fn local_improve_with_fallback(
    lengths: &[u32],
    stock_length: u32,
    mut best: State,
    candidates: &[Candidate],
) -> State {
    let mut improved = true;

    while improved {
        improved = false;

        // Try adding one high-quality candidate if it reduces estimated final cost.
        for cand in candidates.iter().take(120) {
            if best.selected.len() >= MAX_PRIMARY_PATTERNS
                && !best.selected.iter().any(|(c, _)| c.counts == cand.counts)
            {
                continue;
            }

            let max_repeat = max_pattern_repeat(cand, &best.remaining);

            for q in quantity_options(max_repeat).into_iter().take(4) {
                let mut remaining = best.remaining.clone();

                for i in 0..remaining.len() {
                    remaining[i] -= cand.counts[i] * q;
                }

                let mut selected = best.selected.clone();
                add_or_merge_pattern(&mut selected, cand.clone(), q);

                let trial = State {
                    remaining,
                    selected,
                    stock_qty: best.stock_qty + q,
                };

                if final_objective_score(&trial, lengths, stock_length)
                    < final_objective_score(&best, lengths, stock_length)
                {
                    best = trial;
                    improved = true;
                    break;
                }
            }

            if improved {
                break;
            }
        }
    }

    best
}

fn dedup_states_by_remaining(states: &mut Vec<State>, lengths: &[u32], stock_length: u32) {
    let mut best_by_remaining: HashMap<Vec<u32>, State> = HashMap::new();

    for state in states.drain(..) {
        let key = state.remaining.clone();
        let replace = match best_by_remaining.get(&key) {
            None => true,
            Some(existing) => search_score(&state, lengths, stock_length)
                < search_score(existing, lengths, stock_length),
        };

        if replace {
            best_by_remaining.insert(key, state);
        }
    }

    *states = best_by_remaining.into_values().collect();
}

fn search_score(state: &State, lengths: &[u32], stock_length: u32) -> i64 {
    let secondary_bars = estimate_secondary_bars_fast(lengths, &state.remaining, stock_length);
    let total_bars = state.stock_qty + secondary_bars;
    let rem_len = remaining_length(lengths, &state.remaining);
    let secondary_waste = (secondary_bars * stock_length).saturating_sub(rem_len);
    let total_waste = selected_waste(state, stock_length) + secondary_waste;
    let pattern_penalty = state.selected.len() as i64 * 100_000;

    total_bars as i64 * 1_000_000_000
        + secondary_bars as i64 * 80_000_000
        + total_waste as i64 * 10_000
        + pattern_penalty
        + rem_len as i64
}

fn final_objective_score(state: &State, lengths: &[u32], stock_length: u32) -> i64 {
    let secondary_bars = estimate_secondary_bars_bfd(lengths, &state.remaining, stock_length);
    let total_bars = state.stock_qty + secondary_bars;
    let rem_len = remaining_length(lengths, &state.remaining);
    let secondary_waste = (secondary_bars * stock_length).saturating_sub(rem_len);
    let total_waste = selected_waste(state, stock_length) + secondary_waste;
    let pattern_count = state.selected.len() as i64;

    total_bars as i64 * 1_000_000_000
        + secondary_bars as i64 * 100_000_000
        + total_waste as i64 * 10_000
        + pattern_count * 100
}

fn estimate_secondary_bars_fast(lengths: &[u32], remaining: &[u32], stock_length: u32) -> u32 {
    let total = remaining_length(lengths, remaining);

    if total == 0 {
        0
    } else {
        (total + stock_length - 1) / stock_length
    }
}

fn estimate_secondary_bars_bfd(lengths: &[u32], remaining: &[u32], stock_length: u32) -> u32 {
    if remaining.iter().all(|&q| q == 0) {
        0
    } else {
        best_fit_decreasing_fallback(lengths, remaining, stock_length).len() as u32
    }
}

fn best_fit_decreasing_fallback(
    lengths: &[u32],
    remaining: &[u32],
    stock_length: u32,
) -> Vec<Candidate> {
    let mut cuts = Vec::new();

    for (i, &qty) in remaining.iter().enumerate() {
        for _ in 0..qty {
            cuts.push(i);
        }
    }

    cuts.sort_by_key(|&i| std::cmp::Reverse(lengths[i]));

    let mut bars: Vec<Candidate> = Vec::new();

    for item_index in cuts {
        let len = lengths[item_index];
        let mut best_index: Option<usize> = None;
        let mut best_remaining = u32::MAX;

        for (bar_index, bar) in bars.iter().enumerate() {
            if bar.used + len <= stock_length {
                let rem = stock_length - (bar.used + len);

                if rem < best_remaining {
                    best_remaining = rem;
                    best_index = Some(bar_index);
                }
            }
        }

        match best_index {
            Some(bar_index) => {
                bars[bar_index].counts[item_index] += 1;
                bars[bar_index].used += len;
            }
            None => {
                let mut counts = vec![0; lengths.len()];
                counts[item_index] = 1;
                bars.push(Candidate { counts, used: len });
            }
        }
    }

    bars
}

fn max_pattern_repeat(candidate: &Candidate, remaining: &[u32]) -> u32 {
    let mut max_repeat = u32::MAX;

    for i in 0..remaining.len() {
        let c = candidate.counts[i];

        if c > 0 {
            max_repeat = max_repeat.min(remaining[i] / c);
        }
    }

    if max_repeat == u32::MAX {
        0
    } else {
        max_repeat
    }
}

fn push_candidate(
    seen: &mut HashSet<Vec<u32>>,
    candidates: &mut Vec<Candidate>,
    candidate: Candidate,
) {
    if candidate.used == 0 {
        return;
    }

    if seen.insert(candidate.counts.clone()) {
        candidates.push(candidate);
    }
}

fn add_or_merge_pattern(selected: &mut Vec<(Candidate, u32)>, candidate: Candidate, qty: u32) {
    if qty == 0 {
        return;
    }

    for (existing, existing_qty) in selected.iter_mut() {
        if existing.counts == candidate.counts {
            *existing_qty += qty;
            return;
        }
    }

    selected.push((candidate, qty));
}

fn remaining_length(lengths: &[u32], remaining: &[u32]) -> u32 {
    lengths
        .iter()
        .zip(remaining.iter())
        .map(|(l, q)| l * q)
        .sum()
}

fn selected_used_length(state: &State) -> u32 {
    state.selected.iter().map(|(p, q)| p.used * q).sum()
}

fn selected_waste(state: &State, stock_length: u32) -> u32 {
    let selected_used = selected_used_length(state);
    let selected_stock = state.stock_qty * stock_length;
    selected_stock.saturating_sub(selected_used)
}

fn build_result(
    primary_state: State,
    fallback_bars: Vec<Candidate>,
    items: &[Item],
    stock_length: u32,
    total_required: u32,
    used_fallback: bool,
) -> CuttingResult {
    let mut map: HashMap<(Vec<u32>, bool), Pattern> = HashMap::new();

    for (candidate, qty) in primary_state.selected {
        insert_pattern(&mut map, candidate, qty, items, stock_length, false);
    }

    for candidate in fallback_bars {
        insert_pattern(&mut map, candidate, 1, items, stock_length, true);
    }

    let mut patterns: Vec<Pattern> = map.into_values().collect();

    patterns.sort_by_key(|p| {
        (
            p.is_fallback,
            std::cmp::Reverse(p.qty),
            p.waste,
            std::cmp::Reverse(p.used_length),
        )
    });

    let stock_qty: u32 = patterns.iter().map(|p| p.qty).sum();
    let total_stock = stock_qty * stock_length;
    let total_waste = total_stock.saturating_sub(total_required);

    let percentage_wasted = if total_stock == 0 {
        0.0
    } else {
        total_waste as f64 / total_stock as f64 * 100.0
    };

    CuttingResult {
        patterns,
        stock_qty,
        percentage_wasted,
        used_fallback,
    }
}

fn insert_pattern(
    map: &mut HashMap<(Vec<u32>, bool), Pattern>,
    candidate: Candidate,
    qty: u32,
    items: &[Item],
    stock_length: u32,
    is_fallback: bool,
) {
    map.entry((candidate.counts.clone(), is_fallback))
        .and_modify(|p| {
            p.qty += qty;
        })
        .or_insert_with(|| {
            let mut cuts = Vec::new();
            let mut sorted_indices: Vec<usize> = (0..items.len()).collect();
            sorted_indices.sort_by_key(|&i| std::cmp::Reverse(items[i].length));

            for i in sorted_indices {
                let count = candidate.counts[i];

                for _ in 0..count {
                    cuts.push(format!("{} ({})", items[i].label, items[i].length));
                }
            }

            Pattern {
                cuts,
                qty,
                used_length: candidate.used,
                waste: stock_length - candidate.used,
                is_fallback,
            }
        });
}

fn is_done(remaining: &[u32]) -> bool {
    remaining.iter().all(|&x| x == 0)
}

fn validate(items: &[Item], stock_length: u32, bundle_size: u32) -> Result<(), String> {
    if stock_length == 0 {
        return Err("stock_length must be greater than 0".to_string());
    }

    if bundle_size == 0 {
        return Err("bundle_size must be greater than 0".to_string());
    }

    for item in items {
        if item.length == 0 {
            return Err(format!("Item '{}' has zero length", item.label));
        }

        if item.length > stock_length {
            return Err(format!(
                "Item '{}' length {} is longer than stock length {}",
                item.label, item.length, stock_length
            ));
        }
    }

    Ok(())
}

struct Lcg {
    state: u64,
}

impl Lcg {
    fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    fn next_u32(&mut self) -> u32 {
        self.state = self
            .state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1);

        (self.state >> 32) as u32
    }

    fn next_usize(&mut self, max: usize) -> usize {
        if max == 0 {
            0
        } else {
            self.next_u32() as usize % max
        }
    }
}
