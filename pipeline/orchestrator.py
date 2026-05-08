#!/usr/bin/env python3
"""
Pipeline orchestrator — runs the complete prediction workflow for a jornada.

This is the entry point that connects everything:
1. Load verified standings (Primera + Segunda)
2. Load quiniela fixtures (15 matches)
3. Run enhanced Poisson for each match
4. Run surprise detector for each match
5. Apply anti-bias validation
6. Generate column strategy
7. Record predictions for backtest

Usage:
  python orchestrator.py run          Generate predictions for next quiniela
  python orchestrator.py status       Show pipeline status
  python orchestrator.py evaluate     Evaluate last completed jornada
"""

import json
import sys
from datetime import datetime
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from analytics.surprise_detector import analyze_match_surprise
from analytics.backtest import record_prediction, save_jornada_predictions
from pipeline.quiniela import compute_match_prediction, generate_quiniela_predictions, print_quiniela_report

STATE_DIR = Path(__file__).parent.parent / "state" / "data"


def load_latest_standings(league: str) -> dict | None:
    """Load most recent standings file for a league."""
    if league == "primera":
        pattern = "laliga_j*_*.json"
    elif league == "segunda":
        pattern = "segunda_j*_*.json"
    else:
        return None

    files = sorted(STATE_DIR.glob(pattern), reverse=True)
    for f in files:
        try:
            with open(f) as fh:
                data = json.load(fh)
            if data.get("standings"):
                return data
        except (json.JSONDecodeError, KeyError):
            continue
    return None


def load_fixtures(filename: str = None) -> list[dict] | None:
    """Load quiniela fixtures from a preview file."""
    if filename:
        filepath = STATE_DIR / filename
    else:
        # Find latest j*_preview.json
        previews = sorted(STATE_DIR.glob("*_preview*.json"), reverse=True)
        if not previews:
            return None
        filepath = previews[0]

    with open(filepath) as f:
        data = json.load(f)

    return data.get("fixtures", [])


def enrich_fixtures(fixtures: list[dict], primera: dict, segunda: dict) -> list[dict]:
    """Add standings context to fixtures that might be missing it."""
    all_teams = {}
    for s in primera.get("standings", []):
        all_teams[s["team"].lower()] = s
    for s in segunda.get("standings", []):
        all_teams[s["team"].lower()] = s

    enriched = []
    for f in fixtures:
        home = f.get("home", "")
        away = f.get("away", "")
        home_data = all_teams.get(home.lower(), {})
        away_data = all_teams.get(away.lower(), {})

        enriched.append({
            "home": home,
            "away": away,
            "home_pos": f.get("home_pos") or home_data.get("pos", 10),
            "away_pos": f.get("away_pos") or away_data.get("pos", 10),
            "home_pts": f.get("home_pts") or home_data.get("pts", 40),
            "away_pts": f.get("away_pts") or away_data.get("pts", 40),
            "home_form": f.get("home_form"),
            "away_form": f.get("away_form"),
            "date": f.get("date"),
            "context": f.get("context", ""),
        })
    return enriched


