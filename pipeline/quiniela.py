#!/usr/bin/env python3
"""
Quiniela pipeline — orchestrates the full prediction workflow.

Flow:
1. Load verified data (LaLiga + Segunda)
2. Run Poisson Dixon-Coles for each match
3. Run surprise detector for each match
4. Apply CIO adjustments
5. Output: P(1X2) per match, confidence, columns

La Quiniela española:
- 15 partidos (typically 10 Primera + 5 Segunda, varies)
- 3 options per match: 1, X, 2
- All 15 must be correct for jackpot (cat. especial)
- Categories: especial (15), 1ª (14), 2ª (13), 3ª (12), 4ª (11), 5ª (10)

Column cost: 0.75€ per column
Total combinations: 3^15 = 14,348,907
"""

import json
import math
from datetime import datetime
from pathlib import Path
from typing import Any

sys_path = Path(__file__).parent.parent
STATE_DIR = sys_path / "state" / "data"

# Import our analytics
import sys
sys.path.insert(0, str(sys_path))
from analytics.calibration import brier_score
from analytics.surprise_detector import analyze_match_surprise
from analytics.enhanced_poisson import compute_enhanced_poisson


def load_standings(league: str = "laliga") -> dict[str, Any]:
    """Load the most recent verified standings file."""
    pattern = f"{league}_j*_*.json"
    files = sorted(STATE_DIR.glob(pattern), reverse=True)
    if not files:
        raise FileNotFoundError(f"No standings file found matching {pattern}")
    with open(files[0]) as f:
        return json.load(f)


def compute_match_prediction(
    home_team: str,
    away_team: str,
    home_pos: int,
    away_pos: int,
    home_pts: int,
    away_pts: int,
    home_form: list[str] | None = None,
    away_form: list[str] | None = None,
    surprise_factors: dict | None = None,
) -> dict[str, Any]:
    """Compute full prediction for one match."""
    # Base Poisson estimate from position/points
    # Simple model: lambda = avg_league * (attack_strength / defense_strength)
    # Using position as proxy when full data unavailable
    total_teams = 20
    home_strength = (total_teams - home_pos + 1) / (total_teams / 2)
    away_strength = (total_teams - away_pos + 1) / (total_teams / 2)

    lambda_home = 1.35 * home_strength * 0.9  # Home advantage
    lambda_away = 1.10 * away_strength * 0.8

    lambda_home = max(0.3, min(3.0, lambda_home))
    lambda_away = max(0.2, min(2.5, lambda_away))

    # Poisson probabilities
    max_goals = 7
    p1 = px = p2 = 0.0
    for i in range(max_goals):
        for j in range(max_goals):
            pi = (lambda_home ** i) * math.exp(-lambda_home) / math.factorial(i)
            pj = (lambda_away ** j) * math.exp(-lambda_away) / math.factorial(j)
            p_ij = pi * pj
            if i > j:
                p1 += p_ij
            elif i == j:
                px += p_ij
            else:
                p2 += p_ij

    total = p1 + px + p2
    p1, px, p2 = p1 / total, px / total, p2 / total

    # Surprise adjustment
    surprise = None
    if surprise_factors:
        surprise = surprise_factors
        if surprise["surprise_risk"] > 60:
            # Boost away probability
            boost = (surprise["surprise_risk"] - 60) / 200
            p2 = min(0.45, p2 + boost)
            p1 = max(0.15, p1 - boost * 0.6)
            px = 1.0 - p1 - p2

    # Determine recommended bet
    probs = {"1": p1, "X": px, "2": p2}
    favorite = max(probs, key=probs.get)
    confidence = probs[favorite]

    return {
        "match": f"{home_team} vs {away_team}",
        "home_team": home_team,
        "away_team": away_team,
        "p1": round(p1, 4),
        "px": round(px, 4),
        "p2": round(p2, 4),
        "lambda_home": round(lambda_home, 3),
        "lambda_away": round(lambda_away, 3),
        "favorite": favorite,
        "confidence": round(confidence, 4),
        "surprise_risk": surprise["surprise_risk"] if surprise else None,
        "quiniela_recommendation": _quiniela_rec(favorite, confidence, surprise),
    }


def _quiniela_rec(favorite: str, confidence: float, surprise: dict | None) -> str:
    """Recommend FIJO / DOBLE / TRIPLE for quiniela column strategy."""
    risk = surprise["surprise_risk"] if surprise else 0

    if confidence >= 0.55 and risk < 40:
        return f"FIJO {favorite}"
    elif confidence >= 0.45 and risk < 60:
        # Doble: favorite + second most likely
        return f"DOBLE (incluye {favorite})"
    else:
        return "TRIPLE (cubrir los 3)"


