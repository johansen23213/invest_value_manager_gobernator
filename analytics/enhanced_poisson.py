#!/usr/bin/env python3
"""
Enhanced Poisson Dixon-Coles model.

Improvements over the base model in laliga_stats.py:
1. Exponential recency weighting (recent matches count more)
2. Separate home/away attack and defense strengths
3. Motivation adjustment factor
4. Configurable rho (with grid search option)
"""

import math
from collections import defaultdict
from typing import Any


def _poisson_prob(lam: float, k: int) -> float:
    return (lam ** k) * math.exp(-lam) / math.factorial(k)


def compute_enhanced_poisson(
    home_id: int,
    away_id: int,
    matches: list[dict[str, Any]],
    decay_rate: float = 0.05,
    rho: float = -0.10,
    home_motivation: float = 1.0,
    away_motivation: float = 1.0,
    max_goals: int = 7,
) -> dict[str, Any]:
    """
    Enhanced Poisson Dixon-Coles with recency weighting.

    matches: list of finished matches with keys:
      home_id, away_id, home_goals, away_goals, match_index (0=most recent)

    decay_rate: exponential decay. 0.05 means match N weighs e^(-0.05*N).
      With decay=0.05, match 20 games ago weighs ~37% of most recent.

    home/away_motivation: multiplier (0.9 = complacent, 1.1 = desperate)
    """
    if not matches:
        return {"error": "No match data"}

    # Separate home/away goal records with recency weights
    home_attack_w = []  # (goals_scored_at_home, weight)
    home_defense_w = []  # (goals_conceded_at_home, weight)
    away_attack_w = []
    away_defense_w = []

    league_home_goals_w = []
    league_away_goals_w = []

    for i, m in enumerate(matches):
        weight = math.exp(-decay_rate * i)
        hid = m.get("home_id")
        aid = m.get("away_id")
        hg = m.get("home_goals")
        ag = m.get("away_goals")

        if hg is None or ag is None:
            continue

        league_home_goals_w.append((hg, weight))
        league_away_goals_w.append((ag, weight))

        if hid == home_id:
            home_attack_w.append((hg, weight))
            home_defense_w.append((ag, weight))
        if aid == home_id:
            # home_id playing away
            away_attack_w.append((ag, weight))
            away_defense_w.append((hg, weight))
        if hid == away_id:
            home_attack_w.append((hg, weight))
            home_defense_w.append((ag, weight))
        if aid == away_id:
            away_attack_w.append((ag, weight))
            away_defense_w.append((hg, weight))

    def _weighted_avg(data: list[tuple[float, float]]) -> float:
        if not data:
            return 1.0
        total_w = sum(w for _, w in data)
        if total_w == 0:
            return 1.0
        return sum(v * w for v, w in data) / total_w

    avg_home_league = _weighted_avg(league_home_goals_w)
    avg_away_league = _weighted_avg(league_away_goals_w)

    if avg_home_league == 0:
        avg_home_league = 1.3
    if avg_away_league == 0:
        avg_away_league = 1.1

    # Team-specific weighted averages
    home_team_attack_home = _weighted_avg([(g, w) for g, w in home_attack_w]) if home_attack_w else avg_home_league
    home_team_defense_home = _weighted_avg([(g, w) for g, w in home_defense_w]) if home_defense_w else avg_away_league

    away_team_attack_away = _weighted_avg([(g, w) for g, w in away_attack_w]) if away_attack_w else avg_away_league
    away_team_defense_away = _weighted_avg([(g, w) for g, w in away_defense_w]) if away_defense_w else avg_home_league

    # Strength indices relative to league average
    attack_strength_home = home_team_attack_home / avg_home_league
    defense_strength_home = home_team_defense_home / avg_away_league
    attack_strength_away = away_team_attack_away / avg_away_league
    defense_strength_away = away_team_defense_away / avg_home_league

    # Expected goals with motivation adjustment
    lambda_home = attack_strength_home * defense_strength_away * avg_home_league * home_motivation
    lambda_away = attack_strength_away * defense_strength_home * avg_away_league * away_motivation

    lambda_home = max(0.1, lambda_home)
    lambda_away = max(0.1, lambda_away)

    # Score matrix with Dixon-Coles correction
    p1 = 0.0
    px = 0.0
    p2 = 0.0

    for i in range(max_goals):
        for j in range(max_goals):
            p_ij = _poisson_prob(lambda_home, i) * _poisson_prob(lambda_away, j)

            if i <= 1 and j <= 1:
                if i == 0 and j == 0:
                    p_ij *= max(0, 1 + lambda_home * lambda_away * rho)
                elif i == 1 and j == 0:
                    p_ij *= max(0, 1 - lambda_away * rho)
                elif i == 0 and j == 1:
                    p_ij *= max(0, 1 - lambda_home * rho)
                elif i == 1 and j == 1:
                    p_ij *= max(0, 1 - rho)

            if i > j:
                p1 += p_ij
            elif i == j:
                px += p_ij
            else:
                p2 += p_ij

    total = p1 + px + p2
    if total > 0:
        p1, px, p2 = p1 / total, px / total, p2 / total

    return {
        "p1": round(p1, 4),
        "px": round(px, 4),
        "p2": round(p2, 4),
        "lambda_home": round(lambda_home, 3),
        "lambda_away": round(lambda_away, 3),
        "attack_home": round(attack_strength_home, 3),
        "defense_home": round(defense_strength_home, 3),
        "attack_away": round(attack_strength_away, 3),
        "defense_away": round(defense_strength_away, 3),
        "avg_home_league": round(avg_home_league, 3),
        "avg_away_league": round(avg_away_league, 3),
        "decay_rate": decay_rate,
        "rho": rho,
        "home_motivation": home_motivation,
        "away_motivation": away_motivation,
        "matches_used": len(matches),
    }


