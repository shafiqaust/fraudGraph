"""Tests for services/rules_engine.py"""
import pytest
from services.rules_engine import evaluate_rules, get_rule_definitions


@pytest.fixture
def clean_row():
    return {
        "type": "PAYMENT", "amount": 100.0,
        "oldbalanceOrg": 5000.0, "newbalanceOrig": 4900.0,
        "oldbalanceDest": 1000.0, "newbalanceDest": 1100.0,
        "isFlaggedFraud": 0,
    }


@pytest.fixture
def fraud_row():
    return {
        "type": "TRANSFER", "amount": 500_000.0,
        "oldbalanceOrg": 500_000.0, "newbalanceOrig": 0.0,
        "oldbalanceDest": 0.0, "newbalanceDest": 500_000.0,
        "isFlaggedFraud": 1,
    }


def test_clean_row_no_rules_triggered(clean_row):
    result = evaluate_rules(clean_row)
    assert result["rule_score"] == 0.0
    assert result["triggered_rules"] == []


def test_fraud_row_triggers_multiple_rules(fraud_row):
    result = evaluate_rules(fraud_row)
    assert result["rule_score"] > 0.5
    ids = [r["id"] for r in result["triggered_rules"]]
    assert "high_amount"   in ids
    assert "risky_type"    in ids
    assert "balance_drain" in ids


def test_rule_score_capped_at_one(fraud_row):
    result = evaluate_rules(fraud_row)
    assert result["rule_score"] <= 1.0


def test_high_amount_rule():
    row = {"type": "PAYMENT", "amount": 300_000.0,
           "oldbalanceOrg": 500_000.0, "newbalanceOrig": 200_000.0,
           "oldbalanceDest": 0.0, "newbalanceDest": 300_000.0,
           "isFlaggedFraud": 0}
    result = evaluate_rules(row)
    ids = [r["id"] for r in result["triggered_rules"]]
    assert "high_amount" in ids


def test_balance_drain_rule():
    row = {"type": "TRANSFER", "amount": 5000.0,
           "oldbalanceOrg": 5000.0, "newbalanceOrig": 0.0,
           "oldbalanceDest": 0.0, "newbalanceDest": 5000.0,
           "isFlaggedFraud": 0}
    result = evaluate_rules(row)
    ids = [r["id"] for r in result["triggered_rules"]]
    assert "balance_drain" in ids


def test_flagged_rule():
    row = {"type": "PAYMENT", "amount": 50.0,
           "oldbalanceOrg": 1000.0, "newbalanceOrig": 950.0,
           "oldbalanceDest": 0.0, "newbalanceDest": 50.0,
           "isFlaggedFraud": 1}
    result = evaluate_rules(row)
    ids = [r["id"] for r in result["triggered_rules"]]
    assert "system_flagged" in ids


def test_get_rule_definitions():
    defs = get_rule_definitions()
    assert len(defs) >= 5
    for d in defs:
        assert "id"     in d
        assert "label"  in d
        assert "weight" in d


def test_bad_row_does_not_crash():
    result = evaluate_rules({})
    assert "rule_score"      in result
    assert "triggered_rules" in result
