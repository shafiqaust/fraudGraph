"""
services/graph_engine.py
------------------------
Graph Engine — GNN-inspired risk propagation + MAPF conflict detection.
"""

from collections import defaultdict
from typing import Optional
import pandas as pd

MAX_NODES         = 60
MAX_EDGES         = 200
DEFAULT_DEPTH     = 2
MAPF_WINDOW       = 5
MAX_MAPF          = 5
PROPAGATION_ALPHA = 0.30
PROPAGATION_BETA  = 0.10
AMOUNT_SCALE      = 1_000_000.0


def build_graph_for_entity(
    df:        pd.DataFrame,
    entity_id: str,
    depth:     int = DEFAULT_DEPTH,
) -> dict:
    base_risks             = _compute_base_risks(df)
    nodes, edges           = _bfs_subgraph(df, entity_id, depth, base_risks)
    nodes                  = _propagate_risk(nodes, edges)
    conflicts, conflict_steps = _detect_mapf_conflicts_with_steps(df, entity_id)

    node_list = list(nodes.values())
    if len(node_list) > MAX_NODES:
        node_list.sort(key=lambda n: -n["propagated_risk"])
        keep_ids  = {n["id"] for n in node_list[:MAX_NODES]} | {entity_id}
        node_list = [n for n in node_list if n["id"] in keep_ids]
        edges     = [
            e for e in edges
            if e["source"] in keep_ids and e["target"] in keep_ids
        ]

    edge_list = edges[:MAX_EDGES]

    return {
        "center":          entity_id,
        "nodes":           node_list,
        "edges":           edge_list,
        "mapf_conflicts":  conflicts,
        "mapf_details":    conflict_steps,
        "stats": {
            "node_count":     len(node_list),
            "edge_count":     len(edge_list),
            "conflict_count": len(conflicts),
        },
    }


def _compute_base_risks(df: pd.DataFrame) -> dict:
    risks: dict = defaultdict(float)

    for _, row in df.iterrows():
        src      = str(row["nameOrig"])
        dst      = str(row["nameDest"])
        amount   = float(row["amount"])
        is_fraud = int(row.get("isFraud",        0))
        tx_type  = str(row.get("type",           ""))
        new_src  = float(row.get("newbalanceOrig", 1))
        old_src  = float(row.get("oldbalanceOrg",  0))
        old_dst  = float(row.get("oldbalanceDest", 1))
        new_dst  = float(row.get("newbalanceDest", 0))

        src_delta = 0.0
        if is_fraud:                              src_delta += 0.80
        if tx_type in ("TRANSFER", "CASH_OUT"):   src_delta += 0.20
        if amount > 200_000:                      src_delta += 0.15
        if new_src == 0.0 and old_src > 0.0:      src_delta += 0.30
        risks[src] = min(risks[src] + src_delta * 0.30, 1.0)

        dst_delta = 0.0
        if is_fraud:                              dst_delta += 0.50
        if old_dst == 0.0 and new_dst > 500_000: dst_delta += 0.40
        risks[dst] = min(risks[dst] + dst_delta * 0.30, 1.0)

    return dict(risks)


def _bfs_subgraph(
    df:         pd.DataFrame,
    start:      str,
    depth:      int,
    base_risks: dict,
) -> tuple:
    nodes:   dict = {}
    edges:   list = []
    visited: set  = set()
    queue:   list = [(start, 0)]

    while queue:
        current, level = queue.pop(0)
        if current in visited or level > depth:
            continue
        visited.add(current)

        risk = base_risks.get(current, 0.0)
        nodes[current] = {
            "id":              current,
            "label":           current,
            "type":            _node_type(current),
            "base_risk":       round(risk, 4),
            "propagated_risk": round(risk, 4),
            "level":           level,
        }

        for _, row in df[df["nameOrig"] == current].iterrows():
            dst = str(row["nameDest"])
            _append_edge(edges, current, dst, row)
            if dst not in visited and level + 1 <= depth:
                queue.append((dst, level + 1))

        for _, row in df[df["nameDest"] == current].iterrows():
            src = str(row["nameOrig"])
            _append_edge(edges, src, current, row)
            if src not in visited and level + 1 <= depth:
                queue.append((src, level + 1))

    return nodes, edges


