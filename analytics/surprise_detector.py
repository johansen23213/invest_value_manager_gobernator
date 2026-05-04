#!/usr/bin/env python3
"""
Surprise detector — predict away upsets and draw surprises.

J60 lesson: 2 away wins destroyed all quiniela columns. This module
scores each match for upset likelihood using 6 factors.

When surprise_risk > 60: judge MUST assign >= 20% to away win
When surprise_risk > 75: CIO MUST include a column covering the upset
"""

import json
from typing import Any


def home_fragility_score(
    home_form: list[str],
    home_pts_last6: int | None = None,
) -> float:
    """
    Score 0-100 how fragile the home team is at home.
    form: list of recent home results ["W", "W", "D", "L", "W", "D"]
    """
    if not home_form:
        return 50.0

    last6 = home_form[-6:]
    losses = sum(1 for r in last6 if r.upper() in ("L", "P"))
    draws = sum(1 for r in last6 if r.upper() in ("D", "E"))
    wins = sum(1 for r in last6 if r.upper() in ("W", "V"))

    # More losses/draws = more fragile
    score = (losses * 20 + draws * 10) / max(len(last6), 1) * 10
    return min(100.0, max(0.0, score))


def away_competence_score(
    away_form: list[str],
) -> float:
    """
    Score 0-100 how competent the away team is on the road.
    form: list of recent away results ["L", "W", "D", "W", "L", "W"]
    """
    if not away_form:
        return 50.0

    last6 = away_form[-6:]
    wins = sum(1 for r in last6 if r.upper() in ("W", "V"))
    draws = sum(1 for r in last6 if r.upper() in ("D", "E"))

    score = (wins * 20 + draws * 8) / max(len(last6), 1) * 10
    return min(100.0, max(0.0, score))


def motivational_asymmetry_score(
    home_pos: int,
    home_pts: int,
    away_pos: int,
    away_pts: int,
    total_teams: int = 20,
    relegation_line: int = 18,
    promotion_line: int = 6,
) -> float:
    """
    Score 0-100 for motivational imbalance favoring the away team.

    High score when: away team is desperate (relegation/title/playoff)
    and home team is comfortable (mid-table, nothing to play for).
    """
    # Away motivation (higher = more motivated)
    away_motivation = 0
    if away_pos <= 2:
        away_motivation = 70  # Title race
    elif away_pos <= promotion_line:
        away_motivation = 80  # European/playoff zone
    elif away_pos >= relegation_line:
        away_motivation = 90  # Relegation fight = maximum desperation
    elif away_pos >= relegation_line - 3:
        away_motivation = 70  # Near relegation
    else:
        away_motivation = 40  # Mid-table comfort

    # Home motivation
    home_motivation = 0
    if home_pos <= 2:
        home_motivation = 70
    elif home_pos <= promotion_line:
        home_motivation = 65
    elif home_pos >= relegation_line:
        home_motivation = 85
    elif home_pos >= relegation_line - 3:
        home_motivation = 65
    else:
        home_motivation = 40

    # Asymmetry: away more motivated than home = surprise risk
    asymmetry = max(0, away_motivation - home_motivation)
    return min(100.0, asymmetry * 1.5)


def congestion_penalty_score(
    matches_last_7_days: int,
    had_european_match: bool = False,
) -> float:
    """
    Score 0-100 for fixture congestion of the HOME team.
    More congestion = more likely to rotate = more vulnerable.
    """
    base = 0
    if matches_last_7_days >= 3:
        base = 80
    elif matches_last_7_days >= 2:
        base = 50
    elif matches_last_7_days >= 1:
        base = 20

    if had_european_match:
        base = min(100, base + 25)

    return float(base)


def key_player_absence_score(
    missing_players: list[dict[str, Any]] | None = None,
    top_scorer_out: bool = False,
    goalkeeper_out: bool = False,
) -> float:
    """
    Score 0-100 based on key player absences for the HOME team.
    """
    if not missing_players:
        return 0.0

    score = len(missing_players) * 10
    if top_scorer_out:
        score += 30
    if goalkeeper_out:
        score += 25

    return min(100.0, float(score))


def historical_venue_score(
    home_win_pct_at_venue: float | None = None,
) -> float:
    """
    Score 0-100 based on historical home win percentage at this venue.
    Lower home win % = higher surprise risk.
    """
    if home_win_pct_at_venue is None:
        return 50.0  # Unknown = neutral

    # If home team wins < 40% at home, that's fragile
    if home_win_pct_at_venue < 0.30:
        return 90.0
    elif home_win_pct_at_venue < 0.40:
        return 70.0
    elif home_win_pct_at_venue < 0.50:
        return 50.0
    elif home_win_pct_at_venue < 0.60:
        return 30.0
    else:
        return 10.0


