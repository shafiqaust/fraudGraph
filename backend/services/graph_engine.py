"""
services/graph_engine.py
------------------------
Graph Engine combining two AI concepts:

GNN-inspired risk propagation
    Risk(node) = base_risk + 0.3 × Σ(neighbour_risk × edge_weight)
    One message-passing iteration over the local subgraph.

MAPF-inspired conflict detection
    Flags accounts that follow the same transaction-type sequence
    to the same destination within a configurable time window (steps).
    Analogous to path conflicts in Multi-Agent Path Finding.
"""

from collections import defaultdict
from typing import Optional
import pandas as pd

# ── Config ────────────────────────────────────────────────────────────────────
MAX_NODES         = 60    # cap before trimming low-risk nodes
MAX_EDGES         = 200   # cap on edges returned to frontend
GRAPH_DEPTH       = 2     # default hop depth
MAPF_WINDOW       = 5     # step window for MAPF conflict detection
MAX_MAPF_RESULTS  = 5     # cap on conflicts returned
PROPAGATION_ALPHA = 0.30  # outgoing risk propagation weight
PROPAGATION_BETA  = 0.10  # incoming (reverse) propagation weight


# =============================================================================
# Public API
# =============================================================================

def build_graph_for_entity(
    df: pd.DataFrame,
    entity_id: str,
    depth: int = GRAPH_DEPTH,
) -> dict:
    """
    Build a subgraph centred on entity_id up to `depth` hops.
    Applies GNN-like risk propagation and MAPF conflict detection.

    Returns a dict ready to be serialised as JSON for the frontend.
    """
    base_risks = _compute_base_risks(df)
    nodes, edges = _bfs_subgraph(df, entity_id, depth, base_risks)
    nodes = _propagate_risk(nodes, edges)
    conflicts = _detect_mapf_conflicts(df, entity_id)

    # Trim oversized graphs
    node_list = list(nodes.values())
    if len(node_list) > MAX_NODES:
        node_list.sort(key=lambda n: -n["propagated_risk"])
        keep_ids  = {n["id"] for n in node_list[:MAX_NODES]} | {entity_id}
        node_list = [n for n in node_list if n["id"] in keep_ids]
        edges     = [e for e in edges if e["source"] in keep_ids and e["target"] in keep_ids]

    return {
        "center":           entity_id,
        "nodes":            node_list,
        "edges":            edges[:MAX_EDGES],
        "mapf_conflicts":   conflicts,
        "stats": {
            "node_count":     len(node_list),
            "edge_count":     min(len(edges), MAX_EDGES),
            "conflict_count": len(conflicts),
        },
    }


# =============================================================================
# Internal — subgraph construction
# =============================================================================

def _bfs_subgraph(
    df: pd.DataFrame,
    start: str,
    depth: int,
    base_risks: dict,
) -> tuple[dict, list]:
    """BFS traversal to collect nodes and edges within `depth` hops."""
    nodes:   dict[str, dict] = {}
    edges:   list[dict]      = []
    visited: set[str]        = set()
    queue:   list[tuple]     = [(start, 0)]

    while queue:
        current, level = queue.pop(0)
        if current in visited or level > depth:
            continue
        visited.add(current)

        nodes[current] = {
            "id":             current,
            "label":          current,
            "type":           _node_type(current),
            "base_risk":      round(base_risks.get(current, 0.0), 4),
            "propagated_risk": round(base_risks.get(current, 0.0), 4),
            "level":          level,
        }

        # Outgoing (current is sender)
        for _, row in df[df["nameOrig"] == current].iterrows():
            dst        = row["nameDest"]
            edge_weight = min(float(row["amount"]) / 1_000_000.0, 1.0)
            _add_edge(edges, current, dst, row, edge_weight)
            if dst not in visited and level + 1 <= depth:
                queue.append((dst, level + 1))

        # Incoming (current is receiver)
        for _, row in df[df["nameDest"] == current].iterrows():
            src        = row["nameOrig"]
            edge_weight = min(float(row["amount"]) / 1_000_000.0, 1.0)
            _add_edge(edges, src, current, row, edge_weight)
            if src not in visited and level + 1 <= depth:
                queue.append((src, level + 1))

    return nodes, edges


def _add_edge(
    edges: list,
    source: str,
    target: str,
    row,
    weight: float,
) -> None:
    """Append an edge only if an identical source→target pair does not exist."""
    duplicate = any(
        e["source"] == source and e["target"] == target
        for e in edges
    )
    if not duplicate:
        edges.append({
            "source":   source,
            "target":   target,
            "amount":   round(float(row["amount"]), 2),
            "type":     str(row.get("type", "")),
            "tx_id":    str(row.get("tx_id", "")),
            "weight":   round(weight, 4),
            "is_fraud": int(row.get("isFraud", 0)),
        })


