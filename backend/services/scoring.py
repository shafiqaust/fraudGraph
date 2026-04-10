"""
services/scoring.py
-------------------
Neuro-Symbolic scoring: IsolationForest (ML) + rule engine (Symbolic).
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from services.rules_engine import evaluate_rules

_model:   IsolationForest | None = None
_scaler:  StandardScaler  | None = None
_trained: bool = False

FEATURES = [
    'amount', 'oldbalanceOrg', 'newbalanceOrig',
    'oldbalanceDest', 'newbalanceDest',
    'balance_diff_orig', 'balance_diff_dest', 'amount_ratio',
]

def _engineer(df: pd.DataFrame) -> pd.DataFrame:
    d = df.copy()
    d['balance_diff_orig'] = d['oldbalanceOrg']  - d['newbalanceOrig']
    d['balance_diff_dest'] = d['newbalanceDest'] - d['oldbalanceDest']
    d['amount_ratio']      = d['amount'] / (d['oldbalanceOrg'] + 1)
    return d

def is_trained() -> bool:
    return _trained

def train_model(df: pd.DataFrame) -> None:
    global _model, _scaler, _trained
    d = _engineer(df)
    X = d[FEATURES].fillna(0).values
    _scaler = StandardScaler()
    X_s = _scaler.fit_transform(X)
    _model = IsolationForest(n_estimators=150, contamination=0.05, random_state=42)
    _model.fit(X_s)
    _trained = True

def score_row(row: pd.Series) -> float:
    if not _trained or _model is None or _scaler is None:
        return 0.5
    d = pd.DataFrame([row])
    d = _engineer(d)
    X = d[FEATURES].fillna(0).values
    X_s = _scaler.transform(X)
    raw = _model.decision_function(X_s)[0]
    return float(np.clip(0.5 - raw, 0, 1))

def risk_level(score: float) -> str:
    return 'High' if score >= 0.65 else 'Medium' if score >= 0.35 else 'Low'

def combined_score(row: pd.Series) -> dict:
    ml     = score_row(row)
    raw    = evaluate_rules(row)

    # Normalise: evaluate_rules may return list of dicts OR list of strings
    triggered  = []
    rule_score = 0.0

    for item in raw:
        if isinstance(item, dict):
            # format: {"id": "...", "label": "...", "weight": 0.x, "triggered": True/False}
            if item.get("triggered", False):
                rule_score += float(item.get("weight", 0.2))
                triggered.append({"id": item.get("id",""), "label": item.get("label",""), "weight": float(item.get("weight",0.2))})
        elif isinstance(item, str):
            # format: just a rule id string meaning it fired
            rule_score += 0.2
            triggered.append({"id": item, "label": item, "weight": 0.2})

    rule_score = min(rule_score, 1.0)
    final      = min(0.4 * ml + 0.6 * rule_score, 1.0)

    return {
        'ml_score':        round(ml,         4),
        'rule_score':      round(rule_score,  4),
        'risk_score':      round(final,       4),
        'risk_level':      risk_level(final),
        'triggered_rules': triggered,
    }
