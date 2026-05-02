#!/usr/bin/env python3
"""
LaLiga EA Sports 2025/26 stats scraper using FotMob public API.
No API key or registration required.
"""

import csv
import io
import json
import logging
import re
import sys
import time
import unicodedata
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import requests

DEFAULT_LEAGUE_ID = 87
DEFAULT_SEASON = "2025/2026"
BASE_URL = "https://www.fotmob.com/api"

LEAGUE_ALIASES = {
    "laliga": 87, "liga": 87, "spain": 87,
    "premier": 47, "epl": 47, "england": 47,
    "seriea": 55, "italy": 55,
    "bundesliga": 35, "germany": 35,
    "ligue1": 53, "france": 53,
}

LALIGA_ID = DEFAULT_LEAGUE_ID
SEASON = DEFAULT_SEASON

# Browser UA required by FotMob — honest UAs get 403.
# This is a trade-off: FotMob has no public API program.
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Referer": "https://www.fotmob.com/",
}

REQUEST_DELAY = 1.5
MAX_RESPONSE_MB = 50

# Form analysis thresholds
TREND_THRESHOLD = 0.15
CONSISTENCY_HIGH = 0.4
CONSISTENCY_LOW = 0.8
RATING_ELITE = 8.0
RATING_GOOD = 7.0
RATING_AVG = 6.0
CONGESTION_HIGH_DAYS = 3
CONGESTION_MODERATE_DAYS = 4

log = logging.getLogger("laliga_stats")

SCORE_RE = re.compile(r"^(\d+)\s*-\s*(\d+)")


def _parse_score(score_str: str | None) -> tuple[int | None, int | None]:
    """Extract (home_goals, away_goals) from a score string. Handles AET/penalties."""
    if not score_str:
        return None, None
    m = SCORE_RE.match(str(score_str).strip())
    if m:
        return int(m.group(1)), int(m.group(2))
    return None, None


_cache: dict[str, Any] = {}

MAX_RETRIES = 3
RETRY_BACKOFF = [2, 4, 8]


class ResolveError(Exception):
    """Raised when a team/player name cannot be resolved to an ID."""


def _get(endpoint: str, params: dict | None = None, use_cache: bool = True) -> dict[str, Any]:
    cache_key = f"{endpoint}:{json.dumps(params, sort_keys=True)}" if params else endpoint
    if use_cache and cache_key in _cache:
        return _cache[cache_key]
    url = f"{BASE_URL}/{endpoint}"
    last_exc = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            resp = requests.get(url, headers=HEADERS, params=params, timeout=30)
            if resp.status_code == 429:
                wait = RETRY_BACKOFF[min(attempt, len(RETRY_BACKOFF) - 1)]
                log.warning("Rate limited (429). Retrying in %ds...", wait)
                time.sleep(wait)
                continue
            resp.raise_for_status()
            if len(resp.content) > MAX_RESPONSE_MB * 1024 * 1024:
                raise ValueError(f"Response too large: {len(resp.content)} bytes")
            data = resp.json()
            _cache[cache_key] = data
            return data
        except requests.exceptions.ConnectionError as e:
            last_exc = e
            if attempt < MAX_RETRIES:
                wait = RETRY_BACKOFF[min(attempt, len(RETRY_BACKOFF) - 1)]
                log.warning("Connection error. Retrying in %ds...", wait)
                time.sleep(wait)
    raise last_exc or requests.exceptions.ConnectionError("Max retries exceeded")


def _delay() -> None:
    time.sleep(REQUEST_DELAY)


def _sanitize(text: str) -> str:
    """Strip terminal control characters from API strings."""
    return "".join(c for c in str(text) if c.isprintable() or c in "\n\t")


def _normalize(text: str) -> str:
    """Normalize text for fuzzy matching: lowercase, strip accents."""
    nfkd = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in nfkd if not unicodedata.combining(c))


# ──────────────────────────────────────────────
# Export utilities (--json / --csv)
# ──────────────────────────────────────────────

def _safe_filename(filename: str) -> str:
    """Sanitize export filename to prevent path traversal."""
    p = Path(filename)
    resolved = (Path.cwd() / p).resolve()
    if not str(resolved).startswith(str(Path.cwd().resolve())):
        print(f"  Warning: path '{filename}' escapes working directory. Using basename only.")
        return p.name
    return filename


def _export_json(data: Any, filename: str | None = None) -> None:
    output = json.dumps(data, indent=2, ensure_ascii=False, default=str)
    if filename:
        safe = _safe_filename(filename)
        with open(safe, "w", encoding="utf-8") as f:
            f.write(output)
        print(f"  Exported JSON → {safe}")
    else:
        print(output)


def _export_csv(rows: list[dict], filename: str | None = None) -> None:
    if not rows:
        print("  No data to export.")
        return
    keys = list(dict.fromkeys(k for row in rows for k in row.keys()))
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=keys, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    output = buf.getvalue()
    if filename:
        safe = _safe_filename(filename)
        with open(safe, "w", encoding="utf-8") as f:
            f.write(output)
        print(f"  Exported CSV → {safe}")
    else:
        print(output)


def _standings_to_rows(league_data: dict[str, Any]) -> list[dict]:
    """Extract standings as flat dicts for export."""
    tables = league_data.get("table", [])
    all_rows = _find_standings_rows(tables)
    result = []
    for row in all_rows:
        result.append({
            "position": row.get("idx", row.get("position", "")),
            "team": row.get("name", row.get("shortName", "")),
            "team_id": row.get("id", ""),
            "played": row.get("played", 0),
            "wins": row.get("wins", 0),
            "draws": row.get("draws", 0),
            "losses": row.get("losses", 0),
            "goals_for": _parse_score(row.get("scoresStr"))[0] if row.get("scoresStr") else row.get("goalsFor", "?"),
            "goals_against": _parse_score(row.get("scoresStr"))[1] if row.get("scoresStr") else row.get("goalsAgainst", "?"),
            "goal_diff": row.get("goalConDiff", row.get("goalDifference", 0)),
            "points": row.get("pts", 0),
        })
    return result


def _find_standings_rows(tables) -> list:
    """Helper to find the standings rows in various FotMob structures."""
    all_rows = []
    if isinstance(tables, list):
        for t in tables:
            data = t.get("data") or t if isinstance(t, dict) else t
            if isinstance(data, dict):
                table_all = data.get("table", data.get("tables", []))
                if isinstance(table_all, dict):
                    all_rows = table_all.get("all", [])
                elif isinstance(table_all, list):
                    for sub in table_all:
                        if isinstance(sub, dict) and "all" in sub:
                            all_rows = sub["all"]
                            break
            elif isinstance(data, list):
                all_rows = data
            if all_rows:
                break
    elif isinstance(tables, dict):
        all_rows = tables.get("all", [])
    # Fallback: try deeper nesting
    if not all_rows and isinstance(tables, list) and tables:
        first = tables[0] if isinstance(tables[0], dict) else {}
        data = first.get("data", first)
        if isinstance(data, dict):
            tbl = data.get("table", {})
            if isinstance(tbl, dict):
                all_rows = tbl.get("all", [])
            elif isinstance(tbl, list) and tbl:
                all_rows = tbl[0].get("all", [])
    return all_rows


def _parse_export_args(args: list[str]) -> tuple[str | None, str | None]:
    """Parse --json/--csv and optional filename from CLI args."""
    fmt = None
    filename = None
    for i, a in enumerate(args):
        if a == "--json":
            fmt = "json"
            if i + 1 < len(args) and not args[i + 1].startswith("-"):
                filename = args[i + 1]
        elif a == "--csv":
            fmt = "csv"
            if i + 1 < len(args) and not args[i + 1].startswith("-"):
                filename = args[i + 1]
    return fmt, filename


# ──────────────────────────────────────────────
# 0. Search by name
# ──────────────────────────────────────────────

def search_team(query: str) -> list[dict[str, Any]]:
    """Search for a team by name in LaLiga standings."""
    league = get_league_data()
    teams = extract_teams(league)
    q = _normalize(query)
    results = []
    for t in teams:
        name_norm = _normalize(t["name"])
        if q in name_norm or name_norm in q:
            results.append(t)
    if not results:
        for t in teams:
            name_norm = _normalize(t["name"])
            if any(w in name_norm for w in q.split()):
                results.append(t)
    return results


def search_player(query: str) -> list[dict[str, Any]]:
    """Search for a player by name across all LaLiga squads."""
    league = get_league_data()
    teams = extract_teams(league)
    q = _normalize(query)
    results = []

    skipped = 0
    print(f"  Searching {len(teams)} teams for '{query}'...")
    for t in teams:
        try:
            tdata = get_team_data(t["id"])
        except requests.exceptions.RequestException:
            skipped += 1
            log.warning("Failed to fetch team %s (%s)", t["name"], t["id"])
            continue
        squad = tdata.get("squad", [])
        for group in squad:
            for m in group.get("members", []):
                pname = m.get("name", "")
                if q in _normalize(pname):
                    results.append({
                        "id": m.get("id"),
                        "name": pname,
                        "team": t["name"],
                        "team_id": t["id"],
                        "number": m.get("shirtNumber", ""),
                        "position": group.get("title", ""),
                    })
        _delay()
    if skipped:
        print(f"  (Skipped {skipped}/{len(teams)} teams due to fetch errors)")
    return results


def print_search_results(query: str, kind: str) -> None:
    if kind == "team":
        results = search_team(query)
        if not results:
            print(f"  No teams found matching '{query}'.")
            return
        print(f"\n  Teams matching '{query}':")
        print(f"    {'ID':>8}  {'Equipo':<30}")
        print(f"    {'-' * 40}")
        for t in results:
            print(f"    {t['id']:>8}  {t['name']:<30}")
    elif kind == "player":
        results = search_player(query)
        if not results:
            print(f"  No players found matching '{query}'.")
            return
        print(f"\n  Players matching '{query}':")
        print(f"    {'ID':>10}  {'Jugador':<25} {'Equipo':<20} {'#':>4} {'Pos':<15}")
        print(f"    {'-' * 78}")
        for p in results:
            print(f"    {p['id']:>10}  {p['name']:<25} {p['team']:<20} {str(p['number']):>4} {p['position']:<15}")


# ──────────────────────────────────────────────
# 1. League / standings
# ──────────────────────────────────────────────

def get_league_data() -> dict[str, Any]:
    return _get("leagues", {"id": LALIGA_ID, "ccode3": "ESP"})


def print_standings(league_data: dict[str, Any], team_filter: str | None = None) -> None:
    print("\n" + "=" * 75)
    print(f"  CLASIFICACIÓN — LaLiga EA Sports {SEASON}")
    print("=" * 75)

    all_rows = _find_standings_rows(league_data.get("table", []))
    if not all_rows:
        print("  Could not parse standings structure.")
        return

    header = f"  {'#':>3}  {'Equipo':<25} {'PJ':>3} {'G':>3} {'E':>3} {'P':>3} {'GF':>4} {'GC':>4} {'DG':>4} {'Pts':>4} {'Forma':<7}"
    print(header)
    print("  " + "-" * 73)

    filter_norm = _normalize(team_filter) if team_filter else None

    for row in all_rows:
        pos = row.get("idx", row.get("position", ""))
        name = row.get("name", row.get("shortName", "???"))
        played = row.get("played", 0)
        wins = row.get("wins", 0)
        draws_count = row.get("draws", 0)
        losses = row.get("losses", 0)
        gf_parsed, gc_parsed = _parse_score(row.get("scoresStr"))
        gf = gf_parsed if gf_parsed is not None else row.get("goalsFor", "?")
        gc = gc_parsed if gc_parsed is not None else row.get("goalsAgainst", "?")
        gd = row.get("goalConDiff", row.get("goalDifference", 0))
        pts = row.get("pts", 0)

        # Form from FotMob data (last 5)
        form_str = ""
        form_data = row.get("form", row.get("recentForm", []))
        if isinstance(form_data, list):
            form_str = "".join(f.get("result", "?")[:1].upper() if isinstance(f, dict) else str(f)[:1].upper() for f in form_data[-5:])
        elif isinstance(form_data, str):
            form_str = form_data[-5:]

        if filter_norm and filter_norm not in _normalize(name):
            continue

        marker = " ←" if filter_norm and filter_norm in _normalize(name) else ""
        print(f"  {pos:>3}  {name:<25} {played:>3} {wins:>3} {draws_count:>3} {losses:>3} {gf:>4} {gc:>4} {gd:>4} {pts:>4} {form_str:<7}{marker}")


def extract_teams(league_data: dict[str, Any]) -> list[dict[str, Any]]:
    teams = []
    all_rows = _find_standings_rows(league_data.get("table", []))
    for row in all_rows:
        team_id = row.get("id")
        name = row.get("name", row.get("shortName", "???"))
        if team_id:
            teams.append({"id": team_id, "name": name})
    return teams


# ──────────────────────────────────────────────
# 2. Team details
# ──────────────────────────────────────────────

def get_team_data(team_id: int) -> dict[str, Any]:
    data = _get("teams", {"id": team_id, "ccode3": "ESP"})
    resp_id = data.get("details", {}).get("id")
    if resp_id is not None and resp_id != team_id:
        log.warning("Requested team %s but got %s", team_id, resp_id)
    return data


def print_team_overview(team_data: dict[str, Any]) -> None:
    name = team_data.get("details", {}).get("name", "Unknown")
    print(f"\n{'─' * 50}")
    print(f"  {name}")
    print(f"{'─' * 50}")

    overview = team_data.get("overview", {})

    # Top players
    top_stats = overview.get("topPlayers", {})
    for category, players in top_stats.items():
        if not isinstance(players, list):
            continue
        print(f"\n  {category}:")
        for p in players[:3]:
            pname = p.get("name", p.get("playerName", "???"))
            value = p.get("value", p.get("goals", p.get("assists", "?")))
            print(f"    - {pname}: {value}")


def print_squad(team_data: dict[str, Any]) -> None:
    squad = team_data.get("squad", [])
    if not squad:
        print("  No squad data available.")
        return

    for group in squad:
        title = group.get("title", "Unknown")
        members = group.get("members", [])
        print(f"\n  {title} ({len(members)}):")
        for m in members:
            name = m.get("name", "???")
            role = m.get("role", "")
            number = m.get("shirtNumber", "")
            prefix = f"#{number}" if number else "  "
            print(f"    {prefix:>4} {name} {f'({role})' if role else ''}")


# ──────────────────────────────────────────────
# 2b. Multi-competition analysis & rotation
# ──────────────────────────────────────────────

COMPETITION_PRIORITY = {
    "champions league": 5,
    "ucl": 5,
    "uefa champions league": 5,
    "europa league": 4,
    "uel": 4,
    "uefa europa league": 4,
    "conference league": 3,
    "uecl": 3,
    "copa del rey": 3,
    "supercopa": 2,
    "laliga": 4,
    "la liga": 4,
    "league": 4,
}

COMPETITION_STAGE_WEIGHT = {
    "final": 10,
    "semi-final": 9, "semifinal": 9, "semi final": 9,
    "quarter-final": 8, "quarterfinal": 8, "quarter final": 8,
    "round of 16": 7,
    "round of 32": 5,
    "knockout": 7,
    "group": 3,
    "league stage": 4,
}


def _parse_date(date_str: str) -> datetime | None:
    if not date_str:
        return None
    s = str(date_str).strip()
    # Try Python's fromisoformat first (handles timezone offsets on 3.11+)
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt.replace(tzinfo=None)
    except (ValueError, TypeError):
        pass
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%d/%m/%Y", "%Y%m%d"):
        try:
            return datetime.strptime(s[:max(len(s), 19)], fmt)
        except (ValueError, TypeError):
            continue
    log.warning("Could not parse date: %s", date_str)
    return None


