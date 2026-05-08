#!/usr/bin/env python3
"""
Monte Carlo column optimizer for La Quiniela.

Given P(1X2) for 15 matches and a budget, finds the optimal
fijo/doble/triple assignment to maximize expected prize value.
"""

import math
import random
from itertools import product
from typing import Any

COLUMN_COST = 0.75
CATEGORIES = {15: "Especial", 14: "1ª", 13: "2ª", 12: "3ª", 11: "4ª", 10: "5ª"}
TYPICAL_PRIZES = {15: 5_000_000, 14: 50_000, 13: 3_000, 12: 300, 11: 30, 10: 6}


def simulate_quiniela(
    predictions: list[dict[str, float]],
    selections: list[list[str]],
    n_simulations: int = 10000,
    prizes: dict[int, float] | None = None,
) -> dict[str, Any]:
    if prizes is None:
        prizes = TYPICAL_PRIZES

    n_matches = len(predictions)
    n_columns = 1
    for s in selections:
        n_columns *= len(s)
    cost = n_columns * COLUMN_COST

    category_hits = {k: 0 for k in range(10, 16)}
    total_prize = 0.0

    # Pre-generate all columns if feasible
    all_columns = None
    if n_columns <= 5000:
        all_columns = list(product(*selections))

    for _ in range(n_simulations):
        actual = []
        for pred in predictions:
            r = random.random()
            if r < pred["p1"]:
                actual.append("1")
            elif r < pred["p1"] + pred["px"]:
                actual.append("X")
            else:
                actual.append("2")

        best_correct = 0
        if all_columns:
            for col in all_columns:
                correct = sum(1 for c, a in zip(col, actual) if c == a)
                if correct > best_correct:
                    best_correct = correct
        else:
            for _ in range(min(1000, n_columns)):
                col = [random.choice(s) for s in selections]
                correct = sum(1 for c, a in zip(col, actual) if c == a)
                if correct > best_correct:
                    best_correct = correct

        if best_correct >= 10:
            category_hits[best_correct] += 1
            total_prize += prizes.get(best_correct, 0)

    avg_prize = total_prize / n_simulations
    roi = (avg_prize - cost) / cost if cost > 0 else 0

    return {
        "columns": n_columns,
        "cost": cost,
        "simulations": n_simulations,
        "expected_prize": round(avg_prize, 2),
        "roi_pct": round(roi * 100, 1),
        "category_probabilities": {
            CATEGORIES.get(k, f"{k}"): round(v / n_simulations * 100, 2)
            for k, v in sorted(category_hits.items(), reverse=True) if v > 0
        },
        "p_profit": round(
            sum(v for k, v in category_hits.items() if prizes.get(k, 0) > cost) / n_simulations * 100, 1
        ),
        "p_any_prize": round(sum(category_hits.values()) / n_simulations * 100, 1),
    }


def _second_favorite(pred: dict[str, float]) -> str:
    sorted_outcomes = sorted(
        [("1", pred["p1"]), ("X", pred["px"]), ("2", pred["p2"])],
        key=lambda x: -x[1],
    )
    return sorted_outcomes[1][0]


def optimize_budget(
    predictions: list[dict[str, float]],
    budget: float = 200.0,
    n_simulations: int = 5000,
    prizes: dict[int, float] | None = None,
) -> dict[str, Any]:
    if prizes is None:
        prizes = TYPICAL_PRIZES

    n_matches = len(predictions)
    max_columns = int(budget / COLUMN_COST)

    ranked = []
    for i, pred in enumerate(predictions):
        max_prob = max(pred["p1"], pred["px"], pred["p2"])
        favorite = "1" if pred["p1"] == max_prob else ("X" if pred["px"] == max_prob else "2")
        ranked.append({"idx": i, "max_prob": max_prob, "favorite": favorite, "second": _second_favorite(pred), "pred": pred})

    ranked.sort(key=lambda x: -x["max_prob"])

    selections = [None] * n_matches
    columns = 1

    for r in ranked:
        selections[r["idx"]] = [r["favorite"]]

    for r in reversed(ranked):
        if selections[r["idx"]] and len(selections[r["idx"]]) == 1:
            test_cols = columns * 2
            if test_cols <= max_columns:
                selections[r["idx"]] = [r["favorite"], r["second"]]
                columns = test_cols

    for r in reversed(ranked):
        if selections[r["idx"]] and len(selections[r["idx"]]) == 2:
            test_cols = columns // 2 * 3
            if test_cols <= max_columns:
                selections[r["idx"]] = ["1", "X", "2"]
                columns = test_cols

    for i in range(n_matches):
        if selections[i] is None:
            max_p = max(predictions[i]["p1"], predictions[i]["px"], predictions[i]["p2"])
            fav = "1" if predictions[i]["p1"] == max_p else ("X" if predictions[i]["px"] == max_p else "2")
            selections[i] = [fav]

    actual_columns = 1
    for s in selections:
        actual_columns *= len(s)

    fijos = sum(1 for s in selections if len(s) == 1)
    dobles = sum(1 for s in selections if len(s) == 2)
    triples = sum(1 for s in selections if len(s) == 3)

    sim = simulate_quiniela(predictions, selections, n_simulations, prizes)

    return {
        "budget": budget,
        "selections": selections,
        "fijos": fijos,
        "dobles": dobles,
        "triples": triples,
        "columns": actual_columns,
        "cost": round(actual_columns * COLUMN_COST, 2),
        "simulation": sim,
    }


if __name__ == "__main__":
    print("=== MONTE CARLO OPTIMIZER — Demo ===\n")

    sample = [
        {"p1": 0.457, "px": 0.397, "p2": 0.145},
        {"p1": 0.170, "px": 0.438, "p2": 0.392},
        {"p1": 0.544, "px": 0.213, "p2": 0.243},
        {"p1": 0.386, "px": 0.250, "p2": 0.364},
        {"p1": 0.171, "px": 0.251, "p2": 0.578},
        {"p1": 0.560, "px": 0.252, "p2": 0.187},
        {"p1": 0.090, "px": 0.304, "p2": 0.607},
        {"p1": 0.541, "px": 0.195, "p2": 0.264},
        {"p1": 0.113, "px": 0.369, "p2": 0.518},
        {"p1": 0.558, "px": 0.308, "p2": 0.134},
    ]

    result = optimize_budget(sample, budget=200.0, n_simulations=10000)
    print(f"Strategy: {result['fijos']}F {result['dobles']}D {result['triples']}T")
    print(f"Columns: {result['columns']}  |  Cost: {result['cost']}€")
    print(f"Expected prize: {result['simulation']['expected_prize']}€")
    print(f"ROI: {result['simulation']['roi_pct']}%")
    print(f"P(any prize): {result['simulation']['p_any_prize']}%")
    cats = result['simulation']['category_probabilities']
    if cats:
        print(f"Categories: {cats}")