# =============================================================================
# Internal — base risk computation
# =============================================================================

def _compute_base_risks(df: pd.DataFrame) -> dict[str, float]:
    """
    Compute a base risk score for every entity that appears in the dataset.
    This is the 'prior' before GNN propagation runs.
    """
    risks: dict[str, float] = defaultdict(float)

    for _, row in df.iterrows():
        src      = str(row["nameOrig"])
        dst      = str(row["nameDest"])
        amount   = float(row["amount"])
        is_fraud = int(row.get("isFraud", 0))
        tx_type  = str(row.get("type", ""))

        # ── Source node risk ──────────────────────────────────────────────────
        src_score = 0.0
        if is_fraud:
            src_score += 0.80
        if tx_type in ("TRANSFER", "CASH_OUT"):
            src_score += 0.20
        if amount > 200_000:
            src_score += 0.15
        if (float(row.get("newbalanceOrig", 1)) == 0.0
                and float(row.get("oldbalanceOrg", 0)) > 0):
            src_score += 0.30
        risks[src] = min(risks[src] + src_score * 0.30, 1.0)

        # ── Destination node risk ─────────────────────────────────────────────
        dst_score = 0.0
        if is_fraud:
            dst_score += 0.50
        if (float(row.get("oldbalanceDest", 1)) == 0.0
                and float(row.get("newbalanceDest", 0)) > 500_000):
            dst_score += 0.40
        risks[dst] = min(risks[dst] + dst_score * 0.30, 1.0)

    return dict(risks)


# =============================================================================
# Internal — GNN-like risk propagation
# =============================================================================

def _propagate_risk(nodes: dict, edges: list) -> dict:
    """
    One message-passing iteration (approximates GNN behaviour).

    For each directed edge source → target:
      target_risk += ALPHA × source_risk × edge_weight
      source_risk += BETA  × target_risk × edge_weight  (reverse signal)

    Scores are capped at 1.0.
    """
    propagated = {nid: n["base_risk"] for nid, n in nodes.items()}

    for edge in edges:
        src = edge["source"]
        tgt = edge["target"]
        w   = edge["weight"]

        if src in propagated and tgt in nodes:
            propagated[tgt] = min(
                propagated[tgt] + PROPAGATION_ALPHA * propagated[src] * w,
                1.0,
            )
        if tgt in propagated and src in nodes:
            propagated[src] = min(
                propagated[src] + PROPAGATION_BETA * propagated[tgt] * w,
                1.0,
            )

    for nid in nodes:
        nodes[nid]["propagated_risk"] = round(propagated.get(nid, nodes[nid]["base_risk"]), 4)

    return nodes


# =============================================================================
# Internal — MAPF conflict detection
# =============================================================================

def _detect_mapf_conflicts(df: pd.DataFrame, entity_id: str) -> list[str]:
    """
    MAPF-inspired temporal path conflict detection.

    A conflict is raised when a different account sends the same
    transaction type to the same destination as entity_id within
    MAPF_WINDOW steps — signalling coordinated (multi-agent) behaviour.
    """
    conflicts: list[str] = []

    entity_txs = df[
        (df["nameOrig"] == entity_id) | (df["nameDest"] == entity_id)
    ]
    if entity_txs.empty:
        return conflicts

    for _, tx in entity_txs.iterrows():
        step1 = int(tx.get("step", 0))
        dest  = str(tx["nameDest"])

        competitors = df[
            (df["nameDest"]  == dest)
            & (df["nameOrig"] != entity_id)
            & (abs(df["step"] - step1) <= MAPF_WINDOW)
            & (df["type"] == tx.get("type"))
        ]

        for _, comp in competitors.iterrows():
            conflicts.append(
                f"Account {comp['nameOrig']} sent a {comp['type']} of "
                f"${float(comp['amount']):,.0f} to the same destination "
                f"({dest}) within {MAPF_WINDOW} steps — "
                "possible coordinated fraud path."
            )
            if len(conflicts) >= MAX_MAPF_RESULTS:
                return conflicts

    return conflicts[:MAX_MAPF_RESULTS]


# =============================================================================
# Internal — helpers
# =============================================================================

def _node_type(entity_id: str) -> str:
    if entity_id.startswith("C"):
        return "account"
    if entity_id.startswith("M"):
        return "merchant"
    return "unknown"
