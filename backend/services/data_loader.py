"""
services/data_loader.py
-----------------------
Loads the PaySim-based demo CSV into memory once and caches it.
All downstream services pull from this single source of truth.
"""

import pandas as pd
import numpy as np
from pathlib import Path
from typing import Optional

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "demo_data.csv"

_df_cache: Optional[pd.DataFrame] = None


def load_data() -> pd.DataFrame:
    """
    Load and cache the demo dataset.
    Returns a fresh copy on each call so callers can mutate safely.
    """
    global _df_cache

    if _df_cache is None:
        if not DATA_PATH.exists():
            raise FileNotFoundError(f"Dataset not found at {DATA_PATH}")

        df = pd.read_csv(DATA_PATH)

        required = [
            "step", "type", "amount",
            "nameOrig", "nameDest",
            "oldbalanceOrg", "newbalanceOrig",
            "oldbalanceDest", "newbalanceDest",
            "isFraud", "isFlaggedFraud",
        ]
        missing = [c for c in required if c not in df.columns]
        if missing:
            raise ValueError(f"Dataset missing columns: {missing}")

        df["tx_id"] = df.index.astype(str)

        numeric_cols = [
            "amount", "oldbalanceOrg", "newbalanceOrig",
            "oldbalanceDest", "newbalanceDest",
            "isFraud", "isFlaggedFraud", "step",
        ]
        for col in numeric_cols:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

        df["type"]     = df["type"].astype(str).str.strip().str.upper()
        df["nameOrig"] = df["nameOrig"].astype(str).str.strip()
        df["nameDest"] = df["nameDest"].astype(str).str.strip()

        _df_cache = df

    return _df_cache.copy()


def get_transaction(tx_id: str) -> Optional[dict]:
    """Return a single transaction row as a dict, or None if not found."""
    df = load_data()
    row = df[df["tx_id"] == tx_id]
    return row.iloc[0].to_dict() if not row.empty else None


def get_dataset_stats() -> dict:
    """Return high-level dataset statistics for the /api/stats endpoint."""
    df = load_data()
    return {
        "total_rows":     int(len(df)),
        "fraud_count":    int(df["isFraud"].sum()),
        "flagged_count":  int(df["isFlaggedFraud"].sum()),
        "type_counts":    df["type"].value_counts().to_dict(),
        "total_amount":   round(float(df["amount"].sum()), 2),
        "avg_amount":     round(float(df["amount"].mean()), 2),
        "max_amount":     round(float(df["amount"].max()), 2),
    }


def clear_cache() -> None:
    """Force a reload of the dataset on next call. Useful in tests."""
    global _df_cache
    _df_cache = None
