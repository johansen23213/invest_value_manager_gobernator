#!/usr/bin/env python3
"""
Backtest module — accumulate predictions vs results across matchdays.

Tracks performance over time to measure:
1. Is the Brier score improving?
2. Which types of matches do we predict well/poorly?
3. Are specific biases (away underestimation, draw overestimation) reducing?
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from analytics.calibration import (
    brier_score,
    log_loss_score,
    identify_systematic_bias,
    calibration_curve,
)

STATE_DIR = Path(__file__).parent.parent / "state" / "data" / "backtest"


def record_prediction(
    jornada: int,
    match_number: int,
    match: str,
    home_team: str,
    away_team: str,
    predictions: dict[str, float],
    source: str = "pipeline",
    context: dict | None = None,
) -> dict[str, Any]:
    """Record a single match prediction before the match is played."""
    return {
        "jornada": jornada,
        "match_number": match_number,
        "match": match,
        "home_team": home_team,
        "away_team": away_team,
        "predictions": predictions,
        "source": source,
        "context": context or {},
        "recorded_at": datetime.now().isoformat(),
        "result": None,
    }


def record_result(
    prediction: dict[str, Any],
    result: str,
    score: str = "",
) -> dict[str, Any]:
    """Add the actual result to a recorded prediction."""
    prediction["result"] = result.upper()
    prediction["score"] = score
    prediction["result_recorded_at"] = datetime.now().isoformat()
    return prediction


def save_jornada_predictions(jornada: int, predictions: list[dict]) -> str:
    """Save all predictions for a jornada."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    filepath = STATE_DIR / f"j{jornada:02d}_predictions.json"
    data = {
        "jornada": jornada,
        "date": datetime.now().isoformat(),
        "predictions": predictions,
        "results_complete": all(p.get("result") for p in predictions),
    }
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return str(filepath)


def load_jornada(jornada: int) -> dict[str, Any] | None:
    filepath = STATE_DIR / f"j{jornada:02d}_predictions.json"
    if not filepath.exists():
        return None
    with open(filepath) as f:
        return json.load(f)


def evaluate_jornada(jornada: int) -> dict[str, Any] | None:
    """Evaluate a completed jornada. Returns None if results incomplete."""
    data = load_jornada(jornada)
    if not data:
        return None

    preds = data["predictions"]
    completed = [p for p in preds if p.get("result")]
    if not completed:
        return None

    pred_probs = [p["predictions"] for p in completed]
    results = [p["result"] for p in completed]

    bs = brier_score(pred_probs, results)
    ll = log_loss_score(pred_probs, results)
    bias = identify_systematic_bias(pred_probs, results)

    # Accuracy
    correct = 0
    for p, r in zip(pred_probs, results):
        fav_key = max(p, key=p.get)
        fav = {"p1": "1", "px": "X", "p2": "2"}[fav_key]
        if fav == r:
            correct += 1

    # Surprise analysis: which misses were predictable?
    misses = []
    for pred_data, pred_prob, result in zip(completed, pred_probs, results):
        fav_key = max(pred_prob, key=pred_prob.get)
        fav = {"p1": "1", "px": "X", "p2": "2"}[fav_key]
        if fav != result:
            misses.append({
                "match": pred_data["match"],
                "predicted": fav,
                "actual": result,
                "prob_assigned_to_actual": pred_prob[{"1": "p1", "X": "px", "2": "p2"}[result]],
                "surprise_risk": pred_data.get("context", {}).get("surprise_risk"),
            })

    return {
        "jornada": jornada,
        "matches_evaluated": len(completed),
        "brier_score": round(bs, 4),
        "log_loss": round(ll, 4),
        "accuracy": f"{correct}/{len(completed)}",
        "accuracy_pct": round(correct / len(completed) * 100, 1),
        "bias": bias,
        "misses": misses,
        "was_surprise_predicted": sum(
            1 for m in misses
            if m["surprise_risk"] and m["surprise_risk"] > 50
        ),
    }


def cumulative_report() -> dict[str, Any]:
    """Generate cumulative performance report across all jornadas."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(STATE_DIR.glob("j*_predictions.json"))

    if not files:
        return {"error": "No backtest data found"}

    all_preds = []
    all_results = []
    per_jornada = []

    for f in files:
        with open(f) as fh:
            data = json.load(fh)
        jornada = data["jornada"]
        completed = [p for p in data["predictions"] if p.get("result")]
        if not completed:
            continue

        preds = [p["predictions"] for p in completed]
        results = [p["result"] for p in completed]
        all_preds.extend(preds)
        all_results.extend(results)

        bs = brier_score(preds, results)
        per_jornada.append({"jornada": jornada, "brier": round(bs, 4), "matches": len(completed)})

    if not all_preds:
        return {"error": "No completed predictions found"}

    total_bs = brier_score(all_preds, all_results)
    total_bias = identify_systematic_bias(all_preds, all_results)

    # Trend
    briers = [j["brier"] for j in per_jornada]
    trend = briers[-1] - briers[0] if len(briers) > 1 else 0

    correct = 0
    for p, r in zip(all_preds, all_results):
        fav_key = max(p, key=p.get)
        fav = {"p1": "1", "px": "X", "p2": "2"}[fav_key]
        if fav == r:
            correct += 1

    return {
        "jornadas_evaluated": len(per_jornada),
        "total_matches": len(all_preds),
        "overall_brier": round(total_bs, 4),
        "overall_accuracy": f"{correct}/{len(all_preds)} ({correct/len(all_preds)*100:.1f}%)",
        "trend": round(trend, 4),
        "trend_direction": "📈 MEJORANDO" if trend < -0.02 else ("📉 EMPEORANDO" if trend > 0.02 else "➡️ ESTABLE"),
        "bias": total_bias,
        "per_jornada": per_jornada,
        "target": "Brier < 0.50 = edge real. Current random = 0.667.",
    }


def print_cumulative() -> None:
    """Print cumulative report."""
    report = cumulative_report()
    if "error" in report:
        print(f"  {report['error']}")
        return

    print(f"\n{'=' * 60}")
    print(f"  BACKTEST — INFORME ACUMULATIVO")
    print(f"{'=' * 60}")
    print(f"\n  Jornadas evaluadas: {report['jornadas_evaluated']}")
    print(f"  Partidos totales:   {report['total_matches']}")
    print(f"  Brier Score:        {report['overall_brier']}")
    print(f"  Accuracy:           {report['overall_accuracy']}")
    print(f"  Tendencia:          {report['trend_direction']} ({report['trend']:+.4f})")
    print(f"\n  Objetivo: Brier < 0.50 = edge real")

    bias = report["bias"]
    print(f"\n  Sesgos:")
    for outcome, data in bias["biases"].items():
        print(f"    {outcome}: pred {data['avg_predicted']:.3f} vs real {data['actual_freq']:.3f} → {data['direction']}")

    if report["per_jornada"]:
        print(f"\n  Histórico:")
        for j in report["per_jornada"]:
            bar = "█" * int((1 - j["brier"]) * 20)
            print(f"    J{j['jornada']:>2}: Brier {j['brier']:.4f}  {bar}")


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "report":
        print_cumulative()
    else:
        print("Usage: python backtest.py report")
        print("\nNo data yet. Record predictions with save_jornada_predictions().")
