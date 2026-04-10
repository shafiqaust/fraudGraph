"""
services/rules_engine.py
------------------------
Symbolic AI layer — deterministic rule-based fraud signal extraction.

Each rule returns:
  triggered : bool   — whether the rule fired
  weight    : float  — contribution to the rule_score (0.0 – 1.0)
  label     : str    — human-readable rule name

Combined rule_score = min(sum of triggered weights, 1.0)
"""

from typing import Any

# ── Thresholds (tune these for your dataset) ──────────────────────────────────
HIGH_AMOUNT_THRESHOLD    = 200_000.0   # USD
LARGE_DEST_THRESHOLD     = 500_000.0   # USD — destination inflow considered large
AMOUNT_MISMATCH_EPSILON  = 1.0         # tolerance for balance arithmetic drift

# ── Rule definitions ──────────────────────────────────────────────────────────
RULES: list[dict[str, Any]] = [
    {
        "id":     "high_amount",
        "label":  "High-value transaction",
        "weight": 0.25,
        "check":  lambda r: float(r.get("amount", 0)) > HIGH_AMOUNT_THRESHOLD,
    },
    {
        "id":     "risky_type",
        "label":  "High-risk transaction type (TRANSFER or CASH_OUT)",
        "weight": 0.20,
        "check":  lambda r: str(r.get("type", "")) in ("TRANSFER", "CASH_OUT"),
    },
    {
        "id":     "balance_drain",
        "label":  "Source account fully drained to zero",
        "weight": 0.30,
        "check":  lambda r: (
            float(r.get("oldbalanceOrg", 0)) > 0
            and float(r.get("newbalanceOrig", 1)) == 0.0
        ),
    },
    {
        "id":     "dest_zero_to_large",
        "label":  "Destination received large inflow from zero balance",
        "weight": 0.25,
        "check":  lambda r: (
            float(r.get("oldbalanceDest", 1)) == 0.0
            and float(r.get("newbalanceDest", 0)) > LARGE_DEST_THRESHOLD
        ),
    },
    {
        "id":     "system_flagged",
        "label":  "Transaction flagged by automated fraud filter",
        "weight": 0.15,
        "check":  lambda r: int(float(r.get("isFlaggedFraud", 0))) == 1,
    },
    {
        "id":     "balance_mismatch",
        "label":  "Balance delta does not match declared amount",
        "weight": 0.20,
        "check":  lambda r: (
            str(r.get("type", "")) in ("TRANSFER", "CASH_OUT")
            and abs(
                float(r.get("oldbalanceOrg", 0))
                - float(r.get("newbalanceOrig", 0))
                - float(r.get("amount", 0))
            ) > AMOUNT_MISMATCH_EPSILON
        ),
    },
]


def evaluate_rules(row: dict) -> dict:
    """
    Run all rules against a transaction row.

    Returns:
        triggered_rules : list of dicts with id, label, weight
        rule_score      : float in [0.0, 1.0]
    """
    triggered = []
    total_weight = 0.0

    for rule in RULES:
        try:
            fired = rule["check"](row)
        except Exception:
            fired = False

        if fired:
            triggered.append({
                "id":     rule["id"],
                "label":  rule["label"],
                "weight": rule["weight"],
            })
            total_weight += rule["weight"]

    return {
        "triggered_rules": triggered,
        "rule_score":      round(min(total_weight, 1.0), 4),
    }


def get_rule_definitions() -> list[dict]:
    """Return rule metadata (id + label + weight) without check functions."""
    return [{"id": r["id"], "label": r["label"], "weight": r["weight"]} for r in RULES]
