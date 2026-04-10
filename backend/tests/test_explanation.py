"""Tests for services/explanation.py"""
import pytest
from services.explanation import generate_explanation, generate_mapf_explanation


@pytest.fixture
def fraud_rules():
    return [
        {"id": "high_amount",   "label": "High-value transaction", "weight": 0.25},
        {"id": "balance_drain", "label": "Balance drained to zero", "weight": 0.30},
    ]


@pytest.fixture
def fraud_row():
    return {
        "type": "TRANSFER", "amount": 450_000.0,
        "oldbalanceOrg": 450_000.0, "newbalanceOrig": 0.0,
        "oldbalanceDest": 0.0, "newbalanceDest": 450_000.0,
    }


def test_high_risk_explanation_contains_intro(fraud_row, fraud_rules):
    text = generate_explanation(fraud_row, fraud_rules, "High", ml_score=0.82)
    assert "HIGH RISK" in text


def test_medium_risk_explanation(fraud_row):
    text = generate_explanation(fraud_row, [], "Medium", ml_score=0.4)
    assert "MEDIUM RISK" in text


def test_low_risk_no_rules():
    row  = {"type": "PAYMENT", "amount": 50.0, "oldbalanceOrg": 500.0,
            "newbalanceOrig": 450.0, "oldbalanceDest": 0.0, "newbalanceDest": 50.0}
    text = generate_explanation(row, [], "Low", ml_score=0.1)
    assert "LOW RISK" in text
    assert "No significant" in text


def test_explanation_lists_triggered_rules(fraud_row, fraud_rules):
    text = generate_explanation(fraud_row, fraud_rules, "High", ml_score=0.8)
    assert "Signals detected" in text
    assert "high-value" in text.lower() or "high_amount" in text.lower() or "High-value" in text


def test_explanation_includes_ml_score(fraud_row, fraud_rules):
    text = generate_explanation(fraud_row, fraud_rules, "High", ml_score=0.72)
    assert "0.72" in text


def test_mapf_explanation_empty():
    result = generate_mapf_explanation([])
    assert result == ""


def test_mapf_explanation_with_conflicts():
    conflicts = ["Account A sent TRANSFER to same dest within 3 steps."]
    result = generate_mapf_explanation(conflicts)
    assert "MAPF" in result
    assert "Account A" in result
