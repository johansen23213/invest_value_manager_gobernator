#!/usr/bin/env python3
"""
Calibration module — measure prediction quality and detect systematic biases.

The Brier score is the primary metric. Without measuring it after each matchday,
we cannot know if the pipeline is improving.

Brier score: mean of (predicted_prob - actual_outcome)^2 for each outcome.
Perfect = 0.0, random (0.33 each) = 0.667, always picking favorite ~= 0.5-0.6.
"""

import json
import math
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

STATE_DIR = Path(__file__).parent.parent / "state" / "data" / "calibration"


def brier_score(predictions: list[dict[str, float]], results: list[str]) -> float:
    """
    Compute Brier score for a set of 1X2 predictions.

    predictions: [{"p1": 0.5, "px": 0.3, "p2": 0.2}, ...]
    results: ["1", "X", "2", ...] — actual outcomes
    """
    if not predictions or len(predictions) != len(results):
        raise ValueError("predictions and results must have same non-zero length")

    total = 0.0
    for pred, actual in zip(predictions, results):
        actual_upper = actual.upper()
        o1 = 1.0 if actual_upper == "1" else 0.0
        ox = 1.0 if actual_upper == "X" else 0.0
        o2 = 1.0 if actual_upper == "2" else 0.0

        total += (pred["p1"] - o1) ** 2
        total += (pred["px"] - ox) ** 2
        total += (pred["p2"] - o2) ** 2

    return total / len(predictions)


def log_loss_score(predictions: list[dict[str, float]], results: list[str]) -> float:
    """Compute log loss (cross-entropy) — penalizes confident wrong predictions harder."""
    if not predictions or len(predictions) != len(results):
        raise ValueError("predictions and results must have same non-zero length")

    eps = 1e-10
    total = 0.0
    for pred, actual in zip(predictions, results):
        actual_upper = actual.upper()
        if actual_upper == "1":
            prob = max(pred["p1"], eps)
        elif actual_upper == "X":
            prob = max(pred["px"], eps)
        else:
            prob = max(pred["p2"], eps)
        total -= math.log(prob)

    return total / len(predictions)


