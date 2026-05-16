use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use wasm_bindgen::prelude::*;

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
    max_primary_patterns: usize,
    bundle_size: u32,
) -> Result<JsValue, JsValue> {
    let items: Vec<Item> = serde_wasm_bindgen::from_value(items)
        .map_err(|e| JsValue::from_str(&format!("Invalid items input: {}", e)))?;

    let result = compute_with_fallback(&items, stock_length, max_primary_patterns, bundle_size)
        .map_err(|e| JsValue::from_str(&e))?;

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {}", e)))
}

/// Computes a steel cutting plan.
///
/// Main behavior:
/// - Primary phase uses up to `max_primary_patterns`.
/// - Primary pattern quantities are aligned to `bundle_size`.
/// - Pattern generation prioritizes largest-to-shortest greedy cutting.
/// - Remaining demand is completed by fallback Best-Fit Decreasing.
///
/// `bundle_size = 60` means the main repeated patterns should consume
/// quantities in multiples of 60 pieces.
/// Remainders are handled as secondary/fallback patterns.
pub fn compute_with_fallback(
    items: &[Item],
    stock_length: u32,
    max_primary_patterns: usize,
    bundle_size: u32,
) -> Result<CuttingResult, String> {
    validate(items, stock_length, bundle_size)?;

    let primary_demand: Vec<u32> = items.iter().map(|x| (x.qty / bundle_size) * bundle_size).collect();

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

    let primary_state = solve_primary_patterns(
        &lengths,
        &primary_demand,
        stock_length,
        max_primary_patterns,
        bundle_size,
    );

    let mut remaining = vec![0; items.len()];

    for i in 0..items.len() {
        let used_by_primary = primary_demand[i].saturating_sub(primary_state.remaining[i]);
        remaining[i] = items[i].qty.saturating_sub(used_by_primary);
    }

    let used_fallback = remaining.iter().any(|&x| x > 0);
    let fallback_bars = if used_fallback {
        best_fit_fallback(&lengths, &remaining, stock_length)
    } else {
        vec![]
    };

    Ok(build_result(
        primary_state,
        fallback_bars,
        items,
        stock_length,
        total_required,
        used_fallback,
    ))
}

fn solve_primary_patterns(
    lengths: &[u32],
    demand: &[u32],
    stock_length: u32,
    max_patterns: usize,
    bundle_size: u32,
) -> State {
    let mut beam = vec![State {
        remaining: demand.to_vec(),
        selected: vec![],
        stock_qty: 0,
    }];

    let mut best_state = beam[0].clone();

    let beam_width = 300;
    let candidates_per_state = 120;

    for _ in 0..max_patterns {
        let mut next_states = Vec::new();

        for state in &beam {
            if is_done(&state.remaining) {
                return state.clone();
            }

            let candidates = generate_candidates(
                lengths,
                &state.remaining,
                stock_length,
                candidates_per_state,
            );

            for cand in candidates {
                let max_repeat = max_pattern_repeat(&cand, &state.remaining);

                if max_repeat == 0 {
                    continue;
                }

                for q in trial_quantities(max_repeat, bundle_size) {
                    let mut new_remaining = state.remaining.clone();

                    for i in 0..new_remaining.len() {
                        new_remaining[i] -= cand.counts[i] * q;
                    }

                    let mut selected = state.selected.clone();
                    add_or_merge_pattern(&mut selected, cand.clone(), q);

                    next_states.push(State {
                        remaining: new_remaining,
                        selected,
                        stock_qty: state.stock_qty + q,
                    });
                }
            }
        }

        if next_states.is_empty() {
            break;
        }

        next_states.sort_by_key(|s| score_state(s, lengths, stock_length));
        next_states.truncate(beam_width);

        for s in &next_states {
            if score_partial_progress(s, lengths) < score_partial_progress(&best_state, lengths) {
                best_state = s.clone();
            }
        }

        beam = next_states;

        if let Some(done) = beam.iter().find(|s| is_done(&s.remaining)) {
            return done.clone();
        }
    }

    best_state
}