def _competition_base_priority(name: str) -> int:
    name_lower = name.lower()
    for key, prio in COMPETITION_PRIORITY.items():
        if key in name_lower:
            return prio
    return 2


def _stage_weight(stage_or_round: str) -> int:
    stage_lower = str(stage_or_round).lower()
    for key, weight in COMPETITION_STAGE_WEIGHT.items():
        if key in stage_lower:
            return weight
    return 3


def _extract_fixtures_from_team(team_data: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract all fixtures (past + future) from team data, across all competitions."""
    fixtures = []

    fixtures_data = team_data.get("fixtures", team_data.get("schedule", {}))
    if not fixtures_data:
        return fixtures

    all_fixtures = []
    if isinstance(fixtures_data, dict):
        all_fixtures = fixtures_data.get("allFixtures", fixtures_data.get("fixtures", []))
        if isinstance(all_fixtures, dict):
            all_fixtures = all_fixtures.get("fixtures", all_fixtures.get("matches", []))
    elif isinstance(fixtures_data, list):
        all_fixtures = fixtures_data

    for f in all_fixtures:
        if not isinstance(f, dict):
            continue

        opponent = f.get("opponent", {})
        if isinstance(opponent, dict):
            opp_name = opponent.get("name", opponent.get("shortName", "?"))
            opp_id = opponent.get("id", "")
        else:
            opp_name = str(opponent)
            opp_id = ""

        status = f.get("status", {})
        if isinstance(status, dict):
            utc = status.get("utcTime", "")
            finished = status.get("finished", False)
            started = status.get("started", False)
            score = status.get("scoreStr", "")
            result_str = status.get("reason", {}).get("short", "") if isinstance(status.get("reason"), dict) else ""
        else:
            utc = f.get("utcTime", f.get("matchDate", ""))
            finished = f.get("finished", False)
            started = f.get("started", False)
            score = f.get("scoreStr", f.get("score", ""))
            result_str = ""

        # Competition info
        tournament = f.get("tournament", f.get("league", {}))
        if isinstance(tournament, dict):
            comp_name = tournament.get("name", tournament.get("leagueName", "?"))
            comp_id = tournament.get("leagueId", tournament.get("id", ""))
        else:
            comp_name = str(tournament) if tournament else "?"
            comp_id = ""

        round_info = f.get("round", f.get("roundName", f.get("stage", "")))
        home_val = f.get("home", f.get("isHome"))
        home_away = "H" if home_val is True else ("A" if home_val is False else "?")
        match_id = f.get("id", f.get("matchId", ""))

        fixtures.append({
            "date": utc,
            "date_parsed": _parse_date(utc),
            "opponent": opp_name,
            "opponent_id": opp_id,
            "competition": comp_name,
            "competition_id": comp_id,
            "round": str(round_info),
            "home_away": home_away,
            "finished": finished,
            "started": started,
            "score": score,
            "result": result_str,
            "match_id": match_id,
        })

    fixtures.sort(key=lambda x: x["date"] or "")
    return fixtures


def print_competition_analysis(team_data: dict[str, Any]) -> None:
    name = team_data.get("details", {}).get("name", "Unknown")
    team_id = team_data.get("details", {}).get("id", "?")

    print(f"\n{'=' * 80}")
    print(f"  ANÁLISIS MULTI-COMPETICIÓN — {name}")
    print(f"{'=' * 80}")

    fixtures = _extract_fixtures_from_team(team_data)
    if not fixtures:
        print("  No fixture data available.")
        return

    now = datetime.now()

    # ── Split by competition ──
    by_comp: dict[str, list] = defaultdict(list)
    for f in fixtures:
        by_comp[f["competition"]].append(f)

    # ── 1. Competitions overview ──
    print(f"\n  {'─' * 75}")
    print(f"  COMPETICIONES EN JUEGO")
    print(f"  {'─' * 75}")

    comp_summaries = []
    for comp_name, matches in by_comp.items():
        played = [m for m in matches if m["finished"]]
        upcoming = [m for m in matches if not m["finished"] and not m["started"]]
        wins = sum(1 for m in played if m["result"] and m["result"][0].upper() in ("W", "V"))
        draws = sum(1 for m in played if m["result"] and m["result"][0].upper() in ("D", "E"))
        losses = sum(1 for m in played if m["result"] and m["result"][0].upper() in ("L", "P"))
        is_laliga = "laliga" in comp_name.lower() or "la liga" in comp_name.lower() or comp_name == "League"

        last_round = ""
        next_round = ""
        if played:
            last_round = played[-1].get("round", "")
        if upcoming:
            next_round = upcoming[0].get("round", "")

        base_prio = _competition_base_priority(comp_name)
        stage_w = _stage_weight(next_round or last_round)
        total_prio = base_prio + stage_w

        comp_summaries.append({
            "name": comp_name,
            "played": len(played),
            "upcoming": len(upcoming),
            "wins": wins, "draws": draws, "losses": losses,
            "is_laliga": is_laliga,
            "last_round": last_round,
            "next_round": next_round,
            "priority_score": total_prio,
            "base_prio": base_prio,
            "next_match": upcoming[0] if upcoming else None,
            "matches": matches,
        })

    comp_summaries.sort(key=lambda x: -x["priority_score"])

    print(f"\n    {'Competición':<30} {'PJ':>3} {'G':>3} {'E':>3} {'P':>3} {'Pend':>5} {'Fase':>20} {'Prio':>5}")
    print(f"    {'-' * 78}")

    for cs in comp_summaries:
        phase = cs["next_round"] or cs["last_round"] or "—"
        print(
            f"    {cs['name']:<30} "
            f"{cs['played']:>3} "
            f"{cs['wins']:>3} "
            f"{cs['draws']:>3} "
            f"{cs['losses']:>3} "
            f"{cs['upcoming']:>5} "
            f"{str(phase):>20} "
            f"{cs['priority_score']:>5}"
        )

    # ── 2. Upcoming fixture density (next 30 days) ──
    upcoming_all = [f for f in fixtures if not f["finished"] and f["date_parsed"]]
    upcoming_30d = [f for f in upcoming_all if f["date_parsed"] and (f["date_parsed"] - now).days <= 30 and (f["date_parsed"] - now).days >= 0]

    print(f"\n  {'─' * 75}")
    print(f"  CALENDARIO PRÓXIMOS 30 DÍAS ({len(upcoming_30d)} partidos)")
    print(f"  {'─' * 75}")

    if upcoming_30d:
        print(f"\n    {'Fecha':<20} {'Comp':<25} {'H/A':>3} {'Rival':<20} {'Ronda':<15}")
        print(f"    {'-' * 85}")

        prev_date = None
        for f in upcoming_30d:
            d = f["date_parsed"]
            date_str = d.strftime("%Y-%m-%d %H:%M") if d else "TBD"
            days_gap = ""
            if prev_date and d:
                gap = (d - prev_date).days
                if gap <= CONGESTION_HIGH_DAYS:
                    days_gap = f" ⚠️{gap}d"
                elif gap <= CONGESTION_MODERATE_DAYS:
                    days_gap = f" ({gap}d)"
            prev_date = d

            print(
                f"    {date_str:<20} "
                f"{f['competition']:<25} "
                f"{f['home_away']:>3} "
                f"{f['opponent']:<20} "
                f"{f['round']:<15}"
                f"{days_gap}"
            )

        # Congestion analysis
        if len(upcoming_30d) >= 2:
            gaps = []
            for i in range(1, len(upcoming_30d)):
                d1 = upcoming_30d[i - 1]["date_parsed"]
                d2 = upcoming_30d[i]["date_parsed"]
                if d1 and d2:
                    gaps.append((d2 - d1).days)

            if gaps:
                avg_gap = sum(gaps) / len(gaps)
                min_gap = min(gaps)
                congested_pairs = sum(1 for g in gaps if g <= 3)

                print(f"\n    Densidad de partidos:")
                print(f"      Partidos en 30 días:      {len(upcoming_30d)}")
                print(f"      Media días entre partidos: {avg_gap:.1f}")
                print(f"      Mínimo días entre partidos: {min_gap}")
                print(f"      Pares con ≤3 días:         {congested_pairs}")

                if avg_gap < 4:
                    print(f"      ⚠️  CONGESTIÓN ALTA — rotación muy probable")
                elif avg_gap < 5:
                    print(f"      ⚠️  Congestión moderada — rotación esperada en copas")
                else:
                    print(f"      ✅ Calendario manejable")
    else:
        print("    No upcoming fixtures in next 30 days.")

    # ── 3. Priority analysis: Liga vs other competitions ──
    laliga_comp = [cs for cs in comp_summaries if cs["is_laliga"]]
    other_comps = [cs for cs in comp_summaries if not cs["is_laliga"] and cs["upcoming"] > 0]

    if laliga_comp and other_comps:
        print(f"\n  {'─' * 75}")
        print(f"  ANÁLISIS DE PRIORIDADES: LIGA vs OTRAS COMPETICIONES")
        print(f"  {'─' * 75}")

        liga = laliga_comp[0]
        top_other = max(other_comps, key=lambda x: x["priority_score"])

        print(f"\n    LaLiga:")
        print(f"      Partidos jugados:  {liga['played']}")
        print(f"      Partidos restantes: {liga['upcoming']}")
        print(f"      Puntuación prio:   {liga['priority_score']}")

        print(f"\n    Competición rival principal: {top_other['name']}")
        print(f"      Fase actual:       {top_other['next_round'] or top_other['last_round'] or '?'}")
        print(f"      Partidos restantes: {top_other['upcoming']}")
        print(f"      Puntuación prio:   {top_other['priority_score']}")

        # Determine which one they're likely prioritizing
        if top_other["priority_score"] > liga["priority_score"] + 2:
            print(f"\n    📊 CONCLUSIÓN: {name} probablemente PRIORIZA {top_other['name']}")
            print(f"       sobre LaLiga en las próximas jornadas.")
            print(f"       → Esperar ROTACIÓN en partidos de Liga")
            print(f"       → Titulares reservados para {top_other['name']}")
        elif liga["priority_score"] > top_other["priority_score"] + 2:
            print(f"\n    📊 CONCLUSIÓN: {name} probablemente PRIORIZA LaLiga")
            print(f"       → Alineación fuerte en Liga")
            print(f"       → Rotación en {top_other['name']}")
        else:
            print(f"\n    📊 CONCLUSIÓN: Prioridad EQUILIBRADA entre competiciones")
            print(f"       → Rotación selectiva según calendario")
            print(f"       → Gestión de minutos clave")

        # Cross-check: interleaved fixtures
        next_fixtures = upcoming_30d[:8]
        if next_fixtures:
            print(f"\n    Secuencia próximos partidos:")
            liga_matches_upcoming = []
            other_matches_upcoming = []
            for i, f in enumerate(next_fixtures):
                is_liga = "laliga" in f["competition"].lower() or "la liga" in f["competition"].lower() or f["competition"] == "League"
                marker = "⚽ LIGA" if is_liga else f"🏆 {f['competition']}"
                d = f["date_parsed"]
                date_s = d.strftime("%a %d/%m") if d else "TBD"
                print(f"      {i+1}. {date_s}  {marker:<30} vs {f['opponent']} ({f['home_away']})")
                if is_liga:
                    liga_matches_upcoming.append(f)
                else:
                    other_matches_upcoming.append(f)

            # Rotation prediction
            if liga_matches_upcoming and other_matches_upcoming:
                print(f"\n    🔄 PREDICCIÓN DE ROTACIÓN:")
                for lm in liga_matches_upcoming[:3]:
                    ld = lm["date_parsed"]
                    if not ld:
                        continue
                    near_other = [om for om in other_matches_upcoming
                                  if om["date_parsed"] and abs((om["date_parsed"] - ld).days) <= 4]
                    if near_other:
                        om = near_other[0]
                        gap = abs((om["date_parsed"] - ld).days) if om["date_parsed"] else "?"
                        om_prio = _competition_base_priority(om["competition"]) + _stage_weight(om["round"])
                        liga_prio = _competition_base_priority("laliga") + _stage_weight(lm["round"])

                        lm_date = ld.strftime("%d/%m")
                        if om_prio > liga_prio:
                            print(f"       Liga {lm_date} vs {lm['opponent']}: ROTACIÓN PROBABLE")
                            print(f"         → Solo {gap}d antes/después de {om['competition']} ({om['round']})")
                            print(f"         → Titulares reservados para {om['competition']}")
                        elif gap <= 3:
                            print(f"       Liga {lm_date} vs {lm['opponent']}: ROTACIÓN POSIBLE")
                            print(f"         → {gap}d de {om['competition']} — fatiga acumulada")
                        else:
                            print(f"       Liga {lm_date} vs {lm['opponent']}: Alineación normal esperada")
                            print(f"         → {gap}d de margen desde {om['competition']}")

    elif laliga_comp and not other_comps:
        print(f"\n  {'─' * 75}")
        print(f"  ANÁLISIS DE PRIORIDADES")
        print(f"  {'─' * 75}")
        print(f"\n    ✅ {name} solo compite en LaLiga (o ya eliminado de copas)")
        print(f"       → Sin rotación por otras competiciones")
        print(f"       → Alineación tipo esperada cada jornada")

    # ── 4. Recent results across all competitions ──
    recent_all = [f for f in fixtures if f["finished"]]
    if recent_all:
        last_10 = recent_all[-10:]
        print(f"\n  {'─' * 75}")
        print(f"  ÚLTIMOS 10 PARTIDOS (TODAS LAS COMPETICIONES)")
        print(f"  {'─' * 75}")

        print(f"\n    {'Fecha':<12} {'Comp':<22} {'H/A':>3} {'Rival':<20} {'Score':<7} {'Res':>3}")
        print(f"    {'-' * 72}")

        for f in last_10:
            d = f["date_parsed"]
            date_s = d.strftime("%Y-%m-%d") if d else "?"
            comp_short = f["competition"][:21]
            res = f["result"][:1].upper() if f["result"] else "—"
            print(
                f"    {date_s:<12} "
                f"{comp_short:<22} "
                f"{f['home_away']:>3} "
                f"{f['opponent']:<20} "
                f"{f['score']:<7} "
                f"{res:>3}"
            )

        # Cross-competition form
        results_all = [f["result"][:1].upper() for f in last_10 if f["result"]]
        w = sum(1 for r in results_all if r in ("W", "V"))
        d_count = sum(1 for r in results_all if r in ("D", "E"))
        l_count = sum(1 for r in results_all if r in ("L", "P"))
        print(f"\n    Forma global: {w}W {d_count}D {l_count}L")


# ──────────────────────────────────────────────
# 3. Match details
# ──────────────────────────────────────────────

def get_match_details(match_id: int) -> dict[str, Any]:
    return _get("matchDetails", {"matchId": match_id})


def print_match_summary(match: dict[str, Any]) -> None:
    general = match.get("general", {})
    home = general.get("homeTeam", {})
    away = general.get("awayTeam", {})
    content = match.get("content", {})

    home_name = home.get("name", "Home")
    away_name = away.get("name", "Away")
    home_id = home.get("id", "")
    away_id = away.get("id", "")

    header = match.get("header", {})
    teams_header = header.get("teams", [])
    home_score = teams_header[0].get("score", "?") if len(teams_header) > 0 else "?"
    away_score = teams_header[1].get("score", "?") if len(teams_header) > 1 else "?"

    utc_date = general.get("matchTimeUTCDate", "")
    started = general.get("started", False)
    finished = general.get("finished", False)
    state = "Finished" if finished else ("Live" if started else utc_date[:10] if utc_date else "Scheduled")

    league_name = general.get("leagueName", general.get("parentLeagueName", ""))
    round_info = general.get("matchRound", general.get("round", ""))
    stadium = general.get("stadiumName", general.get("venue", ""))
    referee = general.get("referee", {})
    ref_name = referee.get("text", referee.get("name", "")) if isinstance(referee, dict) else str(referee)

    print(f"\n{'=' * 70}")
    print(f"  {home_name} {home_score} - {away_score} {away_name}")
    print(f"{'=' * 70}")
    print(f"    Estado: {state}")
    if league_name:
        print(f"    Competición: {league_name} — {round_info}")
    if utc_date:
        print(f"    Fecha: {utc_date[:16]}")
    if stadium:
        print(f"    Estadio: {stadium}")
    if ref_name:
        print(f"    Árbitro: {ref_name}")

    # ── Events (goals, cards, subs) ──
    match_facts = content.get("matchFacts", {})
    events = match_facts.get("events", {})
    if isinstance(events, dict):
        events_list = events.get("events", [])
    elif isinstance(events, list):
        events_list = events
    else:
        events_list = []

    if events_list:
        print(f"\n  {'─' * 65}")
        print(f"  EVENTOS")
        print(f"  {'─' * 65}")

        event_icons = {
            "Goal": "⚽", "OwnGoal": "⚽🔴", "Penalty": "⚽(P)",
            "MissedPenalty": "❌(P)", "YellowCard": "🟨", "RedCard": "🟥",
            "SecondYellow": "🟨🟥", "Substitution": "🔄",
        }

        for ev in events_list:
            time_val = ev.get("time", ev.get("timeStr", ev.get("min", "?")))
            etype = ev.get("type", ev.get("eventType", ""))
            player = ev.get("nameStr", ev.get("playerName", ev.get("player", "")))
            team_side = ev.get("isHome", None)
            side_str = f"[{home_name[:3]}]" if team_side is True else f"[{away_name[:3]}]" if team_side is False else ""
            icon = event_icons.get(etype, etype)
            assist = ev.get("assistStr", ev.get("assist", ""))
            assist_str = f" (asist: {assist})" if assist else ""
            swap = ev.get("swap", ev.get("substitutedPlayer", ""))
            swap_str = f" ↓ {swap}" if swap else ""

            if player or etype:
                print(f"    {str(time_val):>5}'  {icon:<8} {player}{assist_str}{swap_str}  {side_str}")

    # ── Lineups ──
    lineups = content.get("lineup", content.get("lineups", {}))
    if isinstance(lineups, dict):
        lineup_list = [lineups.get("homeTeam", lineups.get("lineup", [None]))]
        away_lineup = lineups.get("awayTeam")
        if away_lineup:
            lineup_list.append(away_lineup)
    elif isinstance(lineups, list):
        lineup_list = lineups
    else:
        lineup_list = []

    if lineup_list:
        print(f"\n  {'─' * 65}")
        print(f"  ALINEACIONES")
        print(f"  {'─' * 65}")

        team_names = [home_name, away_name]
        for idx, lineup in enumerate(lineup_list[:2]):
            if not lineup or not isinstance(lineup, dict):
                continue
            t_name = team_names[idx] if idx < len(team_names) else f"Team {idx+1}"
            formation = lineup.get("formation", lineup.get("lineup", ""))
            coach = lineup.get("coach", lineup.get("manager", {}))
            coach_name = coach.get("name", "") if isinstance(coach, dict) else str(coach)

            print(f"\n    {t_name} ({formation})")
            if coach_name:
                print(f"    Entrenador: {coach_name}")

            # Starters
            starters = lineup.get("players", lineup.get("starters", []))
            if isinstance(starters, list):
                # FotMob sometimes nests by position rows
                flat_starters = []
                for item in starters:
                    if isinstance(item, list):
                        flat_starters.extend(item)
                    elif isinstance(item, dict):
                        if "players" in item:
                            flat_starters.extend(item["players"])
                        else:
                            flat_starters.append(item)

                if flat_starters:
                    print(f"    Titulares:")
                    for p in flat_starters:
                        if not isinstance(p, dict):
                            continue
                        pname = p.get("name", p.get("shortName", "?"))
                        number = p.get("shirt", p.get("shirtNumber", ""))
                        rating = p.get("rating", p.get("performanceRating", ""))
                        pos = p.get("position", p.get("role", ""))
                        events_p = p.get("events", {})

                        extras = []
                        if isinstance(events_p, dict):
                            if events_p.get("g", events_p.get("goals")):
                                extras.append(f"⚽{events_p.get('g', events_p.get('goals'))}")
                            if events_p.get("as", events_p.get("assists")):
                                extras.append(f"🅰️{events_p.get('as', events_p.get('assists'))}")
                            if events_p.get("yc", events_p.get("yellowCard")):
                                extras.append("🟨")
                            if events_p.get("rc", events_p.get("redCard")):
                                extras.append("🟥")
                            if events_p.get("sub", events_p.get("subbedOut")):
                                sub_info = events_p.get("sub", events_p.get("subbedOut", {}))
                                sub_min = sub_info.get("time", "") if isinstance(sub_info, dict) else ""
                                extras.append(f"↓{sub_min}'")

                        rating_str = f" [{rating}]" if rating else ""
                        num_str = f"#{number}" if number else "  "
                        extras_str = f"  {'  '.join(extras)}" if extras else ""
                        print(f"      {num_str:>4} {pname:<25} {pos:<10}{rating_str}{extras_str}")

            # Subs
            bench = lineup.get("bench", lineup.get("subs", lineup.get("substitutes", [])))
            if isinstance(bench, list) and bench:
                print(f"    Suplentes:")
                for p in bench:
                    if not isinstance(p, dict):
                        continue
                    pname = p.get("name", p.get("shortName", "?"))
                    number = p.get("shirt", p.get("shirtNumber", ""))
                    rating = p.get("rating", p.get("performanceRating", ""))
                    events_p = p.get("events", {})
                    sub_in = ""
                    if isinstance(events_p, dict) and events_p.get("sub", events_p.get("subbedIn")):
                        sub_info = events_p.get("sub", events_p.get("subbedIn", {}))
                        sub_min = sub_info.get("time", "") if isinstance(sub_info, dict) else ""
                        sub_in = f" ↑{sub_min}'"

                    num_str = f"#{number}" if number else "  "
                    rating_str = f" [{rating}]" if rating else ""
                    print(f"      {num_str:>4} {pname:<25}{sub_in}{rating_str}")

    # ── Team stats comparison ──
    stats_section = content.get("stats", content.get("matchStats", content.get("teamStats", {})))
    stats_list = []
    if isinstance(stats_section, dict):
        stats_list = stats_section.get("stats", stats_section.get("Ede", []))
        if not isinstance(stats_list, list):
            stats_list = [stats_section]
    elif isinstance(stats_section, list):
        stats_list = stats_section

    parsed_stats = []
    for group in stats_list:
        if isinstance(group, dict):
            title = group.get("title", group.get("header", ""))
            stat_items = group.get("stats", group.get("items", []))
            if isinstance(stat_items, list):
                for item in stat_items:
                    if isinstance(item, dict):
                        stat_name = item.get("title", item.get("key", item.get("name", "?")))
                        stats_vals = item.get("stats", [item.get("home", "?"), item.get("away", "?")])
                        if isinstance(stats_vals, list) and len(stats_vals) >= 2:
                            home_val = stats_vals[0] if not isinstance(stats_vals[0], dict) else stats_vals[0].get("value", stats_vals[0].get("stat", "?"))
                            away_val = stats_vals[1] if not isinstance(stats_vals[1], dict) else stats_vals[1].get("value", stats_vals[1].get("stat", "?"))
                            parsed_stats.append((stat_name, home_val, away_val))
                        elif isinstance(stats_vals, dict):
                            parsed_stats.append((stat_name, stats_vals.get("home", "?"), stats_vals.get("away", "?")))

    if parsed_stats:
        print(f"\n  {'─' * 65}")
        print(f"  ESTADÍSTICAS DEL PARTIDO")
        print(f"  {'─' * 65}")
        print(f"    {home_name:>25}  {'Stat':^20}  {away_name:<25}")
        print(f"    {'-' * 65}")

        for stat_name, h_val, a_val in parsed_stats:
            h_str = str(h_val) if h_val is not None else "—"
            a_str = str(a_val) if a_val is not None else "—"
            print(f"    {h_str:>25}  {stat_name:^20}  {a_str:<25}")

    # ── Man of the match ──
    motm = match_facts.get("playerOfTheMatch", match_facts.get("manOfTheMatch", {}))
    if isinstance(motm, dict) and motm:
        motm_name = motm.get("name", motm.get("shortName", ""))
        motm_rating = motm.get("rating", motm.get("performanceRating", ""))
        motm_team = motm.get("teamName", "")
        if motm_name:
            print(f"\n    ⭐ Man of the Match: {motm_name} ({motm_team}) — Rating: {motm_rating}")

    # ── Match momentum / xG timeline ──
    momentum = content.get("momentum", {})
    if isinstance(momentum, dict):
        main_data = momentum.get("main", {})
        if isinstance(main_data, dict):
            data_points = main_data.get("data", [])
            if data_points:
                print(f"\n    Momentum: {len(data_points)} data points available (use match-json for raw data)")

    # ── xG ──
    xg = match_facts.get("xg", {})
    if isinstance(xg, dict) and xg:
        home_xg = xg.get("home", xg.get("homeXg", ""))
        away_xg = xg.get("away", xg.get("awayXg", ""))
        if home_xg or away_xg:
            print(f"\n    xG:  {home_name} {home_xg} — {away_xg} {away_name}")

    # ── Top performers (all player ratings) ──
    player_ratings = []
    if lineup_list:
        for idx, lineup in enumerate(lineup_list[:2]):
            if not lineup or not isinstance(lineup, dict):
                continue
            t_name = team_names[idx] if idx < len(team_names) else "?"
            all_players = []
            starters = lineup.get("players", lineup.get("starters", []))
            bench = lineup.get("bench", lineup.get("subs", []))
            if isinstance(starters, list):
                for item in starters:
                    if isinstance(item, list):
                        all_players.extend(item)
                    elif isinstance(item, dict):
                        if "players" in item:
                            all_players.extend(item["players"])
                        else:
                            all_players.append(item)
            if isinstance(bench, list):
                all_players.extend(bench)

            for p in all_players:
                if isinstance(p, dict):
                    rating = p.get("rating", p.get("performanceRating"))
                    if rating:
                        try:
                            player_ratings.append((float(str(rating).replace(",", ".")), p.get("name", "?"), t_name))
                        except (ValueError, TypeError):
                            pass

    if player_ratings:
        player_ratings.sort(key=lambda x: -x[0])
        print(f"\n  {'─' * 65}")
        print(f"  MEJORES RENDIMIENTOS")
        print(f"  {'─' * 65}")
        for rating, pname, tname in player_ratings[:10]:
            print(f"    {rating:>5.1f}  {pname:<25} ({tname})")


def dump_match_json(match: dict[str, Any]) -> None:
    print(json.dumps(match, indent=2, ensure_ascii=False, default=str))


# ──────────────────────────────────────────────
# 3b. Head-to-head
# ──────────────────────────────────────────────

def print_head_to_head(team1_id: int, team2_id: int) -> None:
    """Show head-to-head history from both teams' fixture data."""
    print(f"\n  Fetching team data...")
    t1_data = get_team_data(team1_id)
    _delay()
    t2_data = get_team_data(team2_id)

    t1_name = t1_data.get("details", {}).get("name", f"Team {team1_id}")
    t2_name = t2_data.get("details", {}).get("name", f"Team {team2_id}")

    print(f"\n{'=' * 70}")
    print(f"  HEAD TO HEAD: {t1_name} vs {t2_name}")
    print(f"{'=' * 70}")

    # Get fixtures from team1 and find matches against team2
    fixtures = _extract_fixtures_from_team(t1_data)
    t2_norm = _normalize(t2_name)

    h2h = []
    for f in fixtures:
        opp_norm = _normalize(f["opponent"])
        if t2_norm in opp_norm or opp_norm in t2_norm:
            h2h.append(f)
        elif any(w in opp_norm for w in t2_norm.split() if len(w) > 3):
            h2h.append(f)

    if not h2h:
        print(f"\n  No head-to-head matches found this season.")
        print(f"  (Only current season fixtures are available)")
        return

    played = [m for m in h2h if m["finished"]]
    upcoming = [m for m in h2h if not m["finished"]]

    if played:
        print(f"\n  {'─' * 65}")
        print(f"  RESULTADOS ({len(played)} partidos)")
        print(f"  {'─' * 65}")

        t1_wins = 0
        t2_wins = 0
        draws = 0
        t1_goals = 0
        t2_goals = 0

        print(f"\n    {'Fecha':<12} {'Comp':<22} {'H/A':>3} {'Score':<8} {'Res':>3}")
        print(f"    {'-' * 55}")

        for m in played:
            d = m["date_parsed"]
            date_s = d.strftime("%Y-%m-%d") if d else "?"
            comp = m["competition"][:21]
            res = m["result"][:1].upper() if m["result"] else "—"

            if res in ("W", "V"):
                t1_wins += 1
            elif res in ("L", "P"):
                t2_wins += 1
            elif res in ("D", "E"):
                draws += 1

            # Parse score
            sh, sa = _parse_score(m["score"])
            if sh is not None and sa is not None and m["home_away"] != "?":
                if m["home_away"] == "H":
                    t1_goals += sh
                    t2_goals += sa
                else:
                    t1_goals += sa
                    t2_goals += sh

            print(f"    {date_s:<12} {comp:<22} {m['home_away']:>3} {str(m['score']):<8} {res:>3}")

        print(f"\n    Resumen:")
        print(f"      {t1_name}: {t1_wins} victorias, {t1_goals} goles")
        print(f"      {t2_name}: {t2_wins} victorias, {t2_goals} goles")
        print(f"      Empates: {draws}")

    if upcoming:
        print(f"\n  {'─' * 65}")
        print(f"  PRÓXIMOS ENFRENTAMIENTOS")
        print(f"  {'─' * 65}")
        for m in upcoming:
            d = m["date_parsed"]
            date_s = d.strftime("%Y-%m-%d %H:%M") if d else "TBD"
            print(f"    {date_s}  {m['competition']}  ({m['home_away']})")


# ──────────────────────────────────────────────
# 4. Player data — FULL STATISTICS
# ──────────────────────────────────────────────

def get_player_data(player_id: int) -> dict[str, Any]:
    data = _get("playerData", {"id": player_id})
    resp_id = data.get("id")
    if resp_id is not None and resp_id != player_id:
        log.warning("Requested player %s but got %s", player_id, resp_id)
    return data


def _print_section(title: str, width: int = 70) -> None:
    print(f"\n  {'─' * width}")
    print(f"  {title}")
    print(f"  {'─' * width}")


def _extract_stat_items(stat_block: dict | list) -> list[tuple[str, Any]]:
    """Extract (key, value) pairs from various FotMob stat structures."""
    items = []
    if isinstance(stat_block, dict):
        for k, v in stat_block.items():
            if k in ("fetchAllStatLinks", "type", "key"):
                continue
            if isinstance(v, (str, int, float, bool)):
                items.append((k, v))
            elif isinstance(v, dict):
                val = v.get("value", v.get("stat", v.get("total")))
                if val is not None:
                    label = v.get("title", v.get("key", k))
                    items.append((label, val))
                else:
                    for sk, sv in v.items():
                        if isinstance(sv, (str, int, float)):
                            items.append((f"{k}.{sk}", sv))
            elif isinstance(v, list):
                for i, elem in enumerate(v):
                    if isinstance(elem, dict):
                        title = elem.get("title", elem.get("key", f"{k}[{i}]"))
                        value = elem.get("value", elem.get("stat", elem.get("total")))
                        if value is not None:
                            items.append((title, value))
                        else:
                            for ek, ev in elem.items():
                                if isinstance(ev, (str, int, float)):
                                    items.append((f"{title}.{ek}", ev))
    elif isinstance(stat_block, list):
        for elem in stat_block:
            if isinstance(elem, dict):
                title = elem.get("title", elem.get("key", "?"))
                value = elem.get("value", elem.get("stat", elem.get("total")))
                if value is not None:
                    items.append((title, value))
    return items


def print_player_profile(player: dict[str, Any]) -> None:
    name = player.get("name", "Unknown")
    team = player.get("primaryTeam", {}).get("teamName", "?")
    team_id = player.get("primaryTeam", {}).get("teamId", "?")
    pos_desc = player.get("positionDescription", {})
    primary_pos = pos_desc.get("primaryPosition", {}).get("label", "?")
    secondary_pos = pos_desc.get("nonPrimaryPositions", [])
    player_id = player.get("id", "?")

    print(f"\n{'=' * 70}")
    print(f"  {name}")
    print(f"{'=' * 70}")

    # ── Bio / personal info ──
    _print_section("INFORMACIÓN PERSONAL")
    bio_fields = [
        ("ID FotMob", player_id),
        ("Equipo", f"{team} (ID: {team_id})"),
        ("Posición principal", primary_pos),
    ]
    if secondary_pos:
        sec_labels = [p.get("label", "?") for p in secondary_pos]
        bio_fields.append(("Posiciones secundarias", ", ".join(sec_labels)))

    meta = player.get("meta", {})
    if isinstance(meta, dict):
        for k in ("birthDate", "age", "height", "preferredFoot", "shirtNumber",
                   "country", "countryCode", "teamJoinedDate", "contractUntil"):
            val = meta.get(k)
            if val is not None:
                bio_fields.append((k, val))

    personal = player.get("playerInformation", [])
    if isinstance(personal, list):
        for item in personal:
            title = item.get("title", "")
            value = item.get("value", {})
            if isinstance(value, dict):
                val_str = value.get("fallback", value.get("numberValue", str(value)))
            else:
                val_str = value
            if title and val_str:
                bio_fields.append((title, val_str))

    for label, val in bio_fields:
        print(f"    {label:<30} {val}")

    # ── Performance score ──
    perf = player.get("performanceScore", {})
    if perf:
        _print_section("PUNTUACIÓN DE RENDIMIENTO")
        score = perf.get("value", "?")
        official = perf.get("officialRating", "?")
        print(f"    Score: {score}")
        if official and official != "?":
            print(f"    Official rating: {official}")

    # ── Main league season stats + per-90 ──
    main_league = player.get("mainLeague", {})
    league_name = main_league.get("leagueName", "Main League")
    stats = main_league.get("stats", [])
    if stats:
        _print_section(f"STATS TEMPORADA — {league_name}")
        minutes_played = None
        stat_values = {}
        for s in stats:
            title = s.get("title", "")
            value = s.get("value", "")
            if title and value is not None:
                print(f"    {title:<35} {value}")
                stat_values[title.lower()] = value
                if "minut" in title.lower() or "minutes" in title.lower():
                    try:
                        minutes_played = int(str(value).replace(",", "").replace(".", ""))
                    except (ValueError, TypeError):
                        pass

        # Per-90 normalization
        if minutes_played and minutes_played > 0:
            per90_factor = 90 / minutes_played
            _print_section("PER-90 STATS")
            per90_keys = ["goals", "assists", "goles", "asistencias", "expected goals (xg)",
                          "expected assists (xa)", "shots", "tiros", "key passes", "pases clave",
                          "tackles", "entradas", "interceptions", "intercepciones",
                          "chances created", "ocasiones creadas", "dribbles", "regates"]
            for s in stats:
                title = s.get("title", "")
                value = s.get("value", "")
                if title.lower() in per90_keys or any(k in title.lower() for k in ["goal", "gol", "assist", "shot", "tiro", "pass", "tackle", "dribble"]):
                    try:
                        num_val = float(str(value).replace(",", ""))
                        p90 = num_val * per90_factor
                        print(f"    {title + '/90':<35} {p90:.2f}")
                    except (ValueError, TypeError):
                        pass

    # ── Detailed stat sections (shotmap, passing, defending, etc.) ──
    stat_seasons = player.get("statSeasons", [])
    if stat_seasons:
        _print_section("TEMPORADAS DISPONIBLES")
        for ss in stat_seasons:
            sname = ss.get("seasonName", "?")
            tournaments = ss.get("tournaments", [])
            for t in tournaments:
                tname = t.get("name", "?")
                tid = t.get("tournamentId", "?")
                print(f"    {sname} — {tname} (ID: {tid})")

    # ── Per-season detailed stats ──
    season_stats = player.get("seasonStatLinks", [])
    if season_stats:
        _print_section("LINKS STATS POR TEMPORADA")
        for sl in season_stats:
            print(f"    {sl}")

    # ── Career stats / history ──
    career = player.get("careerStatistics", player.get("careerHistory", {}))
    if career:
        _print_section("ESTADÍSTICAS DE CARRERA")
        if isinstance(career, dict):
            career_sections = career.get("sections", career.get("careerItems", {}))
            if isinstance(career_sections, dict):
                for section_name, section_data in career_sections.items():
                    print(f"\n    [{section_name}]")
                    items = _extract_stat_items(section_data)
                    for label, val in items:
                        print(f"      {label:<35} {val}")
            elif isinstance(career_sections, list):
                for section in career_sections:
                    sec_title = section.get("title", section.get("name", "Section"))
                    print(f"\n    [{sec_title}]")
                    entries = section.get("entries", section.get("items", section.get("stats", [])))
                    if isinstance(entries, list):
                        for entry in entries:
                            if isinstance(entry, dict):
                                team_name = entry.get("teamName", entry.get("team", ""))
                                comp = entry.get("tournamentName", entry.get("competition", ""))
                                apps = entry.get("appearances", entry.get("matches", ""))
                                goals = entry.get("goals", "")
                                assists = entry.get("assists", "")
                                line = f"      {team_name:<20} {comp:<20}"
                                if apps != "":
                                    line += f" Apps:{apps}"
                                if goals != "":
                                    line += f" G:{goals}"
                                if assists != "":
                                    line += f" A:{assists}"
                                print(line)
            else:
                items = _extract_stat_items(career)
                for label, val in items:
                    print(f"      {label:<35} {val}")
        elif isinstance(career, list):
            for entry in career:
                if isinstance(entry, dict):
                    items = _extract_stat_items(entry)
                    for label, val in items:
                        print(f"      {label:<35} {val}")

    # ── Career history (transfers / clubs) ──
    history = player.get("careerHistory", {})
    if history and history != career:
        _print_section("HISTORIAL DE CARRERA")
        if isinstance(history, dict):
            items = history.get("careerItems", history.get("sections", []))
            if isinstance(items, dict):
                for section_name, section_data in items.items():
                    print(f"\n    [{section_name}]")
                    if isinstance(section_data, list):
                        for entry in section_data:
                            team = entry.get("teamName", entry.get("team", "?"))
                            period = entry.get("period", "")
                            print(f"      {team:<25} {period}")
            elif isinstance(items, list):
                for item in items:
                    if isinstance(item, dict):
                        team = item.get("teamName", item.get("team", "?"))
                        period = item.get("period", "")
                        apps = item.get("appearances", "")
                        goals = item.get("goals", "")
                        print(f"      {team:<25} {period}  Apps:{apps} G:{goals}")

    # ── National team stats ──
    national = player.get("nationalTeamStatistics", player.get("internationalStatistics", {}))
    if national:
        _print_section("SELECCIÓN NACIONAL")
        if isinstance(national, dict):
            items = _extract_stat_items(national)
            for label, val in items:
                print(f"    {label:<35} {val}")
        elif isinstance(national, list):
            for entry in national:
                items = _extract_stat_items(entry)
                for label, val in items:
                    print(f"    {label:<35} {val}")

    # ── Traits / strengths / weaknesses ──
    traits = player.get("traits", {})
    if traits:
        _print_section("CARACTERÍSTICAS")
        strengths = traits.get("strengths", [])
        weaknesses = traits.get("weaknesses", [])
        if strengths:
            print("    Fortalezas:")
            for t in strengths:
                if isinstance(t, dict):
                    print(f"      + {t.get('title', t.get('name', '?'))}: {t.get('value', '')}")
                else:
                    print(f"      + {t}")
        if weaknesses:
            print("    Debilidades:")
            for t in weaknesses:
                if isinstance(t, dict):
                    print(f"      - {t.get('title', t.get('name', '?'))}: {t.get('value', '')}")
                else:
                    print(f"      - {t}")

    # ── Recent form / match ratings — ESTADO DE FORMA ──
    recent = player.get("recentMatches", player.get("matchesWithRating", []))
    if recent and isinstance(recent, list):
        _print_section("ESTADO DE FORMA — ÚLTIMOS PARTIDOS")

        # Parse all match data
        parsed = []
        for m in recent[:20]:
            entry = {
                "date": m.get("matchDate", m.get("date", m.get("utcTime", "?"))),
                "opponent": m.get("opponentTeamName", m.get("opponent", m.get("opponentName", "?"))),
                "home_away": "🏠" if m.get("isHome", m.get("homeAway") == "home") else "✈️" if m.get("isHome") is False or m.get("homeAway") == "away" else "?",
                "result": m.get("result", m.get("matchResult", "")),
                "score": m.get("score", m.get("scoreStr", m.get("matchScore", ""))),
                "rating": m.get("rating", m.get("ratingValue", m.get("playerRating", None))),
                "mins": m.get("minutesPlayed", m.get("minutes", m.get("playedMinutes", "?"))),
                "starter": m.get("isStarting", m.get("isStarter", m.get("starter", None))),
                "sub_on": m.get("subOn", m.get("subbedOn", m.get("substituteIn", None))),
                "sub_off": m.get("subOff", m.get("subbedOff", m.get("substituteOut", None))),
                "goals": m.get("goals", m.get("g", 0)) or 0,
                "assists": m.get("assists", m.get("a", 0)) or 0,
                "yellow": m.get("yellowCards", m.get("yellowCard", m.get("yc", 0))) or 0,
                "red": m.get("redCards", m.get("redCard", m.get("rc", 0))) or 0,
                "motm": m.get("isManOfTheMatch", m.get("manOfTheMatch", m.get("motm", False))),
                "competition": m.get("leagueName", m.get("tournamentName", m.get("competition", ""))),
                "match_id": m.get("matchId", m.get("id", "")),
            }
            parsed.append(entry)

        # Sort by date (most recent first) to ensure correct trend analysis
        parsed.sort(key=lambda x: x["date"] or "", reverse=True)

        # ── Individual match lines ──
        print(f"\n    {'Fecha':<12} {'H/A':>3} {'Rival':<20} {'Score':<7} {'Res':>3} {'Rat':>5} {'Min':>4} {'G':>2} {'A':>2} {'TC':>3} {'Notas'}")
        print(f"    {'-' * 90}")

        for m in parsed:
            rating_str = f"{m['rating']:.1f}" if isinstance(m['rating'], (int, float)) else str(m['rating'] or "—")
            result_str = str(m['result'])[:1].upper() if m['result'] else "—"
            notes = []
            if m['starter'] is True:
                notes.append("TIT")
            elif m['starter'] is False:
                notes.append("SUP")
            if m['sub_on'] is not None and m['sub_on'] is not False:
                sub_min = f"{m['sub_on']}'" if isinstance(m['sub_on'], (int, float)) else ""
                notes.append(f"↑{sub_min}")
            if m['sub_off'] is not None and m['sub_off'] is not False:
                sub_min = f"{m['sub_off']}'" if isinstance(m['sub_off'], (int, float)) else ""
                notes.append(f"↓{sub_min}")
            if m['motm']:
                notes.append("⭐MOTM")
            if m['red']:
                notes.append("🟥")
            cards = ""
            if m['yellow']:
                cards = "🟨" * int(m['yellow'])
            if m['red']:
                cards += "🟥" * int(m['red'])
            if not cards:
                cards = "—"

            print(
                f"    {str(m['date']):<12} "
                f"{m['home_away']:>3} "
                f"{str(m['opponent']):<20} "
                f"{str(m['score']):<7} "
                f"{result_str:>3} "
                f"{rating_str:>5} "
                f"{str(m['mins']):>4} "
                f"{m['goals']:>2} "
                f"{m['assists']:>2} "
                f"{cards:>3} "
                f"{' '.join(notes)}"
            )

        # ── Form summary / analysis ──
        ratings = [m['rating'] for m in parsed if isinstance(m['rating'], (int, float))]
        total_goals = sum(m['goals'] for m in parsed)
        total_assists = sum(m['assists'] for m in parsed)
        total_yellows = sum(int(m['yellow']) for m in parsed if m['yellow'])
        total_reds = sum(int(m['red']) for m in parsed if m['red'])
        total_motm = sum(1 for m in parsed if m['motm'])
        starts = sum(1 for m in parsed if m['starter'] is True)
        subs = sum(1 for m in parsed if m['starter'] is False)
        mins_list = [m['mins'] for m in parsed if isinstance(m['mins'], (int, float))]
        results = [str(m['result'])[:1].upper() for m in parsed if m['result']]

        wins = results.count('W') + results.count('V')
        draws = results.count('D') + results.count('E')
        losses = results.count('L') + results.count('P')

        _print_section("RESUMEN DE FORMA")

        print(f"    Partidos analizados:   {len(parsed)}")
        if starts or subs:
            print(f"    Titular / Suplente:    {starts} / {subs}")
        if mins_list:
            print(f"    Minutos totales:       {sum(mins_list)}")
            print(f"    Media minutos/partido: {sum(mins_list) / len(mins_list):.0f}")

        if ratings:
            avg_rating = sum(ratings) / len(ratings)
            last_5 = ratings[:5]
            first_5 = ratings[-5:] if len(ratings) >= 10 else ratings[:len(ratings)//2] if len(ratings) >= 4 else []
            avg_last5 = sum(last_5) / len(last_5) if last_5 else 0
            avg_first5 = sum(first_5) / len(first_5) if first_5 else 0
            best = max(ratings)
            worst = min(ratings)

            print(f"\n    Rating medio:          {avg_rating:.2f}")
            print(f"    Mejor rating:          {best:.2f}")
            print(f"    Peor rating:           {worst:.2f}")

            if last_5:
                print(f"    Media últ. 5 partidos: {avg_last5:.2f}")
            if first_5 and avg_first5 > 0:
                trend = avg_last5 - avg_first5
                trend_arrow = "📈" if trend > TREND_THRESHOLD else "📉" if trend < -TREND_THRESHOLD else "➡️"
                print(f"    Tendencia:             {trend_arrow} {trend:+.2f} (últimos 5 vs anteriores)")

            # Consistency
            if len(ratings) >= 3:
                variance = sum((r - avg_rating) ** 2 for r in ratings) / len(ratings)
                std_dev = variance ** 0.5
                consistency = "Alta" if std_dev < CONSISTENCY_HIGH else "Media" if std_dev < CONSISTENCY_LOW else "Baja"
                print(f"    Consistencia:          {consistency} (σ={std_dev:.2f})")

            # Rating distribution
            elite = sum(1 for r in ratings if r >= RATING_ELITE)
            good = sum(1 for r in ratings if RATING_GOOD <= r < RATING_ELITE)
            avg = sum(1 for r in ratings if RATING_AVG <= r < RATING_GOOD)
            poor = sum(1 for r in ratings if r < RATING_AVG)
            print(f"    Distribución ratings:  ⭐≥{RATING_ELITE}:{elite}  ✅{RATING_GOOD}-{RATING_ELITE}:{good}  ➖{RATING_AVG}-{RATING_GOOD}:{avg}  ❌<{RATING_AVG}:{poor}")

        print(f"\n    Goles:                 {total_goals}")
        print(f"    Asistencias:           {total_assists}")
        print(f"    G+A:                   {total_goals + total_assists}")
        if len(parsed) > 0:
            print(f"    G+A por partido:       {(total_goals + total_assists) / len(parsed):.2f}")
        if total_motm:
            print(f"    Man of the Match:      {total_motm}x")
        if total_yellows or total_reds:
            print(f"    Tarjetas:              🟨{total_yellows}  🟥{total_reds}")

        if wins or draws or losses:
            total_res = wins + draws + losses
            win_pct = (wins / total_res * 100) if total_res > 0 else 0
            print(f"\n    Record con él:         {wins}W {draws}D {losses}L ({win_pct:.0f}% victorias)")

        # ── Form streak ──
        if results:
            streak_char = results[0]
            streak_count = 0
            for r in results:
                if r == streak_char:
                    streak_count += 1
                else:
                    break
            streak_labels = {"W": "victorias", "V": "victorias", "D": "empates", "E": "empates", "L": "derrotas", "P": "derrotas"}
            streak_label = streak_labels.get(streak_char, streak_char)
            print(f"    Racha actual:          {streak_count} {streak_label} consecutivas")

    # ── Shotmap ──
    shotmap = player.get("shotmap", [])
    if shotmap:
        _print_section(f"SHOTMAP ({len(shotmap)} tiros)")
        goals_sm = sum(1 for s in shotmap if s.get("eventType") == "Goal" or s.get("isGoal"))
        on_target = sum(1 for s in shotmap if s.get("onTarget") or s.get("eventType") in ("Goal", "SavedShot", "AttemptSaved"))
        blocked = sum(1 for s in shotmap if s.get("isBlocked") or s.get("eventType") == "BlockedShot")
        total_xg = sum(s.get("expectedGoals", s.get("xG", 0)) or 0 for s in shotmap)
        print(f"    Total tiros:      {len(shotmap)}")
        print(f"    Goles:            {goals_sm}")
        print(f"    A puerta:         {on_target}")
        print(f"    Bloqueados:       {blocked}")
        print(f"    xG total:         {total_xg:.2f}")
        if len(shotmap) > 0:
            print(f"    xG/tiro:          {total_xg / len(shotmap):.3f}")

        # Breakdown by situation
        situations = {}
        for s in shotmap:
            sit = s.get("situation", s.get("shotType", "Unknown"))
            situations[sit] = situations.get(sit, 0) + 1
        if situations:
            print("    Por situación:")
            for sit, count in sorted(situations.items(), key=lambda x: -x[1]):
                print(f"      {sit:<25} {count}")

        # Breakdown by body part
        body_parts = {}
        for s in shotmap:
            bp = s.get("bodyPart", "Unknown")
            body_parts[bp] = body_parts.get(bp, 0) + 1
        if body_parts:
            print("    Por parte del cuerpo:")
            for bp, count in sorted(body_parts.items(), key=lambda x: -x[1]):
                print(f"      {bp:<25} {count}")

    # ── Catch-all: dump any remaining top-level stat keys ──
    KNOWN_KEYS = {
        "name", "id", "primaryTeam", "positionDescription", "meta",
        "playerInformation", "performanceScore", "mainLeague", "statSeasons",
        "seasonStatLinks", "careerStatistics", "careerHistory",
        "nationalTeamStatistics", "internationalStatistics", "traits",
        "recentMatches", "matchesWithRating", "shotmap", "isCoach",
        "origin", "injuryHistory", "coachStats", "trophies",
    }
    extra_keys = set(player.keys()) - KNOWN_KEYS
    stat_extras = {k: player[k] for k in extra_keys
                   if isinstance(player[k], (dict, list)) and player[k]}
    if stat_extras:
        _print_section("DATOS ADICIONALES")
        for key, data in stat_extras.items():
            print(f"\n    [{key}]")
            if isinstance(data, dict):
                items = _extract_stat_items(data)
                if items:
                    for label, val in items[:30]:
                        print(f"      {label:<35} {val}")
                else:
                    sub_keys = list(data.keys())[:10]
                    print(f"      Sub-keys: {', '.join(sub_keys)}")
            elif isinstance(data, list) and len(data) > 0:
                if isinstance(data[0], dict):
                    items = _extract_stat_items(data[:10])
                    for label, val in items:
                        print(f"      {label:<35} {val}")
                else:
                    for item in data[:10]:
                        print(f"      {item}")

    # ── Injury history ──
    injuries = player.get("injuryHistory", [])
    if injuries:
        _print_section("HISTORIAL DE LESIONES")
        for inj in injuries:
            if isinstance(inj, dict):
                injury_type = inj.get("injury", inj.get("type", "?"))
                date_from = inj.get("startDate", inj.get("from", "?"))
                date_to = inj.get("endDate", inj.get("to", "ongoing"))
                games_missed = inj.get("gamesMissed", "?")
                print(f"    {str(injury_type):<30} {str(date_from):<12} → {str(date_to):<12} ({games_missed} partidos)")

    # ── Trophies ──
    trophies = player.get("trophies", [])
    if trophies:
        _print_section("PALMARÉS")
        for trophy in trophies:
            if isinstance(trophy, dict):
                competitions = trophy.get("tournaments", trophy.get("items", []))
                if isinstance(competitions, list):
                    for comp in competitions:
                        comp_name = comp.get("name", comp.get("tournamentName", "?"))
                        seasons = comp.get("seasons", [])
                        if isinstance(seasons, list):
                            season_names = [s.get("name", s.get("season", "?")) if isinstance(s, dict) else str(s) for s in seasons]
                            print(f"    {comp_name}: {', '.join(season_names)}")
                        else:
                            print(f"    {comp_name}")
                elif isinstance(trophy, dict):
                    name = trophy.get("name", trophy.get("title", "?"))
                    year = trophy.get("year", trophy.get("season", ""))
                    print(f"    {name} {year}")


def dump_player_json(player: dict[str, Any]) -> None:
    """Dump the full raw JSON response for debugging/exploration."""
    print(json.dumps(player, indent=2, ensure_ascii=False, default=str))


def print_squad_full_stats(team_id: int) -> None:
    """Fetch team squad and then get full stats for every player."""
    team_data = get_team_data(team_id)
    name = team_data.get("details", {}).get("name", "Unknown")

    print(f"\n{'=' * 70}")
    print(f"  ESTADÍSTICAS COMPLETAS PLANTILLA — {name}")
    print(f"{'=' * 70}")

    squad = team_data.get("squad", [])
    if not squad:
        print("  No squad data available.")
        return

    player_ids = []
    for group in squad:
        for m in group.get("members", []):
            pid = m.get("id")
            pname = m.get("name", "???")
            if pid:
                player_ids.append((pid, pname))

    total = len(player_ids)
    est_seconds = total * (REQUEST_DELAY + 1)
    print(f"\n  Total jugadores: {total}")
    print(f"  Tiempo estimado: ~{est_seconds:.0f}s\n")

    start_time = time.time()
    for i, (pid, pname) in enumerate(player_ids, 1):
        elapsed = time.time() - start_time
        avg_per = elapsed / i if i > 1 else REQUEST_DELAY + 1
        remaining = avg_per * (total - i)
        print(f"\n  [{i}/{total}] {pname} (ID: {pid}) — ~{remaining:.0f}s restantes")
        try:
            pdata = get_player_data(pid)
            print_player_profile(pdata)
        except Exception as e:
            print(f"    ERROR fetching {pname}: {e}")
        _delay()


# ──────────────────────────────────────────────
# 5. Matches by date
# ──────────────────────────────────────────────

def get_matches_by_date(date: str) -> dict[str, Any]:
    return _get("matches", {"date": date})


def print_matches_for_date(date: str, data: dict[str, Any]) -> None:
    print(f"\n{'=' * 50}")
    print(f"  Partidos — {date[:4]}-{date[4:6]}-{date[6:]}")
    print(f"{'=' * 50}")

    leagues = data.get("leagues", [])
    laliga_matches = []

    for league in leagues:
        lid = league.get("id", 0)
        if lid == LALIGA_ID:
            for match in league.get("matches", []):
                home = match.get("home", {}).get("name", "?")
                away = match.get("away", {}).get("name", "?")
                status = match.get("status", {})
                sh, sa = _parse_score(status.get("scoreStr"))
                score_home = sh if sh is not None else "?"
                score_away = sa if sa is not None else "?"
                match_id = match.get("id", "")
                state = "FT" if status.get("finished") else ("Live" if status.get("started") else status.get("liveTime", {}).get("short", "Sched."))

                laliga_matches.append({
                    "id": match_id,
                    "home": home,
                    "away": away,
                    "score_home": score_home,
                    "score_away": score_away,
                    "state": state,
                })

    if not laliga_matches:
        print("  No LaLiga matches on this date.")
        return

    for m in laliga_matches:
        print(f"  {m['home']:>25} {m['score_home']:>2} - {m['score_away']:<2} {m['away']:<25} [{m['state']}]  (ID: {m['id']})")


# ──────────────────────────────────────────────
# 6. Top scorers & assisters from league data
# ──────────────────────────────────────────────

def print_top_scorers(league_data: dict[str, Any]) -> None:
    print(f"\n{'=' * 60}")
    print(f"  TOP GOLEADORES — LaLiga {SEASON}")
    print(f"{'=' * 60}")

    stats = league_data.get("stats", {})
    if not stats:
        print("  No stats data in league response.")
        return

    # Try different possible paths
    top_scorers = None
    if isinstance(stats, dict):
        players = stats.get("players", stats.get("topPlayers", []))
        if isinstance(players, list):
            for cat in players:
                title = cat.get("header", cat.get("title", ""))
                if "goal" in title.lower() or "gol" in title.lower():
                    top_scorers = cat.get("topPlayers", cat.get("statsData", []))
                    break
            if not top_scorers and players:
                top_scorers = players[0].get("topPlayers", players[0].get("statsData", []))

    if not top_scorers:
        print("  Could not parse top scorers.")
        return

    print(f"  {'#':>3}  {'Jugador':<25} {'Equipo':<20} {'Goles':>6}")
    print("  " + "-" * 58)

    for i, p in enumerate(top_scorers[:20], 1):
        name = p.get("name", p.get("playerName", "???"))
        team = p.get("teamName", p.get("team", "???"))
        goals = p.get("value", p.get("goals", "?"))
        print(f"  {i:>3}  {name:<25} {team:<20} {goals:>6}")


def print_top_assisters(league_data: dict[str, Any]) -> None:
    print(f"\n{'=' * 60}")
    print(f"  TOP ASISTENTES — LaLiga {SEASON}")
    print(f"{'=' * 60}")

    stats = league_data.get("stats", {})
    if not stats:
        return

    top_assists = None
    if isinstance(stats, dict):
        players = stats.get("players", stats.get("topPlayers", []))
        if isinstance(players, list):
            for cat in players:
                title = cat.get("header", cat.get("title", ""))
                if "assist" in title.lower():
                    top_assists = cat.get("topPlayers", cat.get("statsData", []))
                    break

    if not top_assists:
        print("  Could not parse top assisters.")
        return

    print(f"  {'#':>3}  {'Jugador':<25} {'Equipo':<20} {'Asist':>6}")
    print("  " + "-" * 58)

    for i, p in enumerate(top_assists[:20], 1):
        name = p.get("name", p.get("playerName", "???"))
        team = p.get("teamName", p.get("team", "???"))
        assists = p.get("value", p.get("assists", "?"))
        print(f"  {i:>3}  {name:<25} {team:<20} {assists:>6}")


def print_all_stat_leaders(league_data: dict[str, Any]) -> None:
    """Print all available stat leader categories from league data."""
    stats = league_data.get("stats", {})
    if not stats or not isinstance(stats, dict):
        print("  No stats data in league response.")
        return

    players = stats.get("players", stats.get("topPlayers", []))
    if not isinstance(players, list):
        return

    for cat in players:
        title = cat.get("header", cat.get("title", "Unknown"))
        top_list = cat.get("topPlayers", cat.get("statsData", []))
        if not top_list:
            continue

        print(f"\n{'=' * 60}")
        print(f"  {title.upper()} — LaLiga {SEASON}")
        print(f"{'=' * 60}")
        print(f"  {'#':>3}  {'Jugador':<25} {'Equipo':<20} {'Valor':>8}")
        print("  " + "-" * 60)

        for i, p in enumerate(top_list[:15], 1):
            name = p.get("name", p.get("playerName", "???"))
            team = p.get("teamName", p.get("team", "???"))
            value = p.get("value", p.get("goals", p.get("assists", "?")))
            print(f"  {i:>3}  {name:<25} {team:<20} {value:>8}")


# ──────────────────────────────────────────────
# 7. Upcoming / recent fixtures from league
# ──────────────────────────────────────────────

def print_recent_and_upcoming(league_data: dict[str, Any]) -> None:
    matches = league_data.get("matches", {})
    if not matches:
        return

    # Recent results
    first_unplayed = matches.get("firstUnplayedMatch", {})
    all_matches = matches.get("allMatches", [])

    if not all_matches:
        return

    recent = [m for m in all_matches if m.get("status", {}).get("finished")]
    upcoming = [m for m in all_matches if not m.get("status", {}).get("finished") and not m.get("status", {}).get("started")]

    if recent:
        print(f"\n{'=' * 70}")
        print(f"  ÚLTIMOS RESULTADOS")
        print(f"{'=' * 70}")
        for m in recent[-10:]:
            home = m.get("home", {}).get("name", "?")
            away = m.get("away", {}).get("name", "?")
            score = m.get("status", {}).get("scoreStr", "? - ?")
            rnd = m.get("round", "")
            mid = m.get("id", "")
            print(f"  J{rnd:>2}  {home:>25} {score:^7} {away:<25} (ID:{mid})")

    if upcoming:
        print(f"\n{'=' * 70}")
        print(f"  PRÓXIMOS PARTIDOS")
        print(f"{'=' * 70}")
        for m in upcoming[:10]:
            home = m.get("home", {}).get("name", "?")
            away = m.get("away", {}).get("name", "?")
            utc = m.get("status", {}).get("utcTime", "")
            date_str = utc[:10] if utc else "TBD"
            rnd = m.get("round", "")
            mid = m.get("id", "")
            print(f"  J{rnd:>2}  {home:>25}  vs  {away:<25}  {date_str}  (ID:{mid})")


# ──────────────────────────────────────────────
# 8. Player comparison
# ──────────────────────────────────────────────

def print_player_comparison(id1: int, id2: int) -> None:
    p1 = get_player_data(id1)
    _delay()
    p2 = get_player_data(id2)

    n1 = p1.get("name", "Player 1")
    n2 = p2.get("name", "Player 2")
    t1 = p1.get("primaryTeam", {}).get("teamName", "?")
    t2 = p2.get("primaryTeam", {}).get("teamName", "?")
    pos1 = p1.get("positionDescription", {}).get("primaryPosition", {}).get("label", "?")
    pos2 = p2.get("positionDescription", {}).get("primaryPosition", {}).get("label", "?")

    print(f"\n{'=' * 75}")
    print(f"  COMPARACIÓN DE JUGADORES")
    print(f"{'=' * 75}")
    print(f"  {'':>30}  {n1:>20}  {n2:>20}")
    print(f"  {'Equipo':>30}  {t1:>20}  {t2:>20}")
    print(f"  {'Posición':>30}  {pos1:>20}  {pos2:>20}")
    print(f"  {'-' * 73}")

    # Collect stats from both players
    s1 = {s.get("title", ""): s.get("value", "") for s in p1.get("mainLeague", {}).get("stats", [])}
    s2 = {s.get("title", ""): s.get("value", "") for s in p2.get("mainLeague", {}).get("stats", [])}

    all_keys = list(dict.fromkeys(list(s1.keys()) + list(s2.keys())))
    if all_keys:
        print(f"\n  {'STATS TEMPORADA':>30}  {n1[:20]:>20}  {n2[:20]:>20}")
        print(f"  {'-' * 73}")
        for key in all_keys:
            v1 = s1.get(key, "—")
            v2 = s2.get(key, "—")
            print(f"  {key:>30}  {str(v1):>20}  {str(v2):>20}")

    # Per-90 comparison
    def _get_minutes(player):
        for s in player.get("mainLeague", {}).get("stats", []):
            if "minut" in s.get("title", "").lower():
                try:
                    return int(str(s.get("value", 0)).replace(",", "").replace(".", ""))
                except (ValueError, TypeError):
                    pass
        return None

    m1, m2 = _get_minutes(p1), _get_minutes(p2)
    if m1 and m2 and m1 > 0 and m2 > 0:
        print(f"\n  {'PER-90':>30}  {n1[:20]:>20}  {n2[:20]:>20}")
        print(f"  {'-' * 73}")
        per90_words = ["goal", "gol", "assist", "shot", "tiro", "pass", "tackle", "dribble"]
        for key in all_keys:
            if any(w in key.lower() for w in per90_words):
                try:
                    v1_raw = float(str(s1.get(key, 0)).replace(",", ""))
                    v2_raw = float(str(s2.get(key, 0)).replace(",", ""))
                    v1_p90 = f"{v1_raw * 90 / m1:.2f}"
                    v2_p90 = f"{v2_raw * 90 / m2:.2f}"
                    print(f"  {key + '/90':>30}  {v1_p90:>20}  {v2_p90:>20}")
                except (ValueError, TypeError):
                    pass

    # Ratings comparison
    perf1 = p1.get("performanceScore", {}).get("value", "?")
    perf2 = p2.get("performanceScore", {}).get("value", "?")
    print(f"\n  {'Performance Score':>30}  {str(perf1):>20}  {str(perf2):>20}")


# ──────────────────────────────────────────────
# 9. Fixture difficulty ranking (FDR)
# ──────────────────────────────────────────────

def print_fixture_difficulty(league_data: dict[str, Any], num_matches: int = 6) -> None:
    """Rank all teams by their next N opponents' strength."""
    all_rows = _find_standings_rows(league_data.get("table", []))
    if not all_rows:
        print("  No standings data.")
        return

    team_positions = {}
    for row in all_rows:
        tid = row.get("id")
        name = row.get("name", row.get("shortName", "?"))
        pos = row.get("idx", row.get("position", 99))
        if tid:
            team_positions[tid] = {"name": name, "position": pos}

    matches = league_data.get("matches", {})
    all_matches = matches.get("allMatches", [])
    upcoming = [m for m in all_matches if not m.get("status", {}).get("finished") and not m.get("status", {}).get("started")]

    team_fdr: dict[int, list] = defaultdict(list)
    for m in upcoming:
        home_id = m.get("home", {}).get("id")
        away_id = m.get("away", {}).get("id")
        home_name = m.get("home", {}).get("name", "?")
        away_name = m.get("away", {}).get("name", "?")
        if home_id and away_id:
            home_pos = team_positions.get(home_id, {}).get("position", 10)
            away_pos = team_positions.get(away_id, {}).get("position", 10)
            if len(team_fdr[home_id]) < num_matches:
                difficulty = away_pos
                venue = "H"
                team_fdr[home_id].append({"opp": away_name, "opp_pos": away_pos, "venue": venue, "diff": difficulty})
            if len(team_fdr[away_id]) < num_matches:
                difficulty = home_pos
                venue = "A"
                team_fdr[away_id].append({"opp": home_name, "opp_pos": home_pos, "venue": venue, "diff": difficulty})

    if not team_fdr:
        print("  No upcoming fixtures found.")
        return

    # Calculate average difficulty (lower position = harder opponent)
    rankings = []
    for tid, fixtures in team_fdr.items():
        avg_diff = sum(f["diff"] for f in fixtures) / len(fixtures) if fixtures else 0
        name = team_positions.get(tid, {}).get("name", f"Team {tid}")
        pos = team_positions.get(tid, {}).get("position", "?")
        rankings.append({"team": name, "position": pos, "avg_diff": avg_diff, "fixtures": fixtures, "team_id": tid})

    # Higher avg_diff = easier schedule (opponents ranked lower)
    rankings.sort(key=lambda x: -x["avg_diff"])

    print(f"\n{'=' * 80}")
    print(f"  FIXTURE DIFFICULTY RANKING — Próximos {num_matches} partidos")
    print(f"{'=' * 80}")
    print(f"  {'#':>3}  {'Equipo':<22} {'Pos':>3} {'FDR':>5}  {'Próximos rivales'}")
    print(f"  {'-' * 78}")

    for i, r in enumerate(rankings, 1):
        opp_str = "  ".join(
            f"{f['opp'][:10]}({f['venue']}{f['opp_pos']})"
            for f in r["fixtures"][:num_matches]
        )
        ease = "🟢" if r["avg_diff"] > 13 else "🟡" if r["avg_diff"] > 8 else "🔴"
        print(f"  {i:>3}  {r['team']:<22} {r['position']:>3} {r['avg_diff']:>5.1f}  {ease} {opp_str}")

    print(f"\n  FDR = media posición rivales (mayor = calendario más fácil)")
    print(f"  🟢 Fácil (>13)  🟡 Medio (8-13)  🔴 Difícil (<8)")


# ──────────────────────────────────────────────
# 10. Home/Away standings + zone indicators
# ──────────────────────────────────────────────

def print_standings_split(league_data: dict[str, Any], split: str = "home") -> None:
    """Print home-only or away-only standings."""
    tables = league_data.get("table", [])
    all_rows = []
    if isinstance(tables, list):
        for t in tables:
            data = t.get("data") or t if isinstance(t, dict) else t
            if isinstance(data, dict):
                table_all = data.get("table", data.get("tables", []))
                if isinstance(table_all, dict):
                    all_rows = table_all.get(split, [])
                elif isinstance(table_all, list):
                    for sub in table_all:
                        if isinstance(sub, dict) and split in sub:
                            all_rows = sub[split]
                            break
            if all_rows:
                break

    if not all_rows:
        print(f"  No {split} standings data available.")
        return

    label = "CASA" if split == "home" else "FUERA"
    print(f"\n{'=' * 70}")
    print(f"  CLASIFICACIÓN {label} — LaLiga {SEASON}")
    print(f"{'=' * 70}")
    print(f"  {'#':>3}  {'Equipo':<25} {'PJ':>3} {'G':>3} {'E':>3} {'P':>3} {'GF':>4} {'GC':>4} {'DG':>4} {'Pts':>4}")
    print(f"  {'-' * 66}")

    for row in all_rows:
        pos = row.get("idx", row.get("position", ""))
        name = row.get("name", row.get("shortName", "???"))
        played = row.get("played", 0)
        wins = row.get("wins", 0)
        draws_count = row.get("draws", 0)
        losses = row.get("losses", 0)
        gf_p, gc_p = _parse_score(row.get("scoresStr"))
        gf = gf_p if gf_p is not None else row.get("goalsFor", "?")
        gc = gc_p if gc_p is not None else row.get("goalsAgainst", "?")
        gd = row.get("goalConDiff", row.get("goalDifference", 0))
        pts = row.get("pts", 0)
        print(f"  {pos:>3}  {name:<25} {played:>3} {wins:>3} {draws_count:>3} {losses:>3} {gf:>4} {gc:>4} {gd:>4} {pts:>4}")


# ──────────────────────────────────────────────
# 11. Team form trend + team-compare
# ──────────────────────────────────────────────

def print_team_form_trend(team_data: dict[str, Any]) -> None:
    """Show rolling points-per-game trend for LaLiga matches."""
    name = team_data.get("details", {}).get("name", "Unknown")
    fixtures = _extract_fixtures_from_team(team_data)

    liga_finished = [f for f in fixtures if f["finished"] and (
        "laliga" in f["competition"].lower() or "la liga" in f["competition"].lower()
        or f["competition"] == "League"
    )]

    if not liga_finished:
        print(f"  No LaLiga results found for {name}.")
        return

    print(f"\n{'=' * 70}")
    print(f"  TENDENCIA DE FORMA — {name}")
    print(f"{'=' * 70}")

    # Compute PPG for each match
    ppg_data = []
    for f in liga_finished:
        sh, sa = _parse_score(f["score"])
        if sh is None or sa is None:
            continue
        if f["home_away"] == "H":
            team_goals, opp_goals = sh, sa
        elif f["home_away"] == "A":
            team_goals, opp_goals = sa, sh
        else:
            continue
        if team_goals > opp_goals:
            pts = 3
        elif team_goals == opp_goals:
            pts = 1
        else:
            pts = 0
        d = f["date_parsed"]
        date_str = d.strftime("%m/%d") if d else "?"
        ppg_data.append({"date": date_str, "pts": pts, "score": f["score"], "opp": f["opponent"], "venue": f["home_away"]})

    if len(ppg_data) < 3:
        print("  Not enough matches for trend analysis.")
        return

    # Rolling 5-match PPG
    window = 5
    print(f"\n  {'Jornada':<10} {'Rival':<20} {'H/A':>3} {'Score':<7} {'Pts':>3} {'PPG-{window}':>7}")
    print(f"  {'-' * 55}")

    for i, m in enumerate(ppg_data):
        start = max(0, i - window + 1)
        rolling = ppg_data[start:i + 1]
        ppg = sum(r["pts"] for r in rolling) / len(rolling)
        bar = "█" * int(ppg * 3) + "░" * (9 - int(ppg * 3))
        print(f"  {m['date']:<10} {m['opp']:<20} {m['venue']:>3} {m['score']:<7} {m['pts']:>3} {ppg:>5.2f}  {bar}")

    total_pts = sum(m["pts"] for m in ppg_data)
    total_ppg = total_pts / len(ppg_data)
    last5_pts = sum(m["pts"] for m in ppg_data[-5:])
    last5_ppg = last5_pts / min(5, len(ppg_data))
    print(f"\n  PPG temporada: {total_ppg:.2f}  |  PPG últimos 5: {last5_ppg:.2f}")
    trend = last5_ppg - total_ppg
    arrow = "📈" if trend > 0.3 else "📉" if trend < -0.3 else "➡️"
    print(f"  Tendencia: {arrow} {trend:+.2f}")


def print_team_comparison(t1_id: int, t2_id: int) -> None:
    """Compare two teams side by side."""
    t1 = get_team_data(t1_id)
    _delay()
    t2 = get_team_data(t2_id)

    n1 = t1.get("details", {}).get("name", "Team 1")
    n2 = t2.get("details", {}).get("name", "Team 2")

    print(f"\n{'=' * 70}")
    print(f"  COMPARACIÓN: {n1} vs {n2}")
    print(f"{'=' * 70}")

    # Get standings positions
    league = get_league_data()
    all_rows = _find_standings_rows(league.get("table", []))
    pos1 = pos2 = "?"
    pts1 = pts2 = "?"
    for row in all_rows:
        rid = row.get("id")
        if rid == t1_id:
            pos1 = row.get("idx", "?")
            pts1 = row.get("pts", "?")
        elif rid == t2_id:
            pos2 = row.get("idx", "?")
            pts2 = row.get("pts", "?")

    print(f"\n  {'':>25}  {n1[:18]:>18}  {n2[:18]:>18}")
    print(f"  {'-' * 63}")
    print(f"  {'Posición':>25}  {str(pos1):>18}  {str(pos2):>18}")
    print(f"  {'Puntos':>25}  {str(pts1):>18}  {str(pts2):>18}")

    # Top players from overview
    for data, name in [(t1, n1), (t2, n2)]:
        overview = data.get("overview", {})
        top = overview.get("topPlayers", {})
        if top:
            print(f"\n  Top jugadores — {name}:")
            for cat, players in top.items():
                if isinstance(players, list) and players:
                    p = players[0]
                    pname = p.get("name", "?")
                    val = p.get("value", "?")
                    print(f"    {cat}: {pname} ({val})")


# ──────────────────────────────────────────────
# 12. League summary dashboard
# ──────────────────────────────────────────────

def print_dashboard(league_data: dict[str, Any]) -> None:
    """Quick league overview: top 5, bottom 3, form, top scorer, next matchday."""
    print(f"\n{'=' * 70}")
    print(f"  DASHBOARD — LaLiga {SEASON}")
    print(f"{'=' * 70}")

    all_rows = _find_standings_rows(league_data.get("table", []))

    # Top 5
    if all_rows:
        print(f"\n  CARRERA POR EL TÍTULO")
        print(f"  {'#':>3}  {'Equipo':<25} {'Pts':>4} {'PJ':>3} {'DG':>4}")
        print(f"  {'-' * 44}")
        for row in all_rows[:5]:
            pos = row.get("idx", "?")
            name = row.get("name", "?")
            pts = row.get("pts", 0)
            played = row.get("played", 0)
            gd = row.get("goalConDiff", row.get("goalDifference", 0))
            print(f"  {pos:>3}  {name:<25} {pts:>4} {played:>3} {gd:>+4}")

        # Gap analysis
        if len(all_rows) >= 2:
            gap = all_rows[0].get("pts", 0) - all_rows[1].get("pts", 0)
            print(f"\n  Ventaja del líder: {gap} pts")

    # Bottom 3
    if len(all_rows) >= 3:
        print(f"\n  ZONA DE DESCENSO")
        print(f"  {'#':>3}  {'Equipo':<25} {'Pts':>4} {'PJ':>3}")
        print(f"  {'-' * 38}")
        for row in all_rows[-3:]:
            pos = row.get("idx", "?")
            name = row.get("name", "?")
            pts = row.get("pts", 0)
            played = row.get("played", 0)
            print(f"  {pos:>3}  {name:<25} {pts:>4} {played:>3}")
        if len(all_rows) >= 4:
            safety_gap = all_rows[-4].get("pts", 0) - all_rows[-3].get("pts", 0)
            print(f"\n  Colchón sobre descenso: {safety_gap} pts")

    # Top scorer
    stats = league_data.get("stats", {})
    if isinstance(stats, dict):
        players = stats.get("players", stats.get("topPlayers", []))
        if isinstance(players, list):
            for cat in players:
                title = cat.get("header", cat.get("title", ""))
                if "goal" in title.lower() or "gol" in title.lower():
                    top = cat.get("topPlayers", cat.get("statsData", []))
                    if top:
                        p = top[0]
                        print(f"\n  PICHICHI: {p.get('name', '?')} ({p.get('teamName', '?')}) — {p.get('value', '?')} goles")
                    break

    # Next matchday
    matches = league_data.get("matches", {})
    all_matches = matches.get("allMatches", [])
    upcoming = [m for m in all_matches if not m.get("status", {}).get("finished") and not m.get("status", {}).get("started")]
    if upcoming:
        next_round = upcoming[0].get("round", "?")
        next_matches = [m for m in upcoming if m.get("round") == next_round]
        print(f"\n  PRÓXIMA JORNADA (J{next_round}) — {len(next_matches)} partidos")
        for m in next_matches[:5]:
            home = m.get("home", {}).get("name", "?")
            away = m.get("away", {}).get("name", "?")
            utc = m.get("status", {}).get("utcTime", "")
            date_str = utc[:10] if utc else "TBD"
            print(f"    {home:>25}  vs  {away:<25}  {date_str}")
        if len(next_matches) > 5:
            print(f"    ... y {len(next_matches) - 5} más")


# ──────────────────────────────────────────────
# 13. Agent pipeline — scout reports, Poisson, jornada
# ──────────────────────────────────────────────

import math


def _poisson_prob(lam: float, k: int) -> float:
    return (lam ** k) * math.exp(-lam) / math.factorial(k)


def compute_poisson_dixon_coles(
    team_id: int,
    opponent_id: int,
    league_data: dict[str, Any],
    rho: float = -0.10,
) -> dict[str, Any]:
    """Compute Poisson Dixon-Coles 1X2 probabilities from last 38 matches."""
    matches_data = league_data.get("matches", {})
    all_matches = matches_data.get("allMatches", [])
    finished = [m for m in all_matches if m.get("status", {}).get("finished")]

    # Compute league averages and per-team attack/defense strengths
    team_goals_for: dict[int, list] = defaultdict(list)
    team_goals_against: dict[int, list] = defaultdict(list)

    for m in finished[-380:]:  # ~20 teams * 19 home matches
        home_id = m.get("home", {}).get("id")
        away_id = m.get("away", {}).get("id")
        sh, sa = _parse_score(m.get("status", {}).get("scoreStr"))
        if sh is None or sa is None or not home_id or not away_id:
            continue
        team_goals_for[home_id].append(sh)
        team_goals_against[home_id].append(sa)
        team_goals_for[away_id].append(sa)
        team_goals_against[away_id].append(sh)

    if not team_goals_for:
        return {"error": "No match data for Poisson calculation"}

    # League averages
    all_home_goals = []
    all_away_goals = []
    for m in finished[-380:]:
        sh, sa = _parse_score(m.get("status", {}).get("scoreStr"))
        if sh is not None and sa is not None:
            all_home_goals.append(sh)
            all_away_goals.append(sa)

    avg_home = sum(all_home_goals) / len(all_home_goals) if all_home_goals else 1.3
    avg_away = sum(all_away_goals) / len(all_away_goals) if all_away_goals else 1.1

    # Team strengths (last 38 matches or all available)
    def _team_attack(tid: int) -> float:
        gf = team_goals_for.get(tid, [])[-38:]
        return (sum(gf) / len(gf)) / avg_home if gf else 1.0

    def _team_defense(tid: int) -> float:
        ga = team_goals_against.get(tid, [])[-38:]
        return (sum(ga) / len(ga)) / avg_away if ga else 1.0

    attack_home = _team_attack(team_id)
    defense_home = _team_defense(team_id)
    attack_away = _team_attack(opponent_id)
    defense_away = _team_defense(opponent_id)

    lambda_home = attack_home * defense_away * avg_home
    lambda_away = attack_away * defense_home * avg_away

    # Compute score matrix (0-6 goals each)
    max_goals = 7
    p1 = 0.0  # home win
    px = 0.0  # draw
    p2 = 0.0  # away win

    for i in range(max_goals):
        for j in range(max_goals):
            p_ij = _poisson_prob(lambda_home, i) * _poisson_prob(lambda_away, j)
            # Dixon-Coles correction for low scores
            if i <= 1 and j <= 1:
                if i == 0 and j == 0:
                    p_ij *= (1 + lambda_home * lambda_away * rho)
                elif i == 1 and j == 0:
                    p_ij *= (1 - lambda_away * rho)
                elif i == 0 and j == 1:
                    p_ij *= (1 - lambda_home * rho)
                elif i == 1 and j == 1:
                    p_ij *= (1 - rho)
                p_ij = max(p_ij, 0.0)

            if i > j:
                p1 += p_ij
            elif i == j:
                px += p_ij
            else:
                p2 += p_ij

    # Normalize
    total = p1 + px + p2
    if total > 0:
        p1, px, p2 = p1 / total, px / total, p2 / total

    return {
        "lambda_home": round(lambda_home, 3),
        "lambda_away": round(lambda_away, 3),
        "p1": round(p1, 4),
        "px": round(px, 4),
        "p2": round(p2, 4),
        "attack_home": round(attack_home, 3),
        "defense_home": round(defense_home, 3),
        "attack_away": round(attack_away, 3),
        "defense_away": round(defense_away, 3),
        "avg_home_league": round(avg_home, 3),
        "avg_away_league": round(avg_away, 3),
        "rho": rho,
    }


def generate_scout_report(team_id: int, league_data: dict[str, Any]) -> str:
    """Generate structured markdown scout report for agent consumption."""
    team_data = get_team_data(team_id)
    name = team_data.get("details", {}).get("name", "Unknown")
    tid = team_data.get("details", {}).get("id", team_id)

    lines = [f"# Scout Report: {name}", f"**Team ID**: {tid}", ""]

    # Standings context
    all_rows = _find_standings_rows(league_data.get("table", []))
    for row in all_rows:
        if row.get("id") == tid:
            lines.append("## Clasificación")
            lines.append(f"- Posición: {row.get('idx', '?')}")
            lines.append(f"- Puntos: {row.get('pts', '?')}")
            lines.append(f"- PJ: {row.get('played', '?')} | G:{row.get('wins', '?')} E:{row.get('draws', '?')} P:{row.get('losses', '?')}")
            gf_p, gc_p = _parse_score(row.get("scoresStr"))
            gf = gf_p if gf_p is not None else row.get("goalsFor", "?")
            gc = gc_p if gc_p is not None else row.get("goalsAgainst", "?")
            lines.append(f"- GF:{gf} GC:{gc} DG:{row.get('goalConDiff', '?')}")
            form = row.get("form", row.get("recentForm", []))
            if isinstance(form, list):
                form_str = "".join(f.get("result", "?")[:1].upper() if isinstance(f, dict) else str(f)[:1] for f in form[-6:])
                lines.append(f"- Forma (últ. 6): {form_str}")
            lines.append("")
            break

    # Fixtures — multi-competition
    fixtures = _extract_fixtures_from_team(team_data)
    upcoming = [f for f in fixtures if not f["finished"] and f["date_parsed"]]
    upcoming.sort(key=lambda x: x["date"] or "")
    recent = [f for f in fixtures if f["finished"]]

    if upcoming:
        lines.append("## Próximos partidos")
        for f in upcoming[:8]:
            d = f["date_parsed"]
            ds = d.strftime("%Y-%m-%d") if d else "TBD"
            lines.append(f"- {ds} | {f['competition']} | {f['home_away']} vs {f['opponent']} | {f['round']}")
        lines.append("")

    if recent:
        lines.append("## Últimos resultados")
        for f in recent[-6:]:
            d = f["date_parsed"]
            ds = d.strftime("%Y-%m-%d") if d else "?"
            res = f["result"][:1].upper() if f["result"] else "?"
            lines.append(f"- {ds} | {f['competition']} | {f['home_away']} vs {f['opponent']} | {f['score']} ({res})")
        lines.append("")

    # Squad key players
    overview = team_data.get("overview", {})
    top_players = overview.get("topPlayers", {})
    if top_players:
        lines.append("## Jugadores clave")
        for cat, players in top_players.items():
            if isinstance(players, list):
                for p in players[:3]:
                    pname = p.get("name", "?")
                    val = p.get("value", "?")
                    lines.append(f"- {cat}: {pname} ({val})")
        lines.append("")

    # Squad list
    squad = team_data.get("squad", [])
    if squad:
        lines.append("## Plantilla")
        for group in squad:
            title = group.get("title", "")
            members = group.get("members", [])
            for m in members:
                mname = m.get("name", "?")
                num = m.get("shirtNumber", "")
                lines.append(f"- [{title}] #{num} {mname}")
        lines.append("")

    # Competition load
    by_comp: dict[str, int] = defaultdict(int)
    for f in upcoming[:15]:
        by_comp[f["competition"]] += 1
    if by_comp:
        lines.append("## Carga competitiva (próximos 15 partidos)")
        for comp, count in sorted(by_comp.items(), key=lambda x: -x[1]):
            lines.append(f"- {comp}: {count} partidos")
        lines.append("")

    return "\n".join(lines)


def print_scout_report(team_id: int) -> None:
    league_data = get_league_data()
    report = generate_scout_report(team_id, league_data)
    print(report)


def print_jornada(league_data: dict[str, Any], matchday: int | None = None) -> None:
    """Generate scout reports + Poisson for all matches in a matchday."""
    matches_data = league_data.get("matches", {})
    all_matches = matches_data.get("allMatches", [])

    if matchday:
        target = [m for m in all_matches if m.get("round") == matchday or str(m.get("round")) == str(matchday)]
    else:
        # Find next unplayed matchday
        upcoming = [m for m in all_matches if not m.get("status", {}).get("finished")]
        if not upcoming:
            print("  No upcoming matches found.")
            return
        matchday = upcoming[0].get("round", "?")
        target = [m for m in all_matches if m.get("round") == matchday or str(m.get("round")) == str(matchday)]

    if not target:
        print(f"  No matches found for matchday {matchday}.")
        return

    print(f"\n{'=' * 80}")
    print(f"  JORNADA {matchday} — {len(target)} partidos")
    print(f"{'=' * 80}")

    results = []
    for i, m in enumerate(target, 1):
        home_name = m.get("home", {}).get("name", "?")
        away_name = m.get("away", {}).get("name", "?")
        home_id = m.get("home", {}).get("id")
        away_id = m.get("away", {}).get("id")
        utc = m.get("status", {}).get("utcTime", "")
        date_str = utc[:16] if utc else "TBD"
        finished = m.get("status", {}).get("finished", False)
        score = m.get("status", {}).get("scoreStr", "")

        print(f"\n  {'─' * 75}")
        print(f"  [{i}/{len(target)}] {home_name} vs {away_name}")
        print(f"  Fecha: {date_str}")
        if finished:
            print(f"  Resultado: {score}")

        # Poisson
        if home_id and away_id:
            poisson = compute_poisson_dixon_coles(home_id, away_id, league_data)
            if "error" not in poisson:
                p1 = poisson["p1"] * 100
                px = poisson["px"] * 100
                p2 = poisson["p2"] * 100
                print(f"  Poisson Dixon-Coles: 1={p1:.1f}%  X={px:.1f}%  2={p2:.1f}%")
                print(f"  λ_home={poisson['lambda_home']}  λ_away={poisson['lambda_away']}")

                result = {
                    "match": f"{home_name} vs {away_name}",
                    "home_id": home_id,
                    "away_id": away_id,
                    "date": date_str,
                    "p1": poisson["p1"],
                    "px": poisson["px"],
                    "p2": poisson["p2"],
                    "lambda_home": poisson["lambda_home"],
                    "lambda_away": poisson["lambda_away"],
                }
                if finished:
                    result["score"] = score
                results.append(result)

    # Summary table
    if results:
        print(f"\n{'=' * 80}")
        print(f"  RESUMEN JORNADA {matchday}")
        print(f"{'=' * 80}")
        print(f"  {'Partido':<40} {'1':>7} {'X':>7} {'2':>7} {'Pronóstico':>12}")
        print(f"  {'-' * 75}")
        for r in results:
            p1, px, p2 = r["p1"] * 100, r["px"] * 100, r["p2"] * 100
            fav = "1" if p1 > px and p1 > p2 else ("X" if px > p1 and px > p2 else "2")
            conf = max(p1, px, p2)
            print(f"  {r['match']:<40} {p1:>6.1f}% {px:>6.1f}% {p2:>6.1f}% {fav:>5} ({conf:.0f}%)")


def generate_agent_json(team_id: int, opponent_id: int, league_data: dict[str, Any]) -> dict[str, Any]:
    """Generate machine-readable JSON for Claude SDK agents."""
    team_data = get_team_data(team_id)
    _delay()
    opp_data = get_team_data(opponent_id)

    team_name = team_data.get("details", {}).get("name", "?")
    opp_name = opp_data.get("details", {}).get("name", "?")

    # Standings
    all_rows = _find_standings_rows(league_data.get("table", []))
    team_standing = {}
    opp_standing = {}
    for row in all_rows:
        rid = row.get("id")
        entry = {
            "position": row.get("idx"),
            "points": row.get("pts"),
            "played": row.get("played"),
            "wins": row.get("wins"),
            "draws": row.get("draws"),
            "losses": row.get("losses"),
            "goal_diff": row.get("goalConDiff", row.get("goalDifference")),
        }
        if rid == team_id:
            team_standing = entry
        elif rid == opponent_id:
            opp_standing = entry

    # Recent form
    def _recent_form(tdata):
        fixtures = _extract_fixtures_from_team(tdata)
        recent = [f for f in fixtures if f["finished"]][-6:]
        return [{
            "date": f["date"],
            "opponent": f["opponent"],
            "score": f["score"],
            "result": f["result"][:1].upper() if f["result"] else "?",
            "competition": f["competition"],
            "home_away": f["home_away"],
        } for f in recent]

    # Poisson
    poisson = compute_poisson_dixon_coles(team_id, opponent_id, league_data)

    return {
        "home": {
            "name": team_name,
            "id": team_id,
            "standing": team_standing,
            "recent_form": _recent_form(team_data),
        },
        "away": {
            "name": opp_name,
            "id": opponent_id,
            "standing": opp_standing,
            "recent_form": _recent_form(opp_data),
        },
        "poisson_dixon_coles": poisson,
    }


# ──────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────

def print_help() -> None:
    print("""
LaLiga Stats — FotMob Scraper
Usage: python laliga_stats.py [command] [args] [--json [file]] [--csv [file]]

League:
  standings [--team X]     Standings with form column (filter by team)
  scorers                  Top scorers
  assisters                Top assisters
  leaders                  All stat leader categories
  fixtures                 Recent results & upcoming matches (with match IDs)
  fdr [N]                  Fixture difficulty ranking (next N matches, default 6)
  standings-home           Home-only standings
  standings-away           Away-only standings
  dashboard                Quick overview (title race, relegation, pichichi, next matchday)
  teams                    List all teams with IDs
  full                     Full report

Team:
  team <id|name>           Team overview + squad
  team-competitions <id|name>  Multi-competition analysis & rotation prediction
  team-form <id|name>      Rolling PPG trend across the season
  team-compare <t1> <t2>   Side-by-side team comparison
  squad-stats <id|name>    Full stats for every player in squad
  h2h <team1> <team2>     Head-to-head history

Player:
  player <id|name>         Full profile, per-90 stats, form, shotmap
  compare <p1> <p2>        Side-by-side player comparison with per-90
  search-player <name>     Search player by name across all squads
  search-team <name>       Search team by name

Match:
  match <match_id>         Full details (lineups, stats, events, xG)
  date <date>              LaLiga matches on a date (YYYYMMDD, YYYY-MM-DD, yesterday, tomorrow)
  today                    Today's matches

Debug:
  player-json <id>         Raw JSON dump of player data
  match-json <match_id>    Raw JSON dump of match data

Agent Pipeline:
  scout <team_id|name>     Structured markdown scout report
  jornada [N]              Full matchday analysis with Poisson Dixon-Coles
  poisson <home> <away>    1X2 probabilities (Poisson Dixon-Coles model)
  agent-json <home> <away> Machine-readable JSON for Claude SDK agents

Export (append to any command):
  --json [filename]        Export as JSON (stdout or file)
  --csv [filename]         Export as CSV (standings, teams)

Quick Start:
  1. Find a team:   search-team "Betis"  →  get team ID
  2. Check player:  player "Pedri"       →  full stats + form
  3. Deep-dive:     match <ID>           →  lineups, xG, events
  4. Compare:       h2h 8633 8634        →  head-to-head record

Global flags:
  --league <name|id>       Use another league (premier, seriea, bundesliga, ligue1)
  LOGLEVEL=DEBUG           Show detailed error traces
""")


def _resolve_team_arg(arg: str) -> int:
    """Resolve a team argument: return int ID or search by name."""
    try:
        return int(arg)
    except ValueError:
        results = search_team(arg)
        if not results:
            raise ResolveError(f"No team found matching '{arg}'. Use 'teams' to list all.")
        if len(results) > 1:
            print(f"  Multiple teams match '{arg}':")
            for t in results:
                print(f"    {t['id']:>8}  {t['name']}")
            print(f"  Using first match: {results[0]['name']} (ID: {results[0]['id']})")
        return results[0]["id"]


def _resolve_player_arg(arg: str) -> int:
    """Resolve a player argument: return int ID or search by name."""
    try:
        return int(arg)
    except ValueError:
        results = search_player(arg)
        if not results:
            raise ResolveError(f"No player found matching '{arg}'. Use 'search-player' to search.")
        if len(results) > 1:
            print(f"  Multiple players match '{arg}':")
            for p in results:
                print(f"    {p['id']:>10}  {p['name']:<25} ({p['team']})")
            print(f"  Using first match: {results[0]['name']} (ID: {results[0]['id']})")
        return results[0]["id"]


def _check_csv_support(export_fmt: str | None, supported: bool = False) -> None:
    """Warn user if --csv was requested but not supported for this command."""
    if export_fmt == "csv" and not supported:
        print("  Warning: --csv not supported for this command. Use --json instead, or pipe to jq.")


def _normalize_date_arg(arg: str) -> str:
    """Normalize a date argument to YYYYMMDD format for the FotMob API."""
    lower = arg.lower().strip()
    today = datetime.now()
    if lower == "today":
        return today.strftime("%Y%m%d")
    if lower == "yesterday":
        return (today - timedelta(days=1)).strftime("%Y%m%d")
    if lower == "tomorrow":
        return (today + timedelta(days=1)).strftime("%Y%m%d")
    cleaned = arg.replace("-", "").replace("/", "")
    if len(cleaned) == 8 and cleaned.isdigit():
        return cleaned
    raise ValueError(f"Invalid date format: '{arg}'. Use YYYYMMDD, YYYY-MM-DD, yesterday, today, or tomorrow.")


def main() -> None:
    import os
    logging.basicConfig(
        level=getattr(logging, os.environ.get("LOGLEVEL", "WARNING").upper(), logging.WARNING),
        format="%(levelname)s: %(message)s",
    )

    if len(sys.argv) < 2:
        print_help()
        return

    cmd = sys.argv[1].lower()
    export_fmt, export_file = _parse_export_args(sys.argv[2:])

    # Parse --league flag
    global LALIGA_ID
    for i, a in enumerate(sys.argv):
        if a == "--league" and i + 1 < len(sys.argv):
            league_arg = sys.argv[i + 1].lower()
            if league_arg in LEAGUE_ALIASES:
                LALIGA_ID = LEAGUE_ALIASES[league_arg]
            elif league_arg.isdigit():
                LALIGA_ID = int(league_arg)
            else:
                print(f"  Unknown league '{league_arg}'. Available: {', '.join(LEAGUE_ALIASES.keys())}")
                return

    try:
        if cmd == "standings":
            # Parse optional --team filter
            team_filter = None
            for i, a in enumerate(sys.argv[2:], 2):
                if a == "--team" and i + 1 < len(sys.argv):
                    team_filter = sys.argv[i + 1]
            data = get_league_data()
            if export_fmt == "json":
                _export_json(data, export_file)
            elif export_fmt == "csv":
                _export_csv(_standings_to_rows(data), export_file)
            else:
                print_standings(data, team_filter=team_filter)

        elif cmd == "scorers":
            _check_csv_support(export_fmt)
            data = get_league_data()
            if export_fmt == "json":
                _export_json(data.get("stats", {}), export_file)
            else:
                print_top_scorers(data)

        elif cmd == "assisters":
            _check_csv_support(export_fmt)
            data = get_league_data()
            if export_fmt == "json":
                _export_json(data.get("stats", {}), export_file)
            else:
                print_top_assisters(data)

        elif cmd == "leaders":
            data = get_league_data()
            if export_fmt == "json":
                _export_json(data.get("stats", {}), export_file)
            else:
                print_all_stat_leaders(data)

        elif cmd == "fixtures":
            data = get_league_data()
            if export_fmt == "json":
                _export_json(data.get("matches", {}), export_file)
            else:
                print_recent_and_upcoming(data)

        elif cmd == "team":
            if len(sys.argv) < 3:
                print("Usage: python laliga_stats.py team <team_id|team_name>")
                return
            team_id = _resolve_team_arg(sys.argv[2])
            data = get_team_data(team_id)
            if export_fmt == "json":
                _export_json(data, export_file)
            else:
                print_team_overview(data)
                print_squad(data)

        elif cmd == "team-competitions":
            if len(sys.argv) < 3:
                print("Usage: python laliga_stats.py team-competitions <team_id|name>")
                return
            team_id = _resolve_team_arg(sys.argv[2])
            data = get_team_data(team_id)
            if export_fmt == "json":
                fixtures = _extract_fixtures_from_team(data)
                _export_json(fixtures, export_file)
            else:
                print_competition_analysis(data)

        elif cmd == "match":
            if len(sys.argv) < 3:
                print("Usage: python laliga_stats.py match <match_id>")
                return
            match_id = int(sys.argv[2])
            data = get_match_details(match_id)
            if export_fmt == "json":
                _export_json(data, export_file)
            else:
                print_match_summary(data)

        elif cmd == "match-json":
            if len(sys.argv) < 3:
                print("Usage: python laliga_stats.py match-json <match_id>")
                return
            match_id = int(sys.argv[2])
            data = get_match_details(match_id)
            dump_match_json(data)

        elif cmd == "player":
            if len(sys.argv) < 3:
                print("Usage: python laliga_stats.py player <player_id|player_name>")
                return
            player_id = _resolve_player_arg(sys.argv[2])
            data = get_player_data(player_id)
            if export_fmt == "json":
                _export_json(data, export_file)
            else:
                print_player_profile(data)

        elif cmd == "player-json":
            if len(sys.argv) < 3:
                print("Usage: python laliga_stats.py player-json <player_id>")
                return
            player_id = int(sys.argv[2])
            data = get_player_data(player_id)
            dump_player_json(data)

        elif cmd == "squad-stats":
            if len(sys.argv) < 3:
                print("Usage: python laliga_stats.py squad-stats <team_id|name>")
                return
            team_id = _resolve_team_arg(sys.argv[2])
            print_squad_full_stats(team_id)

        elif cmd == "search-team":
            if len(sys.argv) < 3:
                print("Usage: python laliga_stats.py search-team <name>")
                return
            print_search_results(sys.argv[2], "team")

        elif cmd == "search-player":
            if len(sys.argv) < 3:
                print("Usage: python laliga_stats.py search-player <name>")
                return
            print_search_results(sys.argv[2], "player")

        elif cmd == "h2h":
            if len(sys.argv) < 4:
                print("Usage: python laliga_stats.py h2h <team1> <team2>")
                return
            t1 = _resolve_team_arg(sys.argv[2])
            t2 = _resolve_team_arg(sys.argv[3])
            print_head_to_head(t1, t2)

        elif cmd == "compare":
            if len(sys.argv) < 4:
                print("Usage: python laliga_stats.py compare <player1> <player2>")
                return
            p1 = _resolve_player_arg(sys.argv[2])
            p2 = _resolve_player_arg(sys.argv[3])
            print_player_comparison(p1, p2)

        elif cmd == "team-form":
            if len(sys.argv) < 3:
                print("Usage: python laliga_stats.py team-form <team_id|name>")
                return
            team_id = _resolve_team_arg(sys.argv[2])
            data = get_team_data(team_id)
            print_team_form_trend(data)

        elif cmd == "team-compare":
            if len(sys.argv) < 4:
                print("Usage: python laliga_stats.py team-compare <team1> <team2>")
                return
            t1 = _resolve_team_arg(sys.argv[2])
            t2 = _resolve_team_arg(sys.argv[3])
            print_team_comparison(t1, t2)

        elif cmd == "fdr":
            n = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else 6
            data = get_league_data()
            print_fixture_difficulty(data, num_matches=n)

        elif cmd == "standings-home":
            data = get_league_data()
            print_standings_split(data, "home")

        elif cmd == "standings-away":
            data = get_league_data()
            print_standings_split(data, "away")

        elif cmd == "date":
            if len(sys.argv) < 3:
                print("Usage: python laliga_stats.py date <YYYYMMDD|YYYY-MM-DD|yesterday|tomorrow>")
                return
            date = _normalize_date_arg(sys.argv[2])
            data = get_matches_by_date(date)
            if export_fmt == "json":
                _export_json(data, export_file)
            else:
                print_matches_for_date(date, data)

        elif cmd in ("today", "yesterday", "tomorrow"):
            date = _normalize_date_arg(cmd)
            data = get_matches_by_date(date)
            if export_fmt == "json":
                _export_json(data, export_file)
            else:
                print_matches_for_date(date, data)

        elif cmd == "teams":
            data = get_league_data()
            teams = extract_teams(data)
            if export_fmt == "json":
                _export_json(teams, export_file)
            elif export_fmt == "csv":
                _export_csv(teams, export_file)
            else:
                if teams:
                    print(f"\n  {'ID':>8}  {'Equipo':<30}")
                    print("  " + "-" * 40)
                    for t in teams:
                        print(f"  {t['id']:>8}  {t['name']:<30}")
                else:
                    print("  Could not extract teams from league data.")

        elif cmd == "dashboard":
            data = get_league_data()
            if export_fmt == "json":
                _export_json(data, export_file)
            else:
                print_dashboard(data)

        elif cmd == "full":
            data = get_league_data()
            if export_fmt == "json":
                _export_json(data, export_file)
            else:
                print_standings(data)
                print_top_scorers(data)
                print_top_assisters(data)
                print_recent_and_upcoming(data)

        elif cmd == "scout":
            if len(sys.argv) < 3:
                print("Usage: python laliga_stats.py scout <team_id|name>")
                return
            team_id = _resolve_team_arg(sys.argv[2])
            if export_fmt == "json":
                league = get_league_data()
                report = generate_scout_report(team_id, league)
                _export_json({"report": report}, export_file)
            else:
                print_scout_report(team_id)

        elif cmd == "jornada":
            md = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else None
            data = get_league_data()
            if export_fmt == "json":
                # Export raw jornada data
                matches_data = data.get("matches", {}).get("allMatches", [])
                target_round = md or (
                    next((m.get("round") for m in matches_data if not m.get("status", {}).get("finished")), None)
                )
                target = [m for m in matches_data if str(m.get("round")) == str(target_round)]
                _export_json(target, export_file)
            else:
                print_jornada(data, matchday=md)

        elif cmd == "poisson":
            if len(sys.argv) < 4:
                print("Usage: python laliga_stats.py poisson <home_team> <away_team>")
                return
            home_id = _resolve_team_arg(sys.argv[2])
            away_id = _resolve_team_arg(sys.argv[3])
            league = get_league_data()
            result = compute_poisson_dixon_coles(home_id, away_id, league)
            if "error" in result:
                print(f"  Error: {result['error']}")
            else:
                home_name = get_team_data(home_id).get("details", {}).get("name", "Home")
                away_name = get_team_data(away_id).get("details", {}).get("name", "Away")
                print(f"\n{'=' * 60}")
                print(f"  POISSON DIXON-COLES: {home_name} vs {away_name}")
                print(f"{'=' * 60}")
                print(f"\n  λ_home (goles esperados local):    {result['lambda_home']}")
                print(f"  λ_away (goles esperados visitante): {result['lambda_away']}")
                print(f"\n  P(1) Victoria local:   {result['p1']*100:.1f}%")
                print(f"  P(X) Empate:           {result['px']*100:.1f}%")
                print(f"  P(2) Victoria visitante: {result['p2']*100:.1f}%")
                print(f"\n  Ataque home: {result['attack_home']}  |  Defensa home: {result['defense_home']}")
                print(f"  Ataque away: {result['attack_away']}  |  Defensa away: {result['defense_away']}")
                print(f"  Media liga: home={result['avg_home_league']} away={result['avg_away_league']}  ρ={result['rho']}")
                if export_fmt == "json":
                    _export_json(result, export_file)

        elif cmd == "agent-json":
            if len(sys.argv) < 4:
                print("Usage: python laliga_stats.py agent-json <home_team> <away_team>")
                return
            home_id = _resolve_team_arg(sys.argv[2])
            away_id = _resolve_team_arg(sys.argv[3])
            league = get_league_data()
            result = generate_agent_json(home_id, away_id, league)
            print(json.dumps(result, indent=2, ensure_ascii=False, default=str))

        elif cmd in ("help", "-h", "--help"):
            print_help()

        else:
            print(f"Unknown command: {cmd}")
            print_help()

    except requests.exceptions.HTTPError as e:
        status_code = e.response.status_code if e.response is not None else "?"
        if status_code == 429:
            print(f"Rate limited (HTTP 429). Wait a minute and try again.")
        elif status_code == 404:
            print(f"Not found (HTTP 404). Check that the ID exists. Use 'teams' or 'search-team'/'search-player' to find valid IDs.")
        else:
            print(f"HTTP Error {status_code}: {e}")
    except requests.exceptions.ConnectionError:
        print("Connection error. Check your internet connection.")
    except ResolveError as e:
        print(f"  {e}")
    except ValueError as e:
        print(f"Invalid argument: {e}")
        print("Expected a numeric ID or a valid name. Use 'search-team' or 'search-player' to find IDs.")
    except (KeyError, IndexError, TypeError) as e:
        import traceback
        print(f"Error parsing API response: {e}")
        log.debug("Parsing error details:", exc_info=True)
        if log.isEnabledFor(logging.DEBUG):
            traceback.print_exc()
        else:
            print("Run with LOGLEVEL=DEBUG for details. The FotMob API structure may have changed.")


if __name__ == "__main__":
    main()
