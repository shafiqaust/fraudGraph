"""
services/explanation.py
-----------------------
Generates plain-English explanations for each scored transaction.
"""

import pandas as pd

RULE_ENGLISH = {
    "high_amount":        "Transaction amount is unusually large",
    "risky_type":         "Transaction type is high-risk (Transfer or Cash Out)",
    "balance_drain":      "Sender account was fully emptied",
    "dest_zero_to_large": "Receiver account jumped from zero to a large balance",
    "system_flagged":     "Transaction was flagged by the bank system",
    "balance_mismatch":   "Account balance change does not match the transaction amount",
}

def explain(row: pd.Series, score_result: dict) -> str:
    parts = []
    risk  = score_result.get("risk_level", "Low")
    final = score_result.get("risk_score", 0.0)
    ml    = score_result.get("ml_score",   0.0)
    rules = score_result.get("triggered_rules", [])

    parts.append(f"Risk level: {risk} ({final*100:.0f}% probability).")

    if rules:
        labels = [RULE_ENGLISH.get(r["id"], r.get("label", r["id"])) for r in rules]
        parts.append("Triggered rules: " + "; ".join(labels) + ".")
    else:
        parts.append("No symbolic rules triggered.")

    if ml >= 0.6:
        parts.append("The ML model flagged this transaction as statistically anomalous.")
    elif ml >= 0.4:
        parts.append("The ML model detected mild anomalies in this transaction.")
    else:
        parts.append("The ML model found no strong anomaly signal.")

    amount = float(row.get("amount", 0))
    if amount > 500_000:
        parts.append(f"The transaction amount (${amount:,.0f}) is extremely large.")
    elif amount > 200_000:
        parts.append(f"The transaction amount (${amount:,.0f}) exceeds the high-value threshold.")

    return " ".join(parts)