def calibration_curve(
    predictions: list[dict[str, float]],
    results: list[str],
    bins: int = 5,
) -> list[dict[str, Any]]:
    """
    Group all predicted probabilities into bins, compare predicted vs actual frequency.

    Returns list of bins with: bin_center, predicted_avg, actual_freq, count.
    A well-calibrated model has predicted_avg ≈ actual_freq for each bin.
    """
    all_probs = []
    for pred, actual in zip(predictions, results):
        actual_upper = actual.upper()
        all_probs.append((pred["p1"], 1.0 if actual_upper == "1" else 0.0))
        all_probs.append((pred["px"], 1.0 if actual_upper == "X" else 0.0))
        all_probs.append((pred["p2"], 1.0 if actual_upper == "2" else 0.0))

    all_probs.sort(key=lambda x: x[0])

    bin_size = max(1, len(all_probs) // bins)
    curve = []
    for i in range(0, len(all_probs), bin_size):
        chunk = all_probs[i:i + bin_size]
        if not chunk:
            continue
        predicted_avg = sum(p for p, _ in chunk) / len(chunk)
        actual_freq = sum(a for _, a in chunk) / len(chunk)
        curve.append({
            "bin_center": round(predicted_avg, 3),
            "predicted_avg": round(predicted_avg, 3),
            "actual_freq": round(actual_freq, 3),
            "count": len(chunk),
            "gap": round(abs(predicted_avg - actual_freq), 3),
        })

    return curve


def identify_systematic_bias(
    predictions: list[dict[str, float]],
    results: list[str],
) -> dict[str, Any]:
    """
    Detect whether the system over/under-prices specific outcomes.

    Returns average predicted prob vs actual frequency for 1, X, 2,
    and identifies the biggest bias.
    """
    outcome_preds: dict[str, list[float]] = {"1": [], "X": [], "2": []}
    outcome_actuals: dict[str, int] = {"1": 0, "X": 0, "2": 0}

    for pred, actual in zip(predictions, results):
        actual_upper = actual.upper()
        outcome_preds["1"].append(pred["p1"])
        outcome_preds["X"].append(pred["px"])
        outcome_preds["2"].append(pred["p2"])
        outcome_actuals[actual_upper] += 1

    total = len(results)
    biases = {}
    for outcome in ("1", "X", "2"):
        avg_predicted = sum(outcome_preds[outcome]) / len(outcome_preds[outcome])
        actual_freq = outcome_actuals[outcome] / total
        bias = avg_predicted - actual_freq
        biases[outcome] = {
            "avg_predicted": round(avg_predicted, 4),
            "actual_freq": round(actual_freq, 4),
            "bias": round(bias, 4),
            "direction": "OVER" if bias > 0.02 else ("UNDER" if bias < -0.02 else "OK"),
        }

    worst = max(biases.items(), key=lambda x: abs(x[1]["bias"]))
    return {
        "biases": biases,
        "worst_bias": {"outcome": worst[0], **worst[1]},
        "interpretation": _interpret_bias(biases),
    }


def _interpret_bias(biases: dict) -> str:
    msgs = []
    for outcome, data in biases.items():
        if data["direction"] == "OVER":
            label = {"1": "victorias locales", "X": "empates", "2": "victorias visitantes"}[outcome]
            msgs.append(f"Sobreestimas {label} en {abs(data['bias'])*100:.1f}pp")
        elif data["direction"] == "UNDER":
            label = {"1": "victorias locales", "X": "empates", "2": "victorias visitantes"}[outcome]
            msgs.append(f"Infraestimas {label} en {abs(data['bias'])*100:.1f}pp")
    return ". ".join(msgs) if msgs else "Calibración correcta."


def backtest_jornada(
    predictions_file: str,
    results: list[dict[str, str]],
) -> dict[str, Any]:
    """
    Load predictions from a JSON file and compare to actual results.

    predictions_file: path to JSON with list of {"match": str, "p1": float, "px": float, "p2": float}
    results: [{"match": str, "result": "1"|"X"|"2"}, ...]
    """
    with open(predictions_file, "r") as f:
        preds_raw = json.load(f)

    if isinstance(preds_raw, dict):
        preds_raw = preds_raw.get("predictions", preds_raw.get("matches", []))

    # Match predictions to results by match name
    matched_preds = []
    matched_results = []
    unmatched = []

    for res in results:
        match_name = res["match"].lower().strip()
        found = False
        for pred in preds_raw:
            pred_name = pred.get("match", "").lower().strip()
            if match_name in pred_name or pred_name in match_name:
                matched_preds.append({"p1": pred["p1"], "px": pred["px"], "p2": pred["p2"]})
                matched_results.append(res["result"])
                found = True
                break
        if not found:
            unmatched.append(res["match"])

    if not matched_preds:
        return {"error": "No predictions matched to results", "unmatched": unmatched}

    bs = brier_score(matched_preds, matched_results)
    ll = log_loss_score(matched_preds, matched_results)
    bias = identify_systematic_bias(matched_preds, matched_results)
    curve = calibration_curve(matched_preds, matched_results)

    # Accuracy: how many times the most likely outcome was correct
    correct = 0
    for pred, actual in zip(matched_preds, matched_results):
        predicted = max(pred, key=pred.get)
        predicted_outcome = {"p1": "1", "px": "X", "p2": "2"}[predicted]
        if predicted_outcome == actual.upper():
            correct += 1

    accuracy = correct / len(matched_preds)

    return {
        "matches_evaluated": len(matched_preds),
        "unmatched": unmatched,
        "brier_score": round(bs, 4),
        "log_loss": round(ll, 4),
        "accuracy": round(accuracy, 4),
        "correct": correct,
        "total": len(matched_preds),
        "bias": bias,
        "calibration_curve": curve,
        "assessment": _assess_brier(bs),
    }


def _assess_brier(bs: float) -> str:
    if bs < 0.40:
        return "EXCELENTE — calibración de nivel profesional"
    elif bs < 0.50:
        return "BUENO — edge real sobre el mercado probable"
    elif bs < 0.55:
        return "DECENTE — mejorando, edge marginal"
    elif bs < 0.60:
        return "REGULAR — poco mejor que las odds implícitas"
    elif bs < 0.667:
        return "POBRE — apenas mejor que random"
    else:
        return "MALO — peor que asignar 33% a cada resultado"


def save_jornada_calibration(
    jornada: int,
    predictions: list[dict],
    results: list[str],
    extra_meta: dict | None = None,
) -> str:
    """Save calibration results for a matchday."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)

    bs = brier_score(predictions, results)
    ll = log_loss_score(predictions, results)
    bias = identify_systematic_bias(predictions, results)

    data = {
        "jornada": jornada,
        "date": datetime.now().isoformat(),
        "matches": len(predictions),
        "brier_score": round(bs, 4),
        "log_loss": round(ll, 4),
        "bias": bias,
        "assessment": _assess_brier(bs),
    }
    if extra_meta:
        data["meta"] = extra_meta

    filepath = STATE_DIR / f"j{jornada:02d}_calibration.json"
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    return str(filepath)


def load_cumulative_calibration() -> dict[str, Any]:
    """Load all saved calibration files and compute cumulative stats."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(STATE_DIR.glob("j*_calibration.json"))

    if not files:
        return {"error": "No calibration data found"}

    all_brier = []
    all_jornadas = []
    for f in files:
        with open(f) as fh:
            data = json.load(fh)
        all_brier.append(data["brier_score"])
        all_jornadas.append(data["jornada"])

    avg_brier = sum(all_brier) / len(all_brier)
    trend = all_brier[-1] - all_brier[0] if len(all_brier) > 1 else 0

    return {
        "jornadas_evaluated": len(files),
        "jornada_range": f"J{min(all_jornadas)}-J{max(all_jornadas)}",
        "avg_brier": round(avg_brier, 4),
        "latest_brier": all_brier[-1],
        "best_brier": min(all_brier),
        "worst_brier": max(all_brier),
        "trend": round(trend, 4),
        "trend_direction": "MEJORANDO" if trend < -0.01 else ("EMPEORANDO" if trend > 0.01 else "ESTABLE"),
        "assessment": _assess_brier(avg_brier),
        "history": [{"jornada": j, "brier": b} for j, b in zip(all_jornadas, all_brier)],
    }


# ── CLI for quick testing ──

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage:")
        print("  python calibration.py test           Run self-test with sample data")
        print("  python calibration.py cumulative      Show cumulative calibration stats")
        sys.exit(0)

    if sys.argv[1] == "test":
        # Self-test with J60 approximate data (12/14 correct)
        sample_preds = [
            {"p1": 0.50, "px": 0.28, "p2": 0.22},  # P1
            {"p1": 0.45, "px": 0.30, "p2": 0.25},  # P2
            {"p1": 0.55, "px": 0.25, "p2": 0.20},  # P3
            {"p1": 0.40, "px": 0.30, "p2": 0.30},  # P4
            {"p1": 0.60, "px": 0.22, "p2": 0.18},  # P5
            {"p1": 0.35, "px": 0.30, "p2": 0.35},  # P6
            {"p1": 0.48, "px": 0.28, "p2": 0.24},  # P7
            {"p1": 0.52, "px": 0.26, "p2": 0.22},  # P8
            {"p1": 0.42, "px": 0.30, "p2": 0.28},  # P9
            {"p1": 0.38, "px": 0.32, "p2": 0.30},  # P10
            {"p1": 0.50, "px": 0.28, "p2": 0.22},  # P11 Eibar-Malaga (FAIL: result was 2)
            {"p1": 0.45, "px": 0.30, "p2": 0.25},  # P12
            {"p1": 0.48, "px": 0.28, "p2": 0.24},  # P13 Sporting-Ceuta (FAIL: result was 2)
            {"p1": 0.55, "px": 0.25, "p2": 0.20},  # P14
        ]
        sample_results = ["1", "1", "1", "X", "1", "X", "1", "1", "1", "1", "2", "1", "2", "1"]

        print("=== SELF-TEST: J60 approximate data ===\n")

        bs = brier_score(sample_preds, sample_results)
        ll = log_loss_score(sample_preds, sample_results)
        print(f"Brier Score: {bs:.4f}  ({_assess_brier(bs)})")
        print(f"Log Loss:    {ll:.4f}")

        bias = identify_systematic_bias(sample_preds, sample_results)
        print(f"\nBiases:")
        for outcome, data in bias["biases"].items():
            print(f"  {outcome}: predicted {data['avg_predicted']:.3f} vs actual {data['actual_freq']:.3f} → {data['direction']} ({data['bias']:+.3f})")
        print(f"  Interpretation: {bias['interpretation']}")

        curve = calibration_curve(sample_preds, sample_results)
        print(f"\nCalibration curve ({len(curve)} bins):")
        for b in curve:
            print(f"  Predicted: {b['predicted_avg']:.3f}  Actual: {b['actual_freq']:.3f}  Gap: {b['gap']:.3f}  (n={b['count']})")

        # Accuracy
        correct = 0
        for pred, actual in zip(sample_preds, sample_results):
            predicted = max(pred, key=pred.get)
            predicted_outcome = {"p1": "1", "px": "X", "p2": "2"}[predicted]
            if predicted_outcome == actual.upper():
                correct += 1
        print(f"\nAccuracy: {correct}/{len(sample_results)} = {correct/len(sample_results)*100:.0f}%")

    elif sys.argv[1] == "cumulative":
        result = load_cumulative_calibration()
        print(json.dumps(result, indent=2, ensure_ascii=False))
