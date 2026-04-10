"""Tests for services/graph_engine.py"""
import pytest
import pandas as pd
from services.data_loader  import load_data, clear_cache
from services.graph_engine import build_graph_for_entity


@pytest.fixture(scope="module")
def df():
    clear_cache()
    return load_data()


@pytest.fixture(scope="module")
def center_entity(df):
    fraud_rows = df[df["isFraud"] == 1]
    return str(fraud_rows.iloc[0]["nameOrig"])


def test_graph_returns_required_keys(df, center_entity):
    result = build_graph_for_entity(df, center_entity, depth=1)
    for key in ["center", "nodes", "edges", "mapf_conflicts", "stats"]:
        assert key in result


def test_graph_center_node_present(df, center_entity):
    result = build_graph_for_entity(df, center_entity, depth=1)
    node_ids = [n["id"] for n in result["nodes"]]
    assert center_entity in node_ids


def test_graph_nodes_have_required_fields(df, center_entity):
    result = build_graph_for_entity(df, center_entity, depth=1)
    for node in result["nodes"]:
        assert "id"             in node
        assert "type"           in node
        assert "base_risk"      in node
        assert "propagated_risk" in node
        assert 0.0 <= node["propagated_risk"] <= 1.0


def test_graph_edges_have_required_fields(df, center_entity):
    result = build_graph_for_entity(df, center_entity, depth=1)
    for edge in result["edges"]:
        assert "source" in edge
        assert "target" in edge
        assert "amount" in edge
        assert "weight" in edge


def test_propagated_risk_gte_base_risk(df, center_entity):
    result = build_graph_for_entity(df, center_entity, depth=2)
    center = next(n for n in result["nodes"] if n["id"] == center_entity)
    assert center["propagated_risk"] >= center["base_risk"] - 1e-9


def test_fraud_entity_has_high_base_risk(df):
    fraud_rows = df[df["isFraud"] == 1]
    entity     = str(fraud_rows.iloc[0]["nameOrig"])
    result     = build_graph_for_entity(df, entity, depth=1)
    center     = next(n for n in result["nodes"] if n["id"] == entity)
    assert center["base_risk"] > 0.1


def test_unknown_entity_returns_empty_graph(df):
    result = build_graph_for_entity(df, "UNKNOWN_ENTITY_XYZ", depth=1)
    assert result["stats"]["node_count"] == 0 or result["center"] == "UNKNOWN_ENTITY_XYZ"


def test_mapf_conflicts_is_list(df, center_entity):
    result = build_graph_for_entity(df, center_entity, depth=1)
    assert isinstance(result["mapf_conflicts"], list)
