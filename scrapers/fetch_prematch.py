#!/usr/bin/env python3
"""
Fetch pre-match data (squad lists, injuries, suspensions, probable lineups)
for the matches of a quiniela jornada.

RUN THIS FROM A LOCAL MACHINE (not a sandboxed server).
This script needs direct HTTP access to fotmob.com.

Usage:
  python scrapers/fetch_prematch.py 61                        # J61, default fixtures file
  python scrapers/fetch_prematch.py 61 --fixtures path.json   # Custom fixtures file
  python scrapers/fetch_prematch.py 61 --queries              # Print web-search fallback queries
  python scrapers/fetch_prematch.py show 61                   # Pretty-print saved data

Reads: state/data/quiniela_j{N}_fixtures.json
Output: state/data/prematch/quiniela_j{N}_prematch.json
"""

import json
import sys
import time
import unicodedata
from pathlib import Path

try:
    import requests
except ImportError:
    print("pip install requests")
    sys.exit(1)

REPO_ROOT = Path(__file__).parent.parent
FIXTURES_DIR = REPO_ROOT / "state" / "data"
OUT_DIR = REPO_ROOT / "state" / "data" / "prematch"
OUT_DIR.mkdir(parents=True, exist_ok=True)

FOTMOB_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Referer": "https://www.fotmob.com/",
}

LEAGUE_IDS = {
    "Primera": 87,
    "Segunda": 88,
}


def normalize_name(s: str) -> str:
    """Strip accents, lowercase, drop common prefixes/suffixes for matching."""
    if not s:
        return ""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower().strip()
    for prefix in ("real ", "club ", "cf ", "ad "):
        if s.startswith(prefix):
            s = s[len(prefix):]
    for suffix in (" cf", " club", " ad", " fc"):
        if s.endswith(suffix):
            s = s[:-len(suffix)]
    return s.strip()


