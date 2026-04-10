"""
routes/fraud.py
---------------
All API endpoints for the FraudGraph AI dashboard.
"""

from __future__ import annotations
from functools import lru_cache
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from services.data_loader  import load_data
from services.scoring      import combined_score, train_model, is_trained
from services.explanation  import explain
from services.graph_engine import build_graph_for_entity

router = APIRouter()

# ── one-time scoring cache ────────────────────────────────────────
_scored_cache: list[dict] | None = None

def _get_scored() -> list[dict]:
    global _scored_cache
    if _scored_cache is not None:
        return _scored_cache

    df = load_data()

    # train model on first call
    if not is_trained():
        train_model(df)

    rows = []
    for _, r in df.iterrows():
        result = combined_score(r)          # takes one row, returns full dict
        rows.append({
            "tx_id":           str(r.get("tx_id", "")),
            "step":            int(r.get("step", 0)),
            "type":            str(r.get("type", "")),
            "amount":          float(r.get("amount", 0)),
            "nameOrig":        str(r.get("nameOrig", "")),
            "nameDest":        str(r.get("nameDest", "")),
            "oldbalanceOrg":   float(r.get("oldbalanceOrg", 0)),
            "newbalanceOrig":  float(r.get("newbalanceOrig", 0)),
            "oldbalanceDest":  float(r.get("oldbalanceDest", 0)),
            "newbalanceDest":  float(r.get("newbalanceDest", 0)),
            "isFraud":         int(r.get("isFraud", 0)),
            "isFlaggedFraud":  int(r.get("isFlaggedFraud", 0)),
            "ml_score":        result["ml_score"],
            "rule_score":      result["rule_score"],
            "risk_score":      result["risk_score"],
            "risk_level":      result["risk_level"],
            "triggered_rules": result["triggered_rules"],
            "explanation":     explain(r, result),
        })

    _scored_cache = rows
    return rows


# ── GET /api/health ───────────────────────────────────────────────
@router.get("/health")
def health():
    return {"status": "ok", "service": "FraudGraph AI", "model_ready": is_trained()}


# ── GET /api/stats ────────────────────────────────────────────────
@router.get("/stats")
def stats():
    scored = _get_scored()
    total  = len(scored)
    fraud  = sum(1 for r in scored if r["isFraud"] == 1)
    flagged= sum(1 for r in scored if r["isFlaggedFraud"] == 1)
    high   = sum(1 for r in scored if r["risk_level"] == "High")
    medium = sum(1 for r in scored if r["risk_level"] == "Medium")
    low    = sum(1 for r in scored if r["risk_level"] == "Low")
    amounts= [r["amount"] for r in scored]
    type_counts: dict[str, int] = {}
    for r in scored:
        type_counts[r["type"]] = type_counts.get(r["type"], 0) + 1

    return {
        "total_rows":        total,
        "fraud_count":       fraud,
        "flagged_count":     flagged,
        "high_risk_count":   high,
        "medium_risk_count": medium,
        "low_risk_count":    low,
        "type_counts":       type_counts,
        "total_amount":      round(sum(amounts), 2),
        "avg_amount":        round(sum(amounts) / total if total else 0, 2),
        "max_amount":        round(max(amounts) if amounts else 0, 2),
    }


# ── GET /api/transactions ─────────────────────────────────────────
@router.get("/transactions")
def transactions(
    risk_level: Optional[str] = None,
    tx_type:    Optional[str] = None,
    min_amount: Optional[float] = None,
    limit:      int = 500,
    sort_by:    str = "risk_score",
):
    scored = _get_scored()
    rows   = list(scored)

    if risk_level:
        rows = [r for r in rows if r["risk_level"].lower() == risk_level.lower()]
    if tx_type:
        rows = [r for r in rows if r["type"].lower() == tx_type.lower()]
    if min_amount is not None:
        rows = [r for r in rows if r["amount"] >= min_amount]

    reverse = sort_by in ("risk_score", "amount", "ml_score", "rule_score")
    rows.sort(key=lambda r: r.get(sort_by, 0), reverse=reverse)

    return {"transactions": rows[:limit], "total": len(rows)}


# ── GET /api/transaction/{tx_id} ──────────────────────────────────
@router.get("/transaction/{tx_id}")
def transaction(tx_id: str):
    scored = _get_scored()
    for r in scored:
        if r["tx_id"] == tx_id:
            return r
    raise HTTPException(status_code=404, detail="Transaction not found")


# ── GET /api/graph ────────────────────────────────────────────────
@router.get("/graph")
def graph(
    entity_id: str,
    depth:     int = Query(default=2, ge=1, le=3),
):
    df     = load_data()
    result = build_graph_for_entity(df, entity_id, depth)
    return result
