#!/usr/bin/env python3
"""
Web-based data collector for when FotMob API is blocked (403).

Uses structured web searches to collect and cross-reference football data.
Each data point requires 2+ sources and explicit matchday/date context.

This is the fallback pipeline when running from server environments
that get blocked by FotMob, ESPN, etc.
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

STATE_DIR = Path(__file__).parent.parent / "state" / "data"


def generate_verification_queries(league: str = "LaLiga") -> list[dict]:
    """Generate the list of searches needed to verify a full matchday."""

    if league == "LaLiga":
        teams = [
            "Barcelona", "Real Madrid", "Villarreal", "Atlético Madrid",
            "Real Betis", "Celta", "Getafe", "Athletic Club",
            "Real Sociedad", "Osasuna", "Rayo Vallecano", "Valencia",
            "Espanyol", "Elche", "Mallorca", "Girona",
            "Alavés", "Sevilla", "Levante", "Real Oviedo",
        ]
    elif league == "Segunda":
        teams = [
            "Racing Santander", "Deportivo La Coruña", "Almería", "Castellón",
            "Las Palmas", "Burgos CF", "Eibar", "Málaga",
            "Andorra CF", "Córdoba", "Sporting Gijón", "Leganés",
            "Cádiz CF", "Granada CF", "Ceuta AD", "Valladolid",
            "Eldense", "Albacete", "Mirandés", "Real Zaragoza",
            "Cultural Leonesa", "Real Sociedad B",
        ]
    else:
        teams = []

    queries = []

    # 1. Standings verification (batch of 5 teams per query)
    for i in range(0, len(teams), 5):
        batch = teams[i:i+5]
        team_str = " ".join(f'"{t}"' for t in batch)
        queries.append({
            "type": "standings",
            "query": f'{league} 2025-26 standings {team_str} points position May 2026',
            "teams": batch,
        })

    # 2. Individual team verification for relegation/promotion zone
    critical_teams = teams[-4:] + teams[:2]  # Bottom 4 + top 2
    for t in critical_teams:
        queries.append({
            "type": "team_detail",
            "query": f'"{t}" {league} 2025-26 points position standings May 2026 matchday',
            "team": t,
        })

    # 3. Top scorers
    queries.append({
        "type": "scorers",
        "query": f'{league} 2025-26 top scorers goals pichichi May 2026',
    })

    # 4. Latest matchday results
    queries.append({
        "type": "results",
        "query": f'{league} 2025-26 latest results scores matchday May 3 4 2026',
    })

    return queries


def create_audit_checklist(league: str, matchday: int) -> dict:
    """Create a checklist of what data needs verification."""
    return {
        "league": league,
        "matchday": matchday,
        "date": datetime.now().isoformat(),
        "checklist": {
            "standings_all_teams": False,
            "points_verified_2_sources": False,
            "positions_consistent": False,
            "top_scorers_verified": False,
            "matchday_results_verified": False,
            "relegation_zone_verified": False,
            "promotion_zone_verified": False,
            "no_season_confusion": False,
            "dates_correct": False,
        },
        "verification_notes": [],
    }


def print_data_status() -> None:
    """Show current data status for all leagues."""
    print("\n" + "=" * 60)
    print("  DATA STATUS")
    print("=" * 60)

    for f in sorted(STATE_DIR.glob("*.json")):
        try:
            with open(f) as fh:
                data = json.load(fh)
            league = data.get("league", "?")
            md = data.get("matchday", "?")
            quality = data.get("data_quality", data.get("audit", {}).get("confidence", "?"))
            date = data.get("date", "?")

            # Count verified
            standings = data.get("standings", [])
            verified = sum(1 for s in standings if s.get("verified") is True)
            total = len(standings)
            unverified = sum(1 for s in standings if s.get("pts") is None)

            print(f"\n  {f.name}")
            print(f"    League: {league}  |  Matchday: {md}  |  Date: {date}")
            print(f"    Quality: {quality}")
            print(f"    Teams: {total}  |  Verified: {verified}  |  Missing pts: {unverified}")
        except (json.JSONDecodeError, KeyError):
            print(f"\n  {f.name} — could not parse")

    # Check for audit reports
    audit_files = list(STATE_DIR.glob("AUDIT_*.md"))
    if audit_files:
        print(f"\n  Audit reports: {len(audit_files)}")
        for af in audit_files:
            print(f"    {af.name}")


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] == "status":
        print_data_status()
    elif sys.argv[1] == "queries":
        league = sys.argv[2] if len(sys.argv) > 2 else "LaLiga"
        queries = generate_verification_queries(league)
        print(f"\nVerification queries for {league} ({len(queries)} searches):\n")
        for i, q in enumerate(queries, 1):
            print(f"  {i}. [{q['type']}] {q['query']}")
    else:
        print("Usage: python web_collector.py [status|queries [league]]")
