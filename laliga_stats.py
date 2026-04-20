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
# 4. Player data — FULL STATISTICS
# ──────────────────────────────────────────────

def get_player_data(player_id: int) -> dict[str, Any]:
    return _get("playerData", {"id": player_id})


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
        _print_section("PERFORMANCE SCORE")
        score = perf.get("value", "?")
        official = perf.get("officialRating", "?")
        print(f"    Score: {score}")
        if official and official != "?":
            print(f"    Official rating: {official}")

    # ── Main league season stats ──
    main_league = player.get("mainLeague", {})
    league_name = main_league.get("leagueName", "Main League")
    stats = main_league.get("stats", [])
    if stats:
        _print_section(f"STATS TEMPORADA — {league_name}")
        for s in stats:
            title = s.get("title", "")
            value = s.get("value", "")
            if title and value is not None:
                print(f"    {title:<35} {value}")

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
                trend_arrow = "📈" if trend > 0.15 else "📉" if trend < -0.15 else "➡️"
                print(f"    Tendencia:             {trend_arrow} {trend:+.2f} (últimos 5 vs anteriores)")

            # Consistency
            if len(ratings) >= 3:
                variance = sum((r - avg_rating) ** 2 for r in ratings) / len(ratings)
                std_dev = variance ** 0.5
                consistency = "Alta" if std_dev < 0.4 else "Media" if std_dev < 0.8 else "Baja"
                print(f"    Consistencia:          {consistency} (σ={std_dev:.2f})")

            # Rating distribution
            elite = sum(1 for r in ratings if r >= 8.0)
            good = sum(1 for r in ratings if 7.0 <= r < 8.0)
            avg = sum(1 for r in ratings if 6.0 <= r < 7.0)
            poor = sum(1 for r in ratings if r < 6.0)
            print(f"    Distribución ratings:  ⭐≥8.0:{elite}  ✅7-8:{good}  ➖6-7:{avg}  ❌<6:{poor}")

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

    print(f"\n  Total jugadores: {len(player_ids)}")
    print(f"  Fetching individual stats (this may take a while)...\n")

    for i, (pid, pname) in enumerate(player_ids, 1):
        print(f"\n  [{i}/{len(player_ids)}] Fetching {pname} (ID: {pid})...")
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
  player <player_id>     Full player profile & all stats
  player-json <id>       Raw JSON dump of player data (for debugging)
  squad-stats <team_id>  Full stats for every player in a team's squad
  date <YYYYMMDD>        LaLiga matches on a given date
  today                  Today's LaLiga matches
  full                   Full report (standings + scorers + assisters + fixtures)
  teams                  List all teams with IDs

Examples:
  python laliga_stats.py standings
  python laliga_stats.py team 8633
  python laliga_stats.py player 194165
  python laliga_stats.py player-json 194165
  python laliga_stats.py squad-stats 8633
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

        elif cmd == "player-json":
            if len(sys.argv) < 3:
                print("Usage: python laliga_stats.py player-json <player_id>")
                return
            player_id = int(sys.argv[2])
            data = get_player_data(player_id)
            dump_player_json(data)

        elif cmd == "squad-stats":
            if len(sys.argv) < 3:
                print("Usage: python laliga_stats.py squad-stats <team_id>")
                print("Use 'python laliga_stats.py teams' to list team IDs.")
                return
            team_id = int(sys.argv[2])
            print_squad_full_stats(team_id)

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
