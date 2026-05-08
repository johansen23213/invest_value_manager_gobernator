#!/usr/bin/env python3
"""
Anti-bias module — forces the CIO to justify every divergence from the judge.

The J60 CIO identified "regression to safety" bias: moving toward market
odds when the Tribunal says INCONCLUSO, instead of trusting the judge.

This module enforces documentation of every decision, preventing
unconscious convergence to the market.
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Any

STATE_DIR = Path(__file__).parent.parent / "state" / "data" / "decisions"


def validate_cio_decision(
    match: str,
    judge_probs: dict[str, float],
    market_probs: dict[str, float],
    cio_probs: dict[str, float],
    tribunal_verdict: str,
    cio_justification: str,
) -> dict[str, Any]:
    """
    Validate a CIO decision against the anti-bias framework.

    tribunal_verdict: "JUEZ_CORRECTO" | "MERCADO_CORRECTO" | "INCONCLUSO"
    """
    errors = []
    warnings = []

    # Check probs sum to 1
    for name, probs in [("judge", judge_probs), ("market", market_probs), ("cio", cio_probs)]:
        total = sum(probs.values())
        if abs(total - 1.0) > 0.02:
            errors.append(f"{name} probs sum to {total:.3f}, not 1.0")

    # Calculate divergences
    judge_vs_market = {k: abs(judge_probs[k] - market_probs[k]) for k in ("p1", "px", "p2")}
    cio_vs_judge = {k: abs(cio_probs[k] - judge_probs[k]) for k in ("p1", "px", "p2")}
    cio_vs_market = {k: abs(cio_probs[k] - market_probs[k]) for k in ("p1", "px", "p2")}

    max_judge_market_div = max(judge_vs_market.values())
    max_cio_judge_div = max(cio_vs_judge.values())
    max_cio_market_div = max(cio_vs_market.values())

    # Anti-bias checks
    moved_to_market = max_cio_market_div < max_cio_judge_div
    moved_to_judge = max_cio_judge_div < max_cio_market_div

    # RULE 1: If Tribunal says JUEZ_CORRECTO, CIO MUST stay with judge
    if tribunal_verdict == "JUEZ_CORRECTO" and max_cio_judge_div > 0.05:
        errors.append(
            f"Tribunal dijo JUEZ_CORRECTO pero CIO se alejó del juez en {max_cio_judge_div*100:.1f}pp. "
            f"PROHIBIDO: cuando el Tribunal valida al juez, el CIO debe respetarlo."
        )

    # RULE 2: If Tribunal says INCONCLUSO, CIO must NOT default to market
    if tribunal_verdict == "INCONCLUSO" and moved_to_market and max_cio_judge_div > 0.05:
        warnings.append(
            f"⚠️ REGRESSION TO SAFETY DETECTADA: Tribunal dijo INCONCLUSO y CIO "
            f"se movió hacia el mercado ({max_cio_market_div*100:.1f}pp closer to market). "
            f"¿Hay justificación concreta o es miedo?"
        )

    # RULE 3: CIO must justify ANY divergence > 5pp from judge
    if max_cio_judge_div > 0.05:
        if not cio_justification or len(cio_justification) < 20:
            errors.append(
                f"CIO diverge del juez en {max_cio_judge_div*100:.1f}pp pero no hay "
                f"justificación documentada (o es < 20 chars). "
                f"EXIGIDO: explicar POR QUÉ diverges."
            )

    # RULE 4: If judge vs market > 8pp, Tribunal MUST have ruled
    if max_judge_market_div > 0.08 and tribunal_verdict not in ("JUEZ_CORRECTO", "MERCADO_CORRECTO", "INCONCLUSO"):
        warnings.append(
            f"Divergencia juez-mercado de {max_judge_market_div*100:.1f}pp pero "
            f"no hay veredicto del Tribunal. REQUERIDO para divergencias ≥8pp."
        )

    # Classify the decision
    if moved_to_judge:
        decision_type = "TRUSTS_JUDGE"
    elif moved_to_market:
        decision_type = "MOVES_TO_MARKET"
    else:
        decision_type = "INDEPENDENT"

    is_valid = len(errors) == 0

    return {
        "match": match,
        "is_valid": is_valid,
        "decision_type": decision_type,
        "errors": errors,
        "warnings": warnings,
        "divergences": {
            "judge_vs_market_max": round(max_judge_market_div, 4),
            "cio_vs_judge_max": round(max_cio_judge_div, 4),
            "cio_vs_market_max": round(max_cio_market_div, 4),
        },
        "tribunal_verdict": tribunal_verdict,
        "probs": {
            "judge": judge_probs,
            "market": market_probs,
            "cio": cio_probs,
        },
    }


def validate_full_quiniela(decisions: list[dict[str, Any]]) -> dict[str, Any]:
    """Validate all 15 CIO decisions for a quiniela."""
    results = []
    for d in decisions:
        result = validate_cio_decision(
            match=d["match"],
            judge_probs=d["judge_probs"],
            market_probs=d["market_probs"],
            cio_probs=d["cio_probs"],
            tribunal_verdict=d.get("tribunal_verdict", ""),
            cio_justification=d.get("cio_justification", ""),
        )
        results.append(result)

    total = len(results)
    valid = sum(1 for r in results if r["is_valid"])
    safety_regressions = sum(1 for r in results if any("REGRESSION TO SAFETY" in w for w in r["warnings"]))
    trusts_judge = sum(1 for r in results if r["decision_type"] == "TRUSTS_JUDGE")
    moves_market = sum(1 for r in results if r["decision_type"] == "MOVES_TO_MARKET")

    return {
        "total_matches": total,
        "valid_decisions": valid,
        "invalid_decisions": total - valid,
        "safety_regressions": safety_regressions,
        "trusts_judge": trusts_judge,
        "moves_to_market": moves_market,
        "independent": total - trusts_judge - moves_market,
        "all_errors": [e for r in results for e in r["errors"]],
        "all_warnings": [w for r in results for w in r["warnings"]],
        "decisions": results,
        "assessment": _assess(valid, total, safety_regressions),
    }


def _assess(valid: int, total: int, regressions: int) -> str:
    if valid == total and regressions == 0:
        return "LIMPIO — Todas las decisiones justificadas, sin sesgo de seguridad."
    elif regressions > 3:
        return f"⚠️ SESGO SISTÉMICO — {regressions} regresiones a seguridad. El CIO está copiando al mercado."
    elif valid < total:
        return f"❌ DECISIONES INVÁLIDAS — {total - valid} sin justificación. Documentar antes de apostar."
    else:
        return f"ACEPTABLE — {regressions} warning(s) menor(es)."


def save_decision_log(jornada: int, validation: dict[str, Any]) -> str:
    """Save decision validation for historical tracking."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    filepath = STATE_DIR / f"j{jornada:02d}_decisions.json"
    validation["jornada"] = jornada
    validation["date"] = datetime.now().isoformat()
    with open(filepath, "w") as f:
        json.dump(validation, f, indent=2, ensure_ascii=False)
    return str(filepath)


if __name__ == "__main__":
    print("=== ANTI-BIAS MODULE — Self-test ===\n")

    # Simulate J60 scenario: CIO regression to safety on INCONCLUSO
    test = validate_cio_decision(
        match="P5 — Team A vs Team B",
        judge_probs={"p1": 0.55, "px": 0.25, "p2": 0.20},
        market_probs={"p1": 0.45, "px": 0.30, "p2": 0.25},
        cio_probs={"p1": 0.47, "px": 0.28, "p2": 0.25},  # CIO moved toward market
        tribunal_verdict="INCONCLUSO",
        cio_justification="",  # No justification!
    )

    print(f"Match: {test['match']}")
    print(f"Valid: {test['is_valid']}")
    print(f"Decision type: {test['decision_type']}")
    print(f"Errors: {test['errors']}")
    print(f"Warnings: {test['warnings']}")
    print(f"Divergences: {test['divergences']}")
