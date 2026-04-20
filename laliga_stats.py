#!/usr/bin/env python3
"""
LaLiga EA Sports 2025/26 stats scraper using FotMob public API.
No API key or registration required.
"""

import json
import sys
import time
from datetime import datetime, timedelta
from typing import Any

import requests

LALIGA_ID = 87
SEASON = "2025/2026"
BASE_URL = "https://www.fotmob.com/api"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Referer": "https://www.fotmob.com/",
}

REQUEST_DELAY = 1.5  # seconds between requests to be respectful


def _get(endpoint: str, params: dict | None = None) -> dict[str, Any]:
    url = f"{BASE_URL}/{endpoint}"
    resp = requests.get(url, headers=HEADERS, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def _delay():
    time.sleep(REQUEST_DELAY)


# ──────────────────────────────────────────────
# 1. League / standings
# ──────────────────────────────────────────────

def get_league_data() -> dict[str, Any]:
    return _get("leagues", {"id": LALIGA_ID, "ccode3": "ESP"})


def print_standings(league_data: dict[str, Any]) -> None:
    print("\n" + "=" * 70)
    print(f"  CLASIFICACIÓN — LaLiga EA Sports {SEASON}")
    print("=" * 70)

    tables = league_data.get("table", [])
    if not tables:
        print("  No standings data available.")
        return

    # FotMob nests tables; find the main one
    all_rows = []
    if isinstance(tables, list):
        for t in tables:
            data = t.get("data") or t
            if isinstance(data, dict):
                table_all = data.get("table", data.get("tables", []))
                if isinstance(table_all, dict):
                    all_rows = table_all.get("all", [])
                    break
                elif isinstance(table_all, list):
                    for sub in table_all:
                        if isinstance(sub, dict) and "all" in sub:
                            all_rows = sub["all"]
                            break
                    if all_rows:
                        break
            elif isinstance(data, list):
                all_rows = data
                break
    elif isinstance(tables, dict):
        all_rows = tables.get("all", [])

    if not all_rows:
        # Try alternative path
        raw_table = league_data.get("table")
        if isinstance(raw_table, list) and len(raw_table) > 0:
            first = raw_table[0]
            if isinstance(first, dict):
                data = first.get("data", first)
                if isinstance(data, dict):
                    tbl = data.get("table", {})
                    if isinstance(tbl, dict):
                        all_rows = tbl.get("all", [])
                    elif isinstance(tbl, list) and len(tbl) > 0:
                        all_rows = tbl[0].get("all", [])

    if not all_rows:
        print("  Could not parse standings structure.")
        print(f"  Raw table keys: {list(league_data.get('table', {}).keys()) if isinstance(league_data.get('table'), dict) else type(league_data.get('table'))}")
        return

    header = f"  {'#':>3}  {'Equipo':<25} {'PJ':>3} {'G':>3} {'E':>3} {'P':>3} {'GF':>4} {'GC':>4} {'DG':>4} {'Pts':>4}"
    print(header)
    print("  " + "-" * 66)

    for row in all_rows:
        pos = row.get("idx", row.get("position", ""))
        name = row.get("name", row.get("shortName", "???"))
        played = row.get("played", 0)
        wins = row.get("wins", 0)
        draws = row.get("draws", 0)
        losses = row.get("losses", 0)
        gf = row.get("scoresStr", "0-0").split("-")[0].strip() if isinstance(row.get("scoresStr"), str) else row.get("goalsFor", 0)
        gc = row.get("scoresStr", "0-0").split("-")[1].strip() if isinstance(row.get("scoresStr"), str) else row.get("goalsAgainst", 0)
        gd = row.get("goalConDiff", row.get("goalDifference", 0))
        pts = row.get("pts", 0)

        print(f"  {pos:>3}  {name:<25} {played:>3} {wins:>3} {draws:>3} {losses:>3} {gf:>4} {gc:>4} {gd:>4} {pts:>4}")


def extract_teams(league_data: dict[str, Any]) -> list[dict[str, Any]]:
    teams = []
    tables = league_data.get("table", [])

    all_rows = []
    if isinstance(tables, list):
        for t in tables:
            data = t.get("data") or t
            if isinstance(data, dict):
                table_all = data.get("table", data.get("tables", []))
                if isinstance(table_all, dict):
                    all_rows = table_all.get("all", [])
                elif isinstance(table_all, list):
                    for sub in table_all:
                        if isinstance(sub, dict) and "all" in sub:
                            all_rows = sub["all"]
                            break
            if all_rows:
                break

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
    return _get("teams", {"id": team_id, "ccode3": "ESP"})


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
# 3. Match details
# ──────────────────────────────────────────────

def get_match_details(match_id: int) -> dict[str, Any]:
    return _get("matchDetails", {"matchId": match_id})


def print_match_summary(match: dict[str, Any]) -> None:
    general = match.get("general", {})
    home = general.get("homeTeam", {})
    away = general.get("awayTeam", {})

    home_name = home.get("name", "Home")
    away_name = away.get("name", "Away")

    header = match.get("header", {})
    home_score = header.get("teams", [{}])[0].get("score", "?") if header.get("teams") else "?"
    away_score = header.get("teams", [{}])[1].get("score", "?") if header.get("teams") and len(header.get("teams", [])) > 1 else "?"

    status = general.get("matchTimeUTCDate", "")
    started = general.get("started", False)
    finished = general.get("finished", False)

    state = "Finished" if finished else ("Live" if started else status[:10] if status else "Scheduled")

    print(f"\n  {home_name} {home_score} - {away_score} {away_name}  [{state}]")

    # Events (goals, cards)
    content = match.get("content", {})
    events = content.get("matchFacts", {}).get("events", {})
    if isinstance(events, dict):
        events_list = events.get("events", [])
    elif isinstance(events, list):
        events_list = events
    else:
        events_list = []

    if events_list:
        print("  Events:")
        for ev in events_list:
            minute = ev.get("time", ev.get("timeStr", "?"))
            etype = ev.get("type", "")
            player = ev.get("nameStr", ev.get("player", ""))
            if player and etype:
                print(f"    {minute}' - {etype}: {player}")


# ──────────────────────────────────────────────
# 4. Player data
# ──────────────────────────────────────────────

def get_player_data(player_id: int) -> dict[str, Any]:
    return _get("playerData", {"id": player_id})


def print_player_profile(player: dict[str, Any]) -> None:
    name = player.get("name", "Unknown")
    team = player.get("primaryTeam", {}).get("teamName", "?")
    position = player.get("positionDescription", {}).get("primaryPosition", {}).get("label", "?")

    print(f"\n{'─' * 50}")
    print(f"  {name} — {team} ({position})")
    print(f"{'─' * 50}")

    # Season stats
    main_league = player.get("mainLeague", {})
    stats = main_league.get("stats", [])
    if stats:
        print("  Season stats:")
        for s in stats:
            title = s.get("title", "")
            value = s.get("value", "")
            if title and value is not None:
                print(f"    {title}: {value}")

    # Performance summary
    perf = player.get("performanceScore", {})
    if perf:
        score = perf.get("value", "?")
        print(f"  Performance score: {score}")


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
                score_home = status.get("scoreStr", "? - ?").split(" - ")[0] if status.get("scoreStr") else "?"
                score_away = status.get("scoreStr", "? - ?").split(" - ")[1] if status.get("scoreStr") else "?"
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

    return laliga_matches


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
        print(f"\n{'=' * 60}")
        print(f"  ÚLTIMOS RESULTADOS")
        print(f"{'=' * 60}")
        for m in recent[-10:]:
            home = m.get("home", {}).get("name", "?")
            away = m.get("away", {}).get("name", "?")
            score = m.get("status", {}).get("scoreStr", "? - ?")
            rnd = m.get("round", "")
            print(f"  J{rnd:>2}  {home:>25} {score:^7} {away:<25}")

    if upcoming:
        print(f"\n{'=' * 60}")
        print(f"  PRÓXIMOS PARTIDOS")
        print(f"{'=' * 60}")
        for m in upcoming[:10]:
            home = m.get("home", {}).get("name", "?")
            away = m.get("away", {}).get("name", "?")
            utc = m.get("status", {}).get("utcTime", "")
            date_str = utc[:10] if utc else "TBD"
            rnd = m.get("round", "")
            print(f"  J{rnd:>2}  {home:>25}  vs  {away:<25}  {date_str}")


# ──────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────

def print_help():
    print("""
LaLiga Stats — FotMob Scraper
Usage: python laliga_stats.py [command] [args]

Commands:
  standings              Show current LaLiga standings
  scorers                Top scorers
  assisters              Top assisters
  fixtures               Recent results & upcoming matches
  team <team_id>         Team overview + squad
  match <match_id>       Match details
  player <player_id>     Player profile & stats
  date <YYYYMMDD>        LaLiga matches on a given date
  today                  Today's LaLiga matches
  full                   Full report (standings + scorers + assisters + fixtures)
  teams                  List all teams with IDs

Examples:
  python laliga_stats.py standings
  python laliga_stats.py team 8633
  python laliga_stats.py player 194165
  python laliga_stats.py date 20260418
  python laliga_stats.py full
""")


def main():
    if len(sys.argv) < 2:
        print_help()
        return

    cmd = sys.argv[1].lower()

    try:
        if cmd == "standings":
            data = get_league_data()
            print_standings(data)

        elif cmd == "scorers":
            data = get_league_data()
            print_top_scorers(data)

        elif cmd == "assisters":
            data = get_league_data()
            print_top_assisters(data)

        elif cmd == "fixtures":
            data = get_league_data()
            print_recent_and_upcoming(data)

        elif cmd == "team":
            if len(sys.argv) < 3:
                print("Usage: python laliga_stats.py team <team_id>")
                print("Use 'python laliga_stats.py teams' to list team IDs.")
                return
            team_id = int(sys.argv[2])
            data = get_team_data(team_id)
            print_team_overview(data)
            print_squad(data)

        elif cmd == "match":
            if len(sys.argv) < 3:
                print("Usage: python laliga_stats.py match <match_id>")
                return
            match_id = int(sys.argv[2])
            data = get_match_details(match_id)
            print_match_summary(data)

        elif cmd == "player":
            if len(sys.argv) < 3:
                print("Usage: python laliga_stats.py player <player_id>")
                return
            player_id = int(sys.argv[2])
            data = get_player_data(player_id)
            print_player_profile(data)

        elif cmd == "date":
            if len(sys.argv) < 3:
                print("Usage: python laliga_stats.py date <YYYYMMDD>")
                return
            date = sys.argv[2]
            data = get_matches_by_date(date)
            print_matches_for_date(date, data)

        elif cmd == "today":
            today = datetime.now().strftime("%Y%m%d")
            data = get_matches_by_date(today)
            print_matches_for_date(today, data)

        elif cmd == "teams":
            data = get_league_data()
            teams = extract_teams(data)
            if teams:
                print(f"\n  {'ID':>8}  {'Equipo':<30}")
                print("  " + "-" * 40)
                for t in teams:
                    print(f"  {t['id']:>8}  {t['name']:<30}")
            else:
                print("  Could not extract teams from league data.")

        elif cmd == "full":
            data = get_league_data()
            print_standings(data)
            print_top_scorers(data)
            _delay()
            print_top_assisters(data)
            print_recent_and_upcoming(data)

        elif cmd in ("help", "-h", "--help"):
            print_help()

        else:
            print(f"Unknown command: {cmd}")
            print_help()

    except requests.exceptions.HTTPError as e:
        print(f"HTTP Error: {e}")
        print("FotMob may be rate-limiting or the endpoint structure may have changed.")
    except requests.exceptions.ConnectionError:
        print("Connection error. Check your internet connection.")
    except (KeyError, IndexError, TypeError) as e:
        print(f"Error parsing response: {e}")
        print("The FotMob API response structure may have changed.")


if __name__ == "__main__":
    main()