def grid_search_rho(
    matches: list[dict],
    test_matches: list[dict],
    rho_range: tuple[float, float, float] = (-0.20, 0.05, 0.01),
) -> dict[str, Any]:
    """
    Find optimal rho by testing different values against known results.

    test_matches: [{home_id, away_id, home_goals, away_goals, result: "1"/"X"/"2"}, ...]
    """
    best_rho = -0.10
    best_brier = float("inf")
    results_log = []

    rho_start, rho_end, rho_step = rho_range
    rho = rho_start
    while rho <= rho_end:
        brier_total = 0.0
        count = 0

        for tm in test_matches:
            pred = compute_enhanced_poisson(
                tm["home_id"], tm["away_id"], matches, rho=rho
            )
            if "error" in pred:
                continue

            actual = tm["result"].upper()
            o1 = 1.0 if actual == "1" else 0.0
            ox = 1.0 if actual == "X" else 0.0
            o2 = 1.0 if actual == "2" else 0.0

            brier_total += (pred["p1"] - o1) ** 2 + (pred["px"] - ox) ** 2 + (pred["p2"] - o2) ** 2
            count += 1

        if count > 0:
            avg_brier = brier_total / count
            results_log.append({"rho": round(rho, 3), "brier": round(avg_brier, 4)})
            if avg_brier < best_brier:
                best_brier = avg_brier
                best_rho = rho

        rho += rho_step

    return {
        "best_rho": round(best_rho, 3),
        "best_brier": round(best_brier, 4),
        "tested": len(results_log),
        "results": results_log,
    }


if __name__ == "__main__":
    print("=== ENHANCED POISSON — Self-test ===\n")

    # Simulated match data (most recent first)
    sample_matches = []
    for i in range(20):
        sample_matches.append({
            "home_id": 1, "away_id": 2,
            "home_goals": 2 if i % 3 == 0 else 1,
            "away_goals": 0 if i % 4 == 0 else 1,
        })

    result = compute_enhanced_poisson(1, 2, sample_matches)
    print(f"P(1)={result['p1']*100:.1f}%  P(X)={result['px']*100:.1f}%  P(2)={result['p2']*100:.1f}%")
    print(f"λ_home={result['lambda_home']}  λ_away={result['lambda_away']}")
    print(f"Decay={result['decay_rate']}  ρ={result['rho']}")
    print(f"Matches used: {result['matches_used']}")