fn generate_candidates(
    lengths: &[u32],
    remaining: &[u32],
    stock_length: u32,
    limit: usize,
) -> Vec<Candidate> {
    let n = lengths.len();
    let mut set: HashSet<Vec<u32>> = HashSet::new();
    let mut candidates = Vec::new();

    let mut desc: Vec<usize> = (0..n).collect();
    desc.sort_by_key(|&i| std::cmp::Reverse(lengths[i]));

    let mut high_qty: Vec<usize> = (0..n).collect();
    high_qty.sort_by_key(|&i| std::cmp::Reverse(remaining[i]));

    let orders = vec![desc.clone(), high_qty];

    // 1. Pure largest-to-shortest greedy.
    let cand = greedy_pattern(lengths, remaining, stock_length, &desc, None);
    push_candidate(&mut set, &mut candidates, cand);

    // 2. Seed each long remaining component, then fill largest-to-shortest.
    for &seed in &desc {
        if remaining[seed] == 0 {
            continue;
        }

        let cand = greedy_pattern(lengths, remaining, stock_length, &desc, Some(seed));
        push_candidate(&mut set, &mut candidates, cand);
    }

    // 3. Other greedy order for high-demand items.
    for order in &orders {
        let cand = greedy_pattern(lengths, remaining, stock_length, order, None);
        push_candidate(&mut set, &mut candidates, cand);
    }

    // 4. Repeated single-item patterns.
    for &i in &desc {
        if remaining[i] == 0 {
            continue;
        }

        let max_count = std::cmp::min(remaining[i], stock_length / lengths[i]);

        if max_count > 0 {
            let mut counts = vec![0; n];
            counts[i] = max_count;

            push_candidate(
                &mut set,
                &mut candidates,
                Candidate {
                    counts,
                    used: max_count * lengths[i],
                },
            );
        }
    }

    // 5. Deterministic random variants, but still biased by length.
    let mut rng = Lcg::new(1234567);

    for _ in 0..200 {
        let mut order = desc.clone();

        for i in 0..n {
            let j = rng.next_usize(n);
            order.swap(i, j);
        }

        let cand = greedy_pattern(lengths, remaining, stock_length, &order, None);
        push_candidate(&mut set, &mut candidates, cand);
    }

    let longest_remaining = desc.iter().find(|&&i| remaining[i] > 0).copied();

    candidates.sort_by_key(|c| {
        let waste = stock_length - c.used;
        let uses_longest = match longest_remaining {
            Some(i) => {
                if c.counts[i] > 0 {
                    0
                } else {
                    1
                }
            }
            None => 0,
        };

        (
            uses_longest,
            waste,
            std::cmp::Reverse(c.used),
            std::cmp::Reverse(c.counts.iter().filter(|&&x| x > 0).count()),
        )
    });

    candidates.truncate(limit);
    candidates
}

fn greedy_pattern(
    lengths: &[u32],
    remaining: &[u32],
    stock_length: u32,
    order: &[usize],
    seed: Option<usize>,
) -> Candidate {
    let n = lengths.len();
    let mut counts = vec![0; n];
    let mut used = 0;

    if let Some(i) = seed {
        if remaining[i] > 0 && lengths[i] <= stock_length {
            counts[i] += 1;
            used += lengths[i];
        }
    }

    let mut changed = true;

    while changed {
        changed = false;

        for &i in order {
            if counts[i] < remaining[i] && used + lengths[i] <= stock_length {
                counts[i] += 1;
                used += lengths[i];
                changed = true;
            }
        }
    }

    Candidate { counts, used }
}

fn best_fit_fallback(lengths: &[u32], remaining: &[u32], stock_length: u32) -> Vec<Candidate> {
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

fn trial_quantities(max_repeat: u32, bundle_size: u32) -> Vec<u32> {
    let mut values = Vec::new();

    let max_bundle_repeat = max_repeat / bundle_size;

    if max_bundle_repeat > 0 {
        values.push(max_bundle_repeat * bundle_size);

        if max_bundle_repeat > 1 {
            values.push(bundle_size);
            values.push((max_bundle_repeat / 2) * bundle_size);
        }

        if max_bundle_repeat > 2 {
            values.push((max_bundle_repeat - 1) * bundle_size);
        }

        if max_bundle_repeat > 4 {
            values.push((max_bundle_repeat / 3) * bundle_size);
            values.push(((max_bundle_repeat * 2) / 3) * bundle_size);
        }
    }

    values.sort();
    values.dedup();
    values.into_iter().filter(|&x| x > 0).collect()
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
    set: &mut HashSet<Vec<u32>>,
    candidates: &mut Vec<Candidate>,
    candidate: Candidate,
) {
    if candidate.used == 0 {
        return;
    }

    if set.insert(candidate.counts.clone()) {
        candidates.push(candidate);
    }
}

fn add_or_merge_pattern(selected: &mut Vec<(Candidate, u32)>, candidate: Candidate, qty: u32) {
    for (existing, existing_qty) in selected.iter_mut() {
        if existing.counts == candidate.counts {
            *existing_qty += qty;
            return;
        }
    }

    selected.push((candidate, qty));
}

fn score_state(state: &State, lengths: &[u32], stock_length: u32) -> i64 {
    let remaining_length: u32 = lengths
        .iter()
        .zip(state.remaining.iter())
        .map(|(l, q)| l * q)
        .sum();

    let lower_bound_extra_bars = if remaining_length == 0 {
        0
    } else {
        (remaining_length + stock_length - 1) / stock_length
    };

    let selected_used: u32 = state.selected.iter().map(|(p, q)| p.used * q).sum();
    let selected_stock = state.stock_qty * stock_length;
    let selected_waste = selected_stock.saturating_sub(selected_used);

    let long_remaining_penalty: u32 = lengths
        .iter()
        .zip(state.remaining.iter())
        .map(|(l, q)| l * q)
        .sum();

    (
        state.stock_qty as i64 * 10_000
            + lower_bound_extra_bars as i64 * 10_000
            + selected_waste as i64 * 10
            + long_remaining_penalty as i64
    )
}

fn score_partial_progress(state: &State, lengths: &[u32]) -> i64 {
    let remaining_length: u32 = lengths
        .iter()
        .zip(state.remaining.iter())
        .map(|(l, q)| l * q)
        .sum();

    let remaining_items: u32 = state.remaining.iter().sum();

    (remaining_length as i64 * 100) + remaining_items as i64
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
    let total_waste = total_stock - total_required;

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

            for (i, count) in candidate.counts.iter().enumerate() {
                for _ in 0..*count {
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