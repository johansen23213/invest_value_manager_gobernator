#!/usr/bin/env python3
"""
Fetch complete match history from laliga.com or FotMob.

RUN THIS FROM A LOCAL MACHINE (not a sandboxed server).
This script needs direct HTTP access to laliga.com or fotmob.com.

Usage:
  python scrapers/fetch_history.py laliga 20 34    # Fetch J20 to J34
  python scrapers/fetch_history.py segunda 20 38   # Fetch Segunda J20 to J38
  python scrapers/fetch_history.py all              # Fetch everything

Output: state/data/history/laliga_matches.json (and segunda_matches.json)
"""

import json
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    print("pip install requests")
    sys.exit(1)

BASE_DIR = Path(__file__).parent.parent / "state" / "data" / "history"
BASE_DIR.mkdir(parents=True, exist_ok=True)

FOTMOB_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Referer": "https://www.fotmob.com/",
}

LALIGA_ID = 87
SEGUNDA_ID = 88  # FotMob ID for Segunda División


def fetch_league_data(league_id: int) -> dict:
    """Fetch league overview from FotMob."""
    url = f"https://www.fotmob.com/api/leagues?id={league_id}&ccode3=ESP"
    resp = requests.get(url, headers=FOTMOB_HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.json()


def extract_all_matches(league_data: dict) -> list[dict]:
    """Extract all match results from league data."""
    matches_section = league_data.get("matches", {})
    all_matches = matches_section.get("allMatches", [])

    results = []
    for m in all_matches:
        status = m.get("status", {})
        if not status.get("finished"):
            continue

        home = m.get("home", {})
        away = m.get("away", {})
        score_str = status.get("scoreStr", "")

        home_goals = away_goals = None
        if score_str and " - " in score_str:
            parts = score_str.split(" - ")
            try:
                home_goals = int(parts[0].strip())
                away_goals = int(parts[1].strip())
            except (ValueError, IndexError):
                pass

        results.append({
            "round": m.get("round"),
            "home_team": home.get("name", "?"),
            "home_id": home.get("id"),
            "away_team": away.get("name", "?"),
            "away_id": away.get("id"),
            "home_goals": home_goals,
            "away_goals": away_goals,
            "score": score_str,
            "match_id": m.get("id"),
            "date": status.get("utcTime", ""),
        })

    return results


def fetch_and_save(league: str = "laliga", from_round: int = 1, to_round: int = 38) -> str:
    """Fetch all matches for a league and save to JSON."""
    league_id = LALIGA_ID if league == "laliga" else SEGUNDA_ID

    print(f"Fetching {league} data from FotMob (league_id={league_id})...")
    try:
        data = fetch_league_data(league_id)
    except requests.exceptions.HTTPError as e:
        print(f"ERROR: {e}")
        print("If you get 403, try running this from a local machine, not a server.")
        return ""

    all_matches = extract_all_matches(data)
    filtered = [m for m in all_matches if from_round <= (m.get("round") or 0) <= to_round]

    output = {
        "league": league,
        "league_id": league_id,
        "from_round": from_round,
        "to_round": to_round,
        "total_matches": len(filtered),
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "matches": filtered,
    }

    filepath = BASE_DIR / f"{league}_matches.json"
    with open(filepath, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(filtered)} matches to {filepath}")

    # Print summary
    by_round = {}
    for m in filtered:
        r = m.get("round", "?")
        by_round.setdefault(r, []).append(m)

    print(f"\nRounds found:")
    for r in sorted(by_round.keys()):
        print(f"  J{r}: {len(by_round[r])} matches")

    return str(filepath)


def print_match_table(filepath: str, rounds: list[int] | None = None) -> None:
    """Pretty-print matches from a saved file."""
    with open(filepath) as f:
        data = json.load(f)

    matches = data["matches"]
    if rounds:
        matches = [m for m in matches if m.get("round") in rounds]

    current_round = None
    for m in sorted(matches, key=lambda x: (x.get("round", 0), x.get("date", ""))):
        r = m.get("round")
        if r != current_round:
            print(f"\n  Jornada {r}")
            print(f"  {'─' * 55}")
            current_round = r
        print(f"    {m['home_team']:>25} {m.get('score', '?'):^7} {m['away_team']:<25}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(0)

    if sys.argv[1] == "all":
        fetch_and_save("laliga", 1, 38)
        time.sleep(2)
        fetch_and_save("segunda", 1, 42)
    elif len(sys.argv) >= 4:
        league = sys.argv[1]
        from_r = int(sys.argv[2])
        to_r = int(sys.argv[3])
        fetch_and_save(league, from_r, to_r)
    elif sys.argv[1] == "show":
        filepath = sys.argv[2] if len(sys.argv) > 2 else str(BASE_DIR / "laliga_matches.json")
        rounds = [int(r) for r in sys.argv[3:]] if len(sys.argv) > 3 else None
        print_match_table(filepath, rounds)
    else:
        print(f"Unknown command: {sys.argv[1]}")
        print(__doc__)
