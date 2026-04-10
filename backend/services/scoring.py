"""
services/scoring.py
-------------------
Neuro AI layer — Isolation Forest anomaly detection.

Trained once on first call; scores normalised to [0.0, 1.0].

Combined score formula (Neuro-Symbolic):
    final_score = 0.4 * ml_score + 0.6 * rule_score

Risk levels:
    High   >= 0.65
    Medium >= 0.35
    Low     < 0.35
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from typing import Optional

# ── Feature set ───────────────────────────────────────────────────────────────
FEATURES = [
    "amount",
    "oldbalanceOrg",
    "newbalanceOrig",
    "oldbalanceDest",
    "newbalanceDest",
    "amount_ratio",       # amount / (oldbalanceOrg + 1)
    "dest_inflow_ratio",  # newbalanceDest / (oldbalanceDest + 1)
    "balance_delta",      # oldbalanceOrg - newbalanceOrig
]

# ── Module-level state ────────────────────────────────────────────────────────
_model:  Optional[IsolationForest] = None
_scaler: Optional[StandardScaler]  = None


# ── Internal helpers ──────────────────────────────────────────────────────────

def _build_features(df: pd.DataFrame) -> np.ndarray:
    df = df.copy()
    df["amount_ratio"]      = df["amount"]           / (df["oldbalanceOrg"]  + 1.0)
    df["dest_inflow_ratio"] = df["newbalanceDest"]   / (df["oldbalanceDest"] + 1.0)
    df["balance_delta"]     = df["oldbalanceOrg"]    -  df["newbalanceOrig"]
    return df[FEATURES].fillna(0).values


def _row_to_df(row: dict) -> pd.DataFrame:
    """Wrap a single row dict in a one-row DataFrame for feature extraction."""
    return pd.DataFrame([{k: float(row.get(k, 0)) for k in [
        "amount", "oldbalanceOrg", "newbalanceOrig",
        "oldbalanceDest", "newbalanceDest",
    ]}])


# ── Public API ────────────────────────────────────────────────────────────────

def train_model(df: pd.DataFrame) -> None:
    """
    Train the Isolation Forest on the full dataset.
    Call once at startup before scoring any rows.
    """
    global _model, _scaler

    X = _build_features(df)
    _scaler = StandardScaler()
    X_scaled = _scaler.fit_transform(X)

    _model = IsolationForest(
        n_estimators=150,
        contamination=0.05,   # ~5% expected anomaly rate
        max_samples="auto",
        random_state=42,
        n_jobs=-1,
    )
    _model.fit(X_scaled)


def score_row(row: dict) -> float:
    """
    Return an ML anomaly score in [0.0, 1.0].
    Higher = more anomalous.
    Returns 0.0 if the model has not been trained yet.
    """
    if _model is None or _scaler is None:
        return 0.0

    df_row = _row_to_df(row)
    X      = _build_features(df_row)
    X_s    = _scaler.transform(X)

    # decision_function: lower (more negative) = more anomalous
    raw = _model.decision_function(X_s)[0]

    # Map to [0, 1]: raw typically spans [-0.5, 0.5]
    normalised = float(np.clip(0.5 - raw, 0.0, 1.0))
    return round(normalised, 4)


def combined_score(ml_score: float, rule_score: float) -> float:
    """
    Neuro-Symbolic weighted combination.
    Rules carry 60% weight (interpretable + auditable).
    ML carries 40% weight (catches novel patterns).
    """
    return round(0.4 * ml_score + 0.6 * rule_score, 4)


def risk_level(score: float) -> str:
    """Classify a combined score into a risk tier."""
    if score >= 0.65:
        return "High"
    if score >= 0.35:
        return "Medium"
    return "Low"


def is_trained() -> bool:
    return _model is not None
