"""
routes/fraud.py
---------------
All FraudGraph API endpoints.

GET /api/health              — liveness check
GET /api/stats               — dataset + scoring summary
GET /api/transactions        — paginated + filtered transaction list
GET /api/transaction/{tx_id} — single transaction detail
GET /api/graph               — entity subgraph (GNN + MAPF)
"""

from fastapi import APIRouter, Query, HTTPException
from typing import Optional

from services.data_loader  import load_data, get_dataset_stats
from services.rules_engine import evaluate_rules
from services.scoring      import score_row, combined_score, risk_level, train_model, is_trained
from services.explanation  import generate_explanation, generate_mapf_explanation
from services.graph_engine import build_graph_for_entity

router = APIRouter()

# ── In-memory scored cache ────────────────────────────────────────────────────
_scored_cache: Optional[list[dict]] = None


def _get_scored() -> list[dict]:
    """Score all transactions once; return cached results on subsequent calls."""
    global _scored_cache

    if _scored_cache is not None:
        return _scored_cache

    df = load_data()

    if not is_trained():
        train_model(df)

    results = []
    for _, row in df.iterrows():
        r           = row.to_dict()
        rule_result = evaluate_rules(r)
        ml          = score_row(r)
        score       = combined_score(ml, rule_result["rule_score"])
        level       = risk_level(score)
        explanation = generate_explanation(r, rule_result["triggered_rules"], level, ml)

        results.append({
            **{k: r[k] for k in [
                "tx_id", "step", "type", "amount",
                "nameOrig", "nameDest",
                "oldbalanceOrg", "newbalanceOrig",
                "oldbalanceDest", "newbalanceDest",
                "isFraud", "isFlaggedFraud",
            ]},
            "ml_score":       round(ml, 4),
            "rule_score":     round(rule_result["rule_score"], 4),
            "risk_score":     round(score, 4),
            "risk_level":     level,
            "triggered_rules": rule_result["triggered_rules"],
            "explanation":    explanation,
        })

    _scored_cache = results
    return results


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/health", tags=["system"])
def health():
    return {"status": "ok", "service": "FraudGraph AI", "model_ready": is_trained()}


@router.get("/stats", tags=["system"])
def stats():
    base   = get_dataset_stats()
    scored = _get_scored()
    counts = {"High": 0, "Medium": 0, "Low": 0}
    for r in scored:
        counts[r["risk_level"]] = counts.get(r["risk_level"], 0) + 1
    return {
        **base,
        "high_risk_count":   counts["High"],
        "medium_risk_count": counts["Medium"],
        "low_risk_count":    counts["Low"],
    }


@router.get("/transactions", tags=["fraud"])
def transactions(
    limit:        int            = Query(500, ge=1,  le=3200),
    offset:       int            = Query(0,   ge=0),
    risk_level_f: Optional[str]  = Query(None, alias="risk_level"),
    tx_type:      Optional[str]  = Query(None),
    min_amount:   Optional[float]= Query(None),
    sort_by:      str            = Query("risk_score"),
    order:        str            = Query("desc"),
):
    scored = _get_scored()

    # ── Filters ───────────────────────────────────────────────────────────────
    if risk_level_f:
        scored = [r for r in scored if r["risk_level"] == risk_level_f]
    if tx_type:
        scored = [r for r in scored if r["type"] == tx_type.upper()]
    if min_amount is not None:
        scored = [r for r in scored if r["amount"] >= min_amount]

    # ── Sort ──────────────────────────────────────────────────────────────────
    reverse = (order == "desc")
    tier_order = {"High": 0, "Medium": 1, "Low": 2}

    if sort_by == "risk_score":
        scored = sorted(
            scored,
            key=lambda r: (tier_order.get(r["risk_level"], 3), -r["risk_score"]),
        )
    elif sort_by == "amount":
        scored = sorted(scored, key=lambda r: r["amount"], reverse=reverse)
    elif sort_by == "step":
        scored = sorted(scored, key=lambda r: r["step"], reverse=reverse)

    total = len(scored)
    return {
        "transactions": scored[offset : offset + limit],
        "total":        total,
        "offset":       offset,
        "limit":        limit,
    }


@router.get("/transaction/{tx_id}", tags=["fraud"])
def transaction_detail(tx_id: str):
    scored = _get_scored()
    match  = next((r for r in scored if str(r.get("tx_id")) == tx_id), None)
    if not match:
        raise HTTPException(status_code=404, detail=f"Transaction '{tx_id}' not found")
    return match


@router.get("/graph", tags=["fraud"])
def graph(
    entity_id: str = Query(..., description="Account or merchant ID to centre the graph on"),
    depth:     int = Query(2,   ge=1, le=3,  description="Hop depth for graph traversal"),
):
    df     = load_data()
    result = build_graph_for_entity(df, entity_id, depth=depth)
    result["mapf_explanation"] = generate_mapf_explanation(result["mapf_conflicts"])
    return result
