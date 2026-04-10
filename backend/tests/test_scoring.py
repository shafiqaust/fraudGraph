"""Tests for services/scoring.py"""
import pytest
import pandas as pd
from services.scoring import (
    train_model, score_row, combined_score, risk_level, is_trained
)
from services.data_loader import load_data, clear_cache


@pytest.fixture(scope="module")
def trained():
    clear_cache()
    df = load_data()
    train_model(df)
    return df


def test_model_trains(trained):
    assert is_trained()


def test_score_row_returns_float(trained):
    row = trained.iloc[0].to_dict()
    score = score_row(row)
    assert isinstance(score, float)
    assert 0.0 <= score <= 1.0


def test_fraud_row_scores_higher_than_normal(trained):
    fraud_rows  = trained[trained["isFraud"] == 1]
    normal_rows = trained[trained["isFraud"] == 0]
    avg_fraud  = sum(score_row(r) for _, r in fraud_rows.head(20).iterrows())  / 20
    avg_normal = sum(score_row(r) for _, r in normal_rows.head(20).iterrows()) / 20
    assert avg_fraud > avg_normal


def test_combined_score_range():
    for ml, rule in [(0.0, 0.0), (1.0, 1.0), (0.5, 0.5), (0.3, 0.7)]:
        result = combined_score(ml, rule)
        assert 0.0 <= result <= 1.0


def test_combined_score_weighting():
    # Rule score should dominate (60%)
    result = combined_score(ml_score=0.0, rule_score=1.0)
    assert result == pytest.approx(0.6, abs=0.01)

    result = combined_score(ml_score=1.0, rule_score=0.0)
    assert result == pytest.approx(0.4, abs=0.01)


def test_risk_level_high():
    assert risk_level(0.65) == "High"
    assert risk_level(1.00) == "High"


def test_risk_level_medium():
    assert risk_level(0.35) == "Medium"
    assert risk_level(0.64) == "Medium"


def test_risk_level_low():
    assert risk_level(0.0)  == "Low"
    assert risk_level(0.34) == "Low"
