#!/usr/bin/env python3
"""
Self-improvement engine — learns from every matchday automatically.

After each jornada:
1. Compare predictions vs actual results
2. Identify systematic errors
3. Adjust model parameters
4. Document what changed and why

This runs after results are added to the backtest system.
"""

import json
import math
from datetime import datetime
from pathlib import Path
from typing import Any

STATE_DIR = Path(__file__).parent.parent / "state" / "data"
CONFIG_DIR = STATE_DIR / "model_config"
LEARN_DIR = STATE_DIR / "learnings"


def load_config() -> dict[str, Any]:
    """Load current model configuration."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    config_file = CONFIG_DIR / "current.json"
    if config_file.exists():
        with open(config_file) as f:
            return json.load(f)
    # Default config
    return {
        "version": 1,
        "decay_rate": 0.05,
        "rho": -0.10,
        "home_advantage": 1.35,
        "surprise_weights": {
            "home_fragility": 0.25,
            "away_competence": 0.20,
            "motivational_asymmetry": 0.20,
            "congestion_penalty": 0.15,
            "key_player_absence": 0.10,
            "historical_venue": 0.10,
        },
        "surprise_threshold_high": 60,
        "surprise_threshold_medium": 40,
        "fijo_confidence": 0.55,
        "doble_confidence": 0.45,
        "draw_adjustment": 0.0,
        "away_adjustment": 0.0,
        "history": [],
    }


def save_config(config: dict[str, Any]) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    config["last_updated"] = datetime.now().isoformat()
    with open(CONFIG_DIR / "current.json", "w") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)


def analyze_errors(predictions: list[dict], results: list[str]) -> dict[str, Any]:
    """Analyze prediction errors to identify patterns."""
    errors = {
        "home_overestimate": 0,
        "home_underestimate": 0,
        "draw_overestimate": 0,
        "draw_underestimate": 0,
        "away_overestimate": 0,
        "away_underestimate": 0,
        "surprise_missed": 0,
        "surprise_false_alarm": 0,
        "total": len(predictions),
    }

    for pred, actual in zip(predictions, results):
        actual_upper = actual.upper()
        p1, px, p2 = pred["p1"], pred["px"], pred["p2"]
        favorite = "1" if p1 >= px and p1 >= p2 else ("X" if px >= p1 and px >= p2 else "2")

        if actual_upper == "1":
            if p1 < 0.35:
                errors["home_underestimate"] += 1
        elif actual_upper == "X":
            if px < 0.25:
                errors["draw_underestimate"] += 1
            if favorite == "X" and px > 0.40:
                pass  # Correct
        elif actual_upper == "2":
            if p2 < 0.25:
                errors["away_underestimate"] += 1
                errors["surprise_missed"] += 1

        if favorite == "1" and actual_upper != "1" and p1 > 0.50:
            errors["home_overestimate"] += 1
        if favorite == "X" and actual_upper != "X" and px > 0.35:
            errors["draw_overestimate"] += 1
        if favorite == "2" and actual_upper != "2" and p2 > 0.50:
            errors["away_overestimate"] += 1

    return errors


def compute_adjustments(errors: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    """Compute parameter adjustments based on error patterns."""
    adjustments = {}
    total = max(errors["total"], 1)

    # If we consistently underestimate draws → increase draw_adjustment
    draw_under_rate = errors["draw_underestimate"] / total
    if draw_under_rate > 0.15:
        adj = min(0.03, draw_under_rate * 0.1)
        adjustments["draw_adjustment"] = config.get("draw_adjustment", 0) + adj
        adjustments["draw_reason"] = f"Draw underestimation rate {draw_under_rate*100:.0f}% — boosting draws by {adj*100:.1f}pp"

    # If we consistently miss away surprises → lower surprise threshold
    surprise_miss_rate = errors["surprise_missed"] / total
    if surprise_miss_rate > 0.10:
        current_threshold = config.get("surprise_threshold_high", 60)
        new_threshold = max(45, current_threshold - 5)
        if new_threshold != current_threshold:
            adjustments["surprise_threshold_high"] = new_threshold
            adjustments["surprise_reason"] = f"Missed {errors['surprise_missed']} surprises — lowering threshold {current_threshold}→{new_threshold}"

    # If we consistently overestimate home wins → reduce home_advantage
    home_over_rate = errors["home_overestimate"] / total
    if home_over_rate > 0.15:
        current_ha = config.get("home_advantage", 1.35)
        new_ha = max(1.15, current_ha - 0.05)
        adjustments["home_advantage"] = new_ha
        adjustments["home_reason"] = f"Home overestimation {home_over_rate*100:.0f}% — reducing HA {current_ha:.2f}→{new_ha:.2f}"

    # If away underestimate is high → boost away adjustment
    away_under_rate = errors["away_underestimate"] / total
    if away_under_rate > 0.12:
        adj = min(0.03, away_under_rate * 0.08)
        adjustments["away_adjustment"] = config.get("away_adjustment", 0) + adj
        adjustments["away_reason"] = f"Away underestimation {away_under_rate*100:.0f}% — boosting away by {adj*100:.1f}pp"

    return adjustments


def self_improve(jornada: int, predictions: list[dict], results: list[str]) -> dict[str, Any]:
    """
    Main self-improvement function. Call after each jornada.

    Returns what changed and why.
    """
    LEARN_DIR.mkdir(parents=True, exist_ok=True)

    config = load_config()
    errors = analyze_errors(predictions, results)
    adjustments = compute_adjustments(errors, config)

    # Apply adjustments
    changes_made = []
    for key, value in adjustments.items():
        if key.endswith("_reason"):
            continue
        old_value = config.get(key, "N/A")
        config[key] = value
        reason = adjustments.get(f"{key}_reason", "auto-adjustment")
        changes_made.append({
            "parameter": key,
            "old": old_value,
            "new": value,
            "reason": reason,
        })

    # Record learning
    config["version"] = config.get("version", 1) + 1
    config["history"].append({
        "jornada": jornada,
        "date": datetime.now().isoformat(),
        "errors": errors,
        "changes": changes_made,
    })

    save_config(config)

    # Save learning log
    learning = {
        "jornada": jornada,
        "date": datetime.now().isoformat(),
        "errors": errors,
        "adjustments": adjustments,
        "changes_applied": changes_made,
        "new_config_version": config["version"],
    }
    with open(LEARN_DIR / f"j{jornada:02d}_learning.json", "w") as f:
        json.dump(learning, f, indent=2, ensure_ascii=False)

    return learning


def print_learning_history() -> None:
    """Print all learnings across jornadas."""
    config = load_config()
    history = config.get("history", [])

    print(f"\n{'=' * 60}")
    print(f"  HISTORIAL DE APRENDIZAJE")
    print(f"{'=' * 60}")
    print(f"\n  Config version: {config.get('version', 1)}")
    print(f"  Parameters:")
    print(f"    decay_rate: {config.get('decay_rate')}")
    print(f"    rho: {config.get('rho')}")
    print(f"    home_advantage: {config.get('home_advantage')}")
    print(f"    draw_adjustment: {config.get('draw_adjustment')}")
    print(f"    away_adjustment: {config.get('away_adjustment')}")
    print(f"    surprise_threshold: {config.get('surprise_threshold_high')}")

    if history:
        print(f"\n  Changes over time ({len(history)} jornadas):")
        for h in history:
            j = h.get("jornada", "?")
            changes = h.get("changes", [])
            if changes:
                for c in changes:
                    print(f"    J{j}: {c['parameter']} {c['old']} → {c['new']} ({c['reason']})")
            else:
                print(f"    J{j}: No changes needed")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "history":
        print_learning_history()
    elif len(sys.argv) > 1 and sys.argv[1] == "demo":
        # Demo with J60 approximate data
        sample_preds = [
            {"p1": 0.50, "px": 0.28, "p2": 0.22},
            {"p1": 0.45, "px": 0.30, "p2": 0.25},
            {"p1": 0.55, "px": 0.25, "p2": 0.20},
            {"p1": 0.40, "px": 0.30, "p2": 0.30},
            {"p1": 0.60, "px": 0.22, "p2": 0.18},
            {"p1": 0.35, "px": 0.30, "p2": 0.35},
            {"p1": 0.48, "px": 0.28, "p2": 0.24},
            {"p1": 0.52, "px": 0.26, "p2": 0.22},
            {"p1": 0.42, "px": 0.30, "p2": 0.28},
            {"p1": 0.38, "px": 0.32, "p2": 0.30},
            {"p1": 0.50, "px": 0.28, "p2": 0.22},  # P11 — was actually 2
            {"p1": 0.45, "px": 0.30, "p2": 0.25},
            {"p1": 0.48, "px": 0.28, "p2": 0.24},  # P13 — was actually 2
            {"p1": 0.55, "px": 0.25, "p2": 0.20},
        ]
        sample_results = ["1", "1", "1", "X", "1", "X", "1", "1", "1", "1", "2", "1", "2", "1"]

        print("=== SELF-IMPROVEMENT DEMO (J60 data) ===\n")
        result = self_improve(60, sample_preds, sample_results)

        print(f"Errors found:")
        for k, v in result["errors"].items():
            if v > 0 and k != "total":
                print(f"  {k}: {v}")

        print(f"\nChanges applied:")
        for c in result["changes_applied"]:
            print(f"  {c['parameter']}: {c['old']} → {c['new']}")
            print(f"    Reason: {c['reason']}")

        print(f"\nNew config version: {result['new_config_version']}")
    else:
        print("Usage: python self_improve.py [demo|history]")