def generate_quiniela_predictions(
    fixtures: list[dict[str, Any]],
) -> dict[str, Any]:
    """Generate predictions for a full quiniela (15 matches)."""
    predictions = []
    fijos = 0
    dobles = 0
    triples = 0

    for f in fixtures:
        surprise = analyze_match_surprise(
            home_team=f["home"],
            away_team=f["away"],
            home_pos=f.get("home_pos", 10),
            away_pos=f.get("away_pos", 10),
            home_pts=f.get("home_pts", 40),
            away_pts=f.get("away_pts", 40),
            home_form=f.get("home_form"),
            away_form=f.get("away_form"),
        )

        pred = compute_match_prediction(
            home_team=f["home"],
            away_team=f["away"],
            home_pos=f.get("home_pos", 10),
            away_pos=f.get("away_pos", 10),
            home_pts=f.get("home_pts", 40),
            away_pts=f.get("away_pts", 40),
            home_form=f.get("home_form"),
            away_form=f.get("away_form"),
            surprise_factors=surprise,
        )

        predictions.append(pred)

        rec = pred["quiniela_recommendation"]
        if "FIJO" in rec:
            fijos += 1
        elif "DOBLE" in rec:
            dobles += 1
        else:
            triples += 1

    columns = 1 * (2 ** dobles) * (3 ** triples)
    cost = columns * 0.75

    return {
        "date": datetime.now().isoformat(),
        "matches": len(predictions),
        "predictions": predictions,
        "column_strategy": {
            "fijos": fijos,
            "dobles": dobles,
            "triples": triples,
            "total_columns": columns,
            "cost_euros": cost,
        },
        "notes": [
            f"{'⚠️ PRESUPUESTO ALTO' if cost > 200 else '✅ Presupuesto controlado'}: {cost}€",
            f"Máx categoría alcanzable con {fijos} fijos: {'especial' if fijos >= 10 else 'difícil'}",
        ],
    }


def print_quiniela_report(result: dict[str, Any]) -> None:
    """Pretty-print a quiniela prediction report."""
    print(f"\n{'=' * 75}")
    print(f"  QUINIELA — PREDICCIONES")
    print(f"{'=' * 75}")

    preds = result["predictions"]
    print(f"\n  {'#':>3} {'Partido':<40} {'1':>6} {'X':>6} {'2':>6} {'Riesgo':>7} {'Rec':<15}")
    print(f"  {'-' * 82}")

    for i, p in enumerate(preds, 1):
        match_str = p["match"][:39]
        risk = f"{p['surprise_risk']:.0f}" if p["surprise_risk"] else "—"
        rec = p["quiniela_recommendation"]
        print(f"  P{i:>2} {match_str:<40} {p['p1']*100:>5.1f}% {p['px']*100:>5.1f}% {p['p2']*100:>5.1f}% {risk:>6} {rec}")

    strat = result["column_strategy"]
    print(f"\n  {'─' * 75}")
    print(f"  ESTRATEGIA DE COLUMNAS")
    print(f"  Fijos: {strat['fijos']}  |  Dobles: {strat['dobles']}  |  Triples: {strat['triples']}")
    print(f"  Columnas: {strat['total_columns']}  |  Coste: {strat['cost_euros']:.2f}€")

    for note in result.get("notes", []):
        print(f"  {note}")


if __name__ == "__main__":
    # Demo with J35 LaLiga fixtures
    sample_fixtures = [
        {"home": "Elche", "away": "Alavés", "home_pos": 14, "away_pos": 17, "home_pts": 38, "away_pts": 36},
        {"home": "Sevilla", "away": "Espanyol", "home_pos": 18, "away_pos": 13, "home_pts": 34, "away_pts": 39},
        {"home": "Atlético Madrid", "away": "Celta", "home_pos": 4, "away_pos": 6, "home_pts": 63, "away_pts": 47},
        {"home": "Real Sociedad", "away": "Real Betis", "home_pos": 9, "away_pos": 5, "home_pts": 43, "away_pts": 53},
        {"home": "Mallorca", "away": "Villarreal", "home_pos": 15, "away_pos": 3, "home_pts": 38, "away_pts": 68},
        {"home": "Athletic Club", "away": "Valencia", "home_pos": 8, "away_pos": 12, "home_pts": 44, "away_pts": 39},
        {"home": "Real Oviedo", "away": "Getafe", "home_pos": 20, "away_pos": 7, "home_pts": 28, "away_pts": 44},
        {"home": "Barcelona", "away": "Real Madrid", "home_pos": 1, "away_pos": 2, "home_pts": 88, "away_pts": 77},
        {"home": "Levante", "away": "Osasuna", "home_pos": 19, "away_pos": 10, "home_pts": 33, "away_pts": 42},
        {"home": "Rayo Vallecano", "away": "Girona", "home_pos": 11, "away_pos": 16, "home_pts": 42, "away_pts": 38},
    ]

    result = generate_quiniela_predictions(sample_fixtures)
    print_quiniela_report(result)
