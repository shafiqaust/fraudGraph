"""
services/explanation.py
-----------------------
Converts triggered rules + scores into analyst-grade reasoning text.

Each explanation has three parts:
  1. Intro line  — risk level verdict
  2. Rule bullets — what was detected and why it matters
  3. Tail lines   — ML score context + amount context + path pattern
"""

# ── Per-rule plain-English sentences ─────────────────────────────────────────
RULE_SENTENCES: dict[str, str] = {
    "high_amount": (
        "This is a high-value transaction well above the normal threshold "
        "({amount}), which is a common characteristic of large-scale fraud."
    ),
    "risky_type": (
        "The transaction type ({type}) is one of the two categories where "
        "virtually all PaySim fraud occurs: TRANSFER and CASH_OUT."
    ),
    "balance_drain": (
        "The source account was completely emptied — its balance went from "
        "{old_bal} to $0.00. This 'zero-out' pattern is a strong indicator "
        "of fraudulent fund extraction."
    ),
    "dest_zero_to_large": (
        "The destination account had a zero balance before this transaction "
        "and received a large inflow ({new_dest}). This matches the profile "
        "of a mule account receiving stolen funds."
    ),
    "system_flagged": (
        "This transaction was independently flagged by the automated "
        "isFlaggedFraud filter, corroborating the risk signals above."
    ),
    "balance_mismatch": (
        "The arithmetic does not add up: the source balance change "
        "({old_bal} - {new_bal}) does not equal the stated amount ({amount}). "
        "This discrepancy suggests data manipulation or a split transaction."
    ),
}

INTRO: dict[str, str] = {
    "High":   "HIGH RISK — This transaction exhibits multiple strong fraud indicators.",
    "Medium": "MEDIUM RISK — This transaction shows suspicious characteristics worth reviewing.",
    "Low":    "LOW RISK — This transaction appears within normal parameters.",
}

FRAUD_PATHS: dict[tuple, str] = {
    ("TRANSFER",):           "Matches a common fraud pathway: large TRANSFER to an external account.",
    ("CASH_OUT",):           "Matches a common fraud pathway: CASH_OUT to drain accumulated funds.",
    ("TRANSFER", "CASH_OUT"): "Matches the classic fraud chain: TRANSFER followed by CASH_OUT exit.",
}


def _fmt_amount(val) -> str:
    try:
        return f"${float(val):,.2f}"
    except Exception:
        return str(val)


def generate_explanation(
    row: dict,
    triggered_rules: list[dict],
    level: str,
    ml_score: float,
) -> str:
    lines: list[str] = []

    lines.append(INTRO.get(level, ""))
    lines.append("")

    if not triggered_rules:
        lines.append("No significant fraud signals detected. Transaction appears normal.")
        return "\n".join(lines)

    lines.append("Signals detected:")
    for rule in triggered_rules:
        template = RULE_SENTENCES.get(rule["id"], rule["label"])
        sentence = template.format(
            amount   = _fmt_amount(row.get("amount",         0)),
            type     = str(row.get("type", "UNKNOWN")),
            old_bal  = _fmt_amount(row.get("oldbalanceOrg",  0)),
            new_bal  = _fmt_amount(row.get("newbalanceOrig", 0)),
            new_dest = _fmt_amount(row.get("newbalanceDest", 0)),
        )
        lines.append(f"  • {sentence}")

    lines.append("")

    tx_type = str(row.get("type", ""))
    for key_types, path_text in FRAUD_PATHS.items():
        if tx_type in key_types:
            lines.append(f"Pattern: {path_text}")
            break

    if ml_score > 0.55:
        lines.append(
            f"ML anomaly score: {ml_score:.2f} — "
            "Isolation Forest identified this as a statistical outlier "
            "relative to the transaction population."
        )
    else:
        lines.append(
            f"ML anomaly score: {ml_score:.2f} — "
            "Within normal statistical range; risk is primarily rule-driven."
        )

    amount = float(row.get("amount", 0))
    if amount > 1_000_000:
        lines.append(
            f"Amount {_fmt_amount(amount)} places this in the top 1% "
            "of all transactions in the dataset."
        )
    elif amount > 200_000:
        lines.append(
            f"Amount {_fmt_amount(amount)} exceeds the high-value threshold."
        )

    return "\n".join(lines)


def generate_mapf_explanation(conflicts: list[str]) -> str:
    """Format MAPF conflict list into a readable block."""
    if not conflicts:
        return ""
    lines = ["MAPF Conflict Analysis — temporal path overlaps detected:"]
    for conflict in conflicts:
        lines.append(f"  • {conflict}")
    return "\n".join(lines)