def fetch_league_data(league_id: int) -> dict:
    """Fetch league overview from FotMob (contains allMatches with IDs)."""
    url = f"https://www.fotmob.com/api/leagues?id={league_id}&ccode3=ESP"
    resp = requests.get(url, headers=FOTMOB_HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.json()


def find_match_id(league_data: dict, home_team: str, away_team: str) -> int | None:
    """Find FotMob match ID by team names (uses normalized matching, prefers
    upcoming/not-finished matches)."""
    home_n = normalize_name(home_team)
    away_n = normalize_name(away_team)
    candidates = []

    for m in league_data.get("matches", {}).get("allMatches", []):
        h = normalize_name(m.get("home", {}).get("name", ""))
        a = normalize_name(m.get("away", {}).get("name", ""))
        if home_n in h or h in home_n:
            if away_n in a or a in away_n:
                finished = m.get("status", {}).get("finished", False)
                candidates.append((finished, m))

    if not candidates:
        return None
    # Prefer not-finished (upcoming) matches
    candidates.sort(key=lambda x: x[0])
    return candidates[0][1].get("id")


def fetch_match_details(match_id: int) -> dict:
    """Fetch full match details (lineup, injuries, form) from FotMob."""
    url = f"https://www.fotmob.com/api/matchDetails?matchId={match_id}"
    resp = requests.get(url, headers=FOTMOB_HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.json()


def parse_team_block(team_block: dict) -> dict:
    """Extract probable lineup and key info from one side of the lineup block."""
    if not team_block:
        return {}

    formation = team_block.get("lineup") or team_block.get("formation")
    if isinstance(formation, list):
        formation = "-".join(str(x) for x in formation if x)

    starters = []
    for row in team_block.get("players", []) or []:
        # FotMob nests starters by row (defenders, midfielders, etc)
        items = row if isinstance(row, list) else [row]
        for p in items:
            if not isinstance(p, dict):
                continue
            starters.append({
                "name": p.get("name", {}).get("fullName") if isinstance(p.get("name"), dict) else p.get("name"),
                "shirt": p.get("shirt"),
                "position": p.get("positionStringShort") or p.get("position"),
                "captain": p.get("isCaptain", False),
            })

    bench = []
    for p in team_block.get("bench", []) or []:
        if not isinstance(p, dict):
            continue
        bench.append({
            "name": p.get("name", {}).get("fullName") if isinstance(p.get("name"), dict) else p.get("name"),
            "shirt": p.get("shirt"),
            "position": p.get("positionStringShort") or p.get("position"),
        })

    return {
        "team": team_block.get("teamName") or team_block.get("name"),
        "formation": formation,
        "probable_xi": starters,
        "bench": bench,
    }


def parse_missing_players(na_block: list) -> list[dict]:
    """Extract injured/suspended/doubtful players from naPlayers block.

    naPlayers is typically [home_list, away_list] where each list contains
    {player: {...}, reason: {...}} entries.
    """
    out = []
    if not isinstance(na_block, list):
        return out
    for p in na_block:
        if not isinstance(p, dict):
            continue
        player = p.get("player") or {}
        reason = p.get("reason") or {}
        out.append({
            "name": player.get("name") if isinstance(player.get("name"), str) else (player.get("name") or {}).get("fullName"),
            "reason": reason.get("text") or reason.get("type") or reason if isinstance(reason, str) else reason.get("text"),
            "type": reason.get("type") if isinstance(reason, dict) else None,
        })
    return out


def extract_prematch_info(details: dict) -> dict:
    """Pull lineups, missing players, recent form from match details JSON."""
    content = details.get("content") or {}
    header = details.get("header") or {}
    general = details.get("general") or {}

    lineup_block = content.get("lineup") or {}
    sides = lineup_block.get("lineup") or [{}, {}]
    home_side = sides[0] if len(sides) > 0 else {}
    away_side = sides[1] if len(sides) > 1 else {}

    na = lineup_block.get("naPlayersArr") or lineup_block.get("naPlayers") or [[], []]
    home_missing = parse_missing_players(na[0] if len(na) > 0 else [])
    away_missing = parse_missing_players(na[1] if len(na) > 1 else [])

    teams = header.get("teams") or []
    status = header.get("status") or {}

    return {
        "match_id": general.get("matchId") or general.get("id"),
        "kickoff_utc": status.get("utcTime"),
        "started": status.get("started", False),
        "finished": status.get("finished", False),
        "venue": general.get("matchName") or general.get("venue"),
        "home": {
            "team": teams[0].get("name") if len(teams) > 0 else None,
            **parse_team_block(home_side),
            "missing_players": home_missing,
        },
        "away": {
            "team": teams[1].get("name") if len(teams) > 1 else None,
            **parse_team_block(away_side),
            "missing_players": away_missing,
        },
    }


def load_fixtures(jornada: int, custom_path: str | None = None) -> dict:
    path = Path(custom_path) if custom_path else FIXTURES_DIR / f"quiniela_j{jornada}_fixtures.json"
    if not path.exists():
        raise FileNotFoundError(f"Fixtures file not found: {path}")
    with open(path) as f:
        return json.load(f)


def fetch_jornada_prematch(jornada: int, fixtures_path: str | None = None) -> str:
    """Fetch pre-match data for every match in a quiniela jornada and save it."""
    fixtures = load_fixtures(jornada, fixtures_path)
    matches = fixtures.get("matches", [])
    if not matches:
        print(f"No matches found in fixtures for J{jornada}")
        return ""

    # Cache league data so we hit the API once per league
    league_cache: dict[str, dict] = {}
    results = []

    for fx in matches:
        league = fx.get("league", "Primera")
        league_id = LEAGUE_IDS.get(league)
        if league_id is None:
            print(f"  SKIP match {fx.get('num')}: unknown league '{league}'")
            continue

        if league not in league_cache:
            print(f"Fetching {league} league data (id={league_id})...")
            try:
                league_cache[league] = fetch_league_data(league_id)
            except requests.exceptions.HTTPError as e:
                print(f"  ERROR fetching {league}: {e}")
                print("  If 403, run from a local machine. Try --queries for fallback.")
                return ""
            time.sleep(1)

        match_id = find_match_id(league_cache[league], fx["home"], fx["away"])
        entry = {
            "num": fx.get("num"),
            "home_team": fx["home"],
            "away_team": fx["away"],
            "league": league,
            "match_id": match_id,
        }

        if match_id is None:
            print(f"  M{fx['num']:>2} {fx['home']:>20} vs {fx['away']:<20}  match_id NOT FOUND")
            entry["error"] = "match_id_not_found"
            results.append(entry)
            continue

        try:
            details = fetch_match_details(match_id)
            entry["prematch"] = extract_prematch_info(details)
            home_xi = len(entry["prematch"]["home"].get("probable_xi", []))
            home_out = len(entry["prematch"]["home"].get("missing_players", []))
            away_xi = len(entry["prematch"]["away"].get("probable_xi", []))
            away_out = len(entry["prematch"]["away"].get("missing_players", []))
            print(f"  M{fx['num']:>2} {fx['home']:>20} vs {fx['away']:<20}  "
                  f"XI: {home_xi}/{away_xi}  OUT: {home_out}/{away_out}")
        except requests.exceptions.HTTPError as e:
            print(f"  M{fx['num']:>2} ERROR fetching match {match_id}: {e}")
            entry["error"] = str(e)

        results.append(entry)
        time.sleep(0.5)

    output = {
        "quiniela_jornada": jornada,
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "source": "fotmob.com/api/matchDetails",
        "total_matches": len(results),
        "matches_with_data": sum(1 for r in results if "prematch" in r),
        "matches_without_id": sum(1 for r in results if r.get("error") == "match_id_not_found"),
        "matches": results,
    }

    out_path = OUT_DIR / f"quiniela_j{jornada}_prematch.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"\nSaved {output['matches_with_data']}/{output['total_matches']} to {out_path}")
    return str(out_path)


def generate_fallback_queries(jornada: int, fixtures_path: str | None = None) -> list[dict]:
    """Generate web-search queries for pre-match data when FotMob is blocked.

    Mirrors the pattern in web_collector.py: structured queries, 2 sources per
    data point, explicit matchday/date context. Returns a list — caller decides
    how to execute (WebSearch tool, etc).
    """
    fixtures = load_fixtures(jornada, fixtures_path)
    date = fixtures.get("date", "")
    queries = []

    for fx in fixtures.get("matches", []):
        home, away = fx["home"], fx["away"]
        ctx = f"jornada {fx.get('league', '')} mayo 2026"

        queries.append({
            "match_num": fx.get("num"),
            "type": "probable_lineup",
            "query": f'"{home}" vs "{away}" alineación probable {ctx} {date}',
        })
        queries.append({
            "match_num": fx.get("num"),
            "type": "injuries",
            "query": f'"{home}" lesionados convocatoria {ctx} {date}',
        })
        queries.append({
            "match_num": fx.get("num"),
            "type": "injuries",
            "query": f'"{away}" lesionados convocatoria {ctx} {date}',
        })
        queries.append({
            "match_num": fx.get("num"),
            "type": "suspensions",
            "query": f'"{home}" "{away}" sancionados ciclo amarillas {ctx}',
        })

    return queries


def print_prematch(jornada: int) -> None:
    """Pretty-print saved pre-match data."""
    path = OUT_DIR / f"quiniela_j{jornada}_prematch.json"
    if not path.exists():
        print(f"No data: {path}")
        return
    with open(path) as f:
        data = json.load(f)

    print(f"\n  Quiniela J{jornada} — Pre-match")
    print(f"  Fetched: {data.get('fetched_at')}")
    print(f"  Coverage: {data.get('matches_with_data')}/{data.get('total_matches')}")
    print(f"  {'=' * 70}")

    for m in data.get("matches", []):
        print(f"\n  M{m['num']:>2}  {m['home_team']} vs {m['away_team']}  ({m.get('league')})")
        pm = m.get("prematch")
        if not pm:
            print(f"      (no data — {m.get('error', 'unknown')})")
            continue
        for side_key in ("home", "away"):
            side = pm.get(side_key, {})
            xi = side.get("probable_xi", [])
            out_list = side.get("missing_players", [])
            print(f"      {side_key.upper()}: {side.get('team')}  "
                  f"formation={side.get('formation') or '?'}  "
                  f"XI={len(xi)} bench={len(side.get('bench', []))} OUT={len(out_list)}")
            for op in out_list[:8]:
                print(f"         OUT: {op.get('name')} — {op.get('reason') or op.get('type')}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(0)

    if sys.argv[1] == "show":
        jornada = int(sys.argv[2]) if len(sys.argv) > 2 else 61
        print_prematch(jornada)
        sys.exit(0)

    try:
        jornada = int(sys.argv[1])
    except ValueError:
        print(f"Unknown command: {sys.argv[1]}")
        print(__doc__)
        sys.exit(1)

    fixtures_path = None
    queries_only = False
    args = sys.argv[2:]
    i = 0
    while i < len(args):
        if args[i] == "--fixtures" and i + 1 < len(args):
            fixtures_path = args[i + 1]
            i += 2
        elif args[i] == "--queries":
            queries_only = True
            i += 1
        else:
            i += 1

    if queries_only:
        qs = generate_fallback_queries(jornada, fixtures_path)
        print(f"\nFallback web-search queries for J{jornada} ({len(qs)} searches):\n")
        for i, q in enumerate(qs, 1):
            print(f"  {i:>3}. M{q['match_num']:>2} [{q['type']}] {q['query']}")
    else:
        fetch_jornada_prematch(jornada, fixtures_path)
