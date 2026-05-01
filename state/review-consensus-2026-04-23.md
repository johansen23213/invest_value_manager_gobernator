# Consensus Review — laliga_stats.py
# 2026-04-23 (updated 2026-04-30)

## Phase 0 — Immediate ✅ (commit 112281e)
## Phase 1 — Quick Wins ✅ (commit bbe874f)
## Phase 2 — Core Improvements ✅ (commit d1c06c3)

## Phase 3 — Polish (21 items)
1. CONS-013: Standardize language (Spanish) (M)
2. CONS-017: Add color/visual hierarchy with ANSI codes (M)
3. CONS-021: Standardize emoji usage (S)
4. CONS-029: Move unicodedata import to top (S) ✅ (done in Phase 0)
5. CONS-030: Make league configurable (M)
6. CONS-031: Add type hints to all functions (S)
7. CONS-032: Extract magic numbers to named constants (S)
8. CONS-034: Strip control chars from API strings (M)
9. CONS-035: Document User-Agent choice (S)
10. CONS-037: Add response size limit (S)
11. CONS-038: Fix inconsistent return in print_matches_for_date (S)
12. CONS-039: Rename team-competitions to team-calendar (S)
13. CONS-040: Add --limit flag for pagination (M)
14. CONS-053: Expected points table (L)
15. CONS-054: Player percentile rankings (XL)
16. CONS-055: Season-over-season comparison (M)
17. CONS-058: League summary dashboard (M)
18. CONS-059: Shot map visualization (M)
19. CONS-060: Advanced metrics (M)
20. CONS-061: Set piece analysis (M)
21. CONS-062: Investment manager integration (XL)

## Phase 4 — Agent Pipeline Integration (new)
1. scout-report <team_id>: Structured markdown output for scout agents
2. Poisson Dixon-Coles: lambda_local/visitante from last 38 matches per team
3. jornada <N>: Batch all matchday fixtures with auto scout reports
4. --agent-json flag: Machine-readable output format for Claude SDK agents
5. verificador-24h: Pre-kickoff check comparing scout data vs current state
