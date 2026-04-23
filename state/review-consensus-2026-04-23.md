# Consensus Review — laliga_stats.py
# 2026-04-23

## Phase 0 — Immediate (6 items)
1. CONS-001: Fix score parsing with regex; use None for missing scores (M)
2. CONS-002: Narrow exception catching; add logging (M)
3. CONS-008: Add try/except to all bare int() conversions (S)
4. CONS-011: Fix _parse_date() timezone handling (S)
5. CONS-012: Sanitize export filenames (S)
6. CONS-026: Remove unnecessary _delay() in full command (S)

## Phase 1 — Quick Wins (20 items)
1. CONS-003: Deduplicate standings parsing (S)
2. CONS-043: Add form column to standings (S)
3. CONS-044: Parse additional stat leader categories (S)
4. CONS-045: Add per-90 stats to player profile (S)
5. CONS-005: Add session-level request cache (M)
6. CONS-004: Use cache + progress for search-player (M)
7. CONS-007: Fall back to score-based W/D/L detection (M)
8. CONS-009: Warn when --csv unsupported (S)
9. CONS-014: Show match IDs in fixtures output (S)
10. CONS-015: Accept multiple date formats + relative dates (S)
11. CONS-016: Add --team filter to standings/fixtures (S)
12. CONS-018: Improve help text with command groups (S)
13. CONS-019: Add ETA to squad-stats progress (S)
14. CONS-024: Sort recent matches by date before form analysis (S)
15. CONS-027: Validate entity ID in API response (S)
16. CONS-028: Collect all keys for CSV fieldnames (S)
17. CONS-033: Validate date argument before API call (S)
18. CONS-036: Create requirements.txt (S)
19. CONS-041: Report skipped teams in player search (S)
20. CONS-042: Validate date string length before slicing (S)

## Phase 2 — Core Improvements (15 items)
## Phase 3 — Polish (21 items)

Full report in agent memory. 78 original findings → 62 consolidated.