def run_pipeline(jornada: int | None = None) -> dict:
    """Execute full prediction pipeline."""
    print(f"\n{'=' * 70}")
    print(f"  PIPELINE QUINIELA — EJECUCIÓN COMPLETA")
    print(f"{'=' * 70}")

    # 1. Load data
    print("\n  [1/5] Cargando datos verificados...")
    primera = load_latest_standings("primera")
    segunda = load_latest_standings("segunda")

    if not primera:
        print("    ❌ No hay datos de Primera División")
        return {"error": "Missing Primera data"}
    if not segunda:
        print("    ❌ No hay datos de Segunda División")
        return {"error": "Missing Segunda data"}

    p_md = primera.get("matchday", "?")
    s_md = segunda.get("matchday", "?")
    print(f"    ✅ Primera: J{p_md} ({len(primera.get('standings', []))} equipos)")
    print(f"    ✅ Segunda: J{s_md} ({len(segunda.get('standings', []))} equipos)")

    # 2. Load fixtures
    print("\n  [2/5] Cargando fixtures de quiniela...")
    fixtures = load_fixtures()
    if not fixtures:
        print("    ❌ No hay fixtures cargados")
        return {"error": "Missing fixtures"}
    print(f"    ✅ {len(fixtures)} partidos cargados")

    # 3. Enrich fixtures with standings data
    print("\n  [3/5] Enriqueciendo con datos de clasificación...")
    enriched = enrich_fixtures(fixtures, primera, segunda)
    print(f"    ✅ {len(enriched)} partidos enriquecidos")

    # 4. Generate predictions
    print("\n  [4/5] Generando predicciones (Poisson + Surprise Detector)...")
    result = generate_quiniela_predictions(enriched)
    print(f"    ✅ {len(result['predictions'])} predicciones generadas")

    # 5. Output
    print("\n  [5/5] Resultado final:")
    print_quiniela_report(result)

    # Record for backtest
    if jornada:
        predictions_for_backtest = []
        for i, (pred, fix) in enumerate(zip(result["predictions"], enriched), 1):
            entry = record_prediction(
                jornada=jornada,
                match_number=i,
                match=pred["match"],
                home_team=fix["home"],
                away_team=fix["away"],
                predictions={"p1": pred["p1"], "px": pred["px"], "p2": pred["p2"]},
                source="pipeline_v1",
                context={"surprise_risk": pred.get("surprise_risk"), "context": fix.get("context")},
            )
            predictions_for_backtest.append(entry)

        filepath = save_jornada_predictions(jornada, predictions_for_backtest)
        print(f"\n  📁 Predicciones guardadas: {filepath}")

    return result


def print_status() -> None:
    """Print pipeline status."""
    print(f"\n{'=' * 60}")
    print(f"  PIPELINE STATUS")
    print(f"{'=' * 60}")

    primera = load_latest_standings("primera")
    segunda = load_latest_standings("segunda")
    fixtures = load_fixtures()

    print(f"\n  Datos:")
    if primera:
        audit = primera.get("audit", {})
        conf = audit.get("confidence", primera.get("data_quality", "?"))
        print(f"    Primera: J{primera.get('matchday', '?')} — {conf}")
    else:
        print(f"    Primera: ❌ NO DISPONIBLE")

    if segunda:
        print(f"    Segunda: J{segunda.get('matchday', '?')} — {segunda.get('data_quality', '?')}")
    else:
        print(f"    Segunda: ❌ NO DISPONIBLE")

    if fixtures:
        print(f"    Fixtures: {len(fixtures)} partidos cargados")
    else:
        print(f"    Fixtures: ❌ NO DISPONIBLE")

    # Check backtest history
    backtest_dir = STATE_DIR / "backtest"
    if backtest_dir.exists():
        bt_files = list(backtest_dir.glob("j*_predictions.json"))
        print(f"\n  Backtest: {len(bt_files)} jornadas registradas")
    else:
        print(f"\n  Backtest: Sin historial")

    # Check decision logs
    decisions_dir = STATE_DIR / "decisions"
    if decisions_dir.exists():
        dec_files = list(decisions_dir.glob("j*_decisions.json"))
        print(f"  Decisiones CIO: {len(dec_files)} jornadas registradas")

    print(f"\n  Módulos:")
    modules = [
        ("analytics/calibration.py", "Brier score & calibración"),
        ("analytics/enhanced_poisson.py", "Poisson Dixon-Coles mejorado"),
        ("analytics/surprise_detector.py", "Detector de sorpresas (6 factores)"),
        ("analytics/anti_bias.py", "Anti-sesgo CIO"),
        ("analytics/backtest.py", "Backtest histórico"),
        ("pipeline/quiniela.py", "Generador de columnas"),
        ("pipeline/orchestrator.py", "Orquestador (este fichero)"),
        ("scrapers/web_collector.py", "Recolector via WebSearch"),
    ]
    for path, desc in modules:
        exists = (Path(__file__).parent.parent / path).exists()
        status = "✅" if exists else "❌"
        print(f"    {status} {path:<35} {desc}")


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] == "status":
        print_status()
    elif sys.argv[1] == "run":
        jornada = int(sys.argv[2]) if len(sys.argv) > 2 else None
        run_pipeline(jornada)
    else:
        print("Usage: python orchestrator.py [status|run [jornada]]")