def compute_surprise_risk(
    home_fragility: float,
    away_competence: float,
    motivational_asymmetry: float,
    congestion_penalty: float,
    key_player_absence: float,
    historical_venue: float,
) -> dict[str, Any]:
    """
    Compute overall surprise risk score (0-100).

    Weights:
      0.25 * home_fragility
      0.20 * away_competence
      0.20 * motivational_asymmetry
      0.15 * congestion_penalty
      0.10 * key_player_absence
      0.10 * historical_venue
    """
    risk = (
        0.25 * home_fragility +
        0.20 * away_competence +
        0.20 * motivational_asymmetry +
        0.15 * congestion_penalty +
        0.10 * key_player_absence +
        0.10 * historical_venue
    )

    risk = round(min(100.0, max(0.0, risk)), 1)

    if risk > 75:
        level = "ALTO"
        action = "CIO DEBE incluir upset en al menos 1 columna"
        min_away_pct = 25
    elif risk > 60:
        level = "MEDIO-ALTO"
        action = "Juez DEBE asignar ≥20% al visitante"
        min_away_pct = 20
    elif risk > 40:
        level = "MEDIO"
        action = "Considerar cobertura del visitante"
        min_away_pct = 15
    else:
        level = "BAJO"
        action = "Resultado esperado probable"
        min_away_pct = 0

    return {
        "surprise_risk": risk,
        "level": level,
        "action": action,
        "min_away_pct": min_away_pct,
        "factors": {
            "home_fragility": round(home_fragility, 1),
            "away_competence": round(away_competence, 1),
            "motivational_asymmetry": round(motivational_asymmetry, 1),
            "congestion_penalty": round(congestion_penalty, 1),
            "key_player_absence": round(key_player_absence, 1),
            "historical_venue": round(historical_venue, 1),
        },
    }


def analyze_match_surprise(
    home_team: str,
    away_team: str,
    home_pos: int,
    away_pos: int,
    home_pts: int,
    away_pts: int,
    home_form: list[str] | None = None,
    away_form: list[str] | None = None,
    home_matches_7d: int = 1,
    home_european: bool = False,
    missing_home_players: list[dict] | None = None,
    top_scorer_out: bool = False,
    goalkeeper_out: bool = False,
    home_win_pct: float | None = None,
    total_teams: int = 20,
) -> dict[str, Any]:
    """High-level function: analyze one match for surprise risk."""
    hf = home_fragility_score(home_form or [])
    ac = away_competence_score(away_form or [])
    ma = motivational_asymmetry_score(home_pos, home_pts, away_pos, away_pts, total_teams)
    cp = congestion_penalty_score(home_matches_7d, home_european)
    kp = key_player_absence_score(missing_home_players, top_scorer_out, goalkeeper_out)
    hv = historical_venue_score(home_win_pct)

    result = compute_surprise_risk(hf, ac, ma, cp, kp, hv)
    result["match"] = f"{home_team} vs {away_team}"
    result["home_team"] = home_team
    result["away_team"] = away_team
    return result


# ── CLI ──

if __name__ == "__main__":
    print("=== SURPRISE DETECTOR — J60 Retrospective ===\n")

    # P11: Eibar 2-4 Málaga (surprise away win)
    p11 = analyze_match_surprise(
        home_team="Eibar", away_team="Málaga",
        home_pos=8, away_pos=6, home_pts=50, away_pts=55,
        home_form=["W", "D", "L", "W", "D", "L"],
        away_form=["W", "W", "D", "W", "L", "W"],
        home_matches_7d=1,
    )
    print(f"P11 Eibar vs Málaga:")
    print(f"  Risk: {p11['surprise_risk']}  Level: {p11['level']}")
    print(f"  Action: {p11['action']}")
    print(f"  Factors: {json.dumps(p11['factors'], indent=4)}")

    print()

    # P13: Sporting 1-2 Ceuta (surprise away win)
    p13 = analyze_match_surprise(
        home_team="Sporting", away_team="Ceuta",
        home_pos=10, away_pos=14, home_pts=45, away_pts=38,
        home_form=["D", "L", "W", "D", "L", "D"],
        away_form=["W", "D", "W", "L", "W", "D"],
        home_matches_7d=1,
    )
    print(f"P13 Sporting vs Ceuta:")
    print(f"  Risk: {p13['surprise_risk']}  Level: {p13['level']}")
    print(f"  Action: {p13['action']}")
    print(f"  Factors: {json.dumps(p13['factors'], indent=4)}")