def _append_edge(edges: list, source: str, target: str, row) -> None:
    if any(e["source"] == source and e["target"] == target for e in edges):
        return
    edges.append({
        "source":   source,
        "target":   target,
        "amount":   round(float(row["amount"]), 2),
        "type":     str(row.get("type", "")),
        "tx_id":    str(row.get("tx_id", "")),
        "weight":   round(min(float(row["amount"]) / AMOUNT_SCALE, 1.0), 4),
        "is_fraud": int(row.get("isFraud", 0)),
    })


def _propagate_risk(nodes: dict, edges: list) -> dict:
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
        nodes[nid]["propagated_risk"] = round(
            propagated.get(nid, nodes[nid]["base_risk"]),
            4,
        )

    return nodes


def _detect_mapf_conflicts_with_steps(
    df: pd.DataFrame,
    entity_id: str,
) -> tuple:
    conflicts:      list = []
    conflict_steps: list = []

    entity_txs = df[
        (df["nameOrig"] == entity_id) | (df["nameDest"] == entity_id)
    ]
    if entity_txs.empty:
        return conflicts, conflict_steps

    for _, tx in entity_txs.iterrows():
        step1   = int(tx.get("step", 0))
        dest    = str(tx["nameDest"])
        tx_type = str(tx.get("type", ""))

        competitors = df[
            (df["nameDest"]  == dest)
            & (df["nameOrig"] != entity_id)
            & (df["type"]     == tx_type)
            & (abs(df["step"] - step1) <= MAPF_WINDOW)
        ]

        for _, comp in competitors.iterrows():
            comp_step = int(comp["step"])

            window_start = max(1, comp_step - MAPF_WINDOW)
            window_end   = comp_step + MAPF_WINDOW
            window_rows  = df[
                (df["step"] >= window_start) & (df["step"] <= window_end)
            ].sort_values("step")

            step_context = []
            for _, wr in window_rows.iterrows():
                is_competitor_tx = (
                    str(wr["nameOrig"]) == str(comp["nameOrig"])
                    and str(wr["nameDest"]) == dest
                    and int(wr["step"]) == comp_step
                )
                is_center_tx = (
                    str(wr["nameOrig"]) == entity_id
                    and str(wr["nameDest"]) == dest
                )
                is_fraud_tx = int(wr.get("isFraud", 0)) == 1

                step_context.append({
                    "step":      int(wr["step"]),
                    "from":      str(wr["nameOrig"]),
                    "to":        str(wr["nameDest"]),
                    "type":      str(wr["type"]),
                    "amount":    round(float(wr["amount"]), 2),
                    "isFraud":   int(wr.get("isFraud", 0)),
                    "highlight": "competitor" if is_competitor_tx else
                                 "center"     if is_center_tx     else
                                 "fraud"      if is_fraud_tx       else
                                 "normal",
                })

            center_tx_to_dest = df[
                (df["nameOrig"] == entity_id) & (df["nameDest"] == dest)
            ]
            center_step = int(center_tx_to_dest.iloc[0]["step"]) \
                if not center_tx_to_dest.empty else step1

            conflict_msg = (
                f"Account {comp['nameOrig']} sent a {comp['type']} of "
                f"${float(comp['amount']):,.0f} to the same destination "
                f"({dest}) within {MAPF_WINDOW} steps — "
                "possible coordinated fraud path."
            )
            conflicts.append(conflict_msg)

            conflict_steps.append({
                "competitor_account":  str(comp["nameOrig"]),
                "center_account":      entity_id,
                "destination":         dest,
                "tx_type":             tx_type,
                "competitor_amount":   round(float(comp["amount"]), 2),
                "competitor_step":     comp_step,
                "center_step":         center_step,
                "step_difference":     abs(comp_step - center_step),
                "window":              MAPF_WINDOW,
                "step_context":        step_context,
                "competitor_is_fraud": int(comp.get("isFraud", 0)),
            })

            if len(conflicts) >= MAX_MAPF:
                return conflicts, conflict_steps

    return conflicts[:MAX_MAPF], conflict_steps[:MAX_MAPF]


def _node_type(entity_id: str) -> str:
    if entity_id.startswith("C"):
        return "account"
    if entity_id.startswith("M"):
        return "merchant"
    return "unknown"
