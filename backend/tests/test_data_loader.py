"""Tests for services/data_loader.py"""
import pytest
import pandas as pd
from services.data_loader import load_data, get_transaction, get_dataset_stats, clear_cache


@pytest.fixture(autouse=True)
def reset_cache():
    clear_cache()
    yield
    clear_cache()


def test_load_data_returns_dataframe():
    df = load_data()
    assert isinstance(df, pd.DataFrame)
    assert len(df) > 0


def test_load_data_has_required_columns():
    df = load_data()
    required = ["tx_id", "step", "type", "amount", "nameOrig", "nameDest",
                "oldbalanceOrg", "newbalanceOrig", "oldbalanceDest",
                "newbalanceDest", "isFraud", "isFlaggedFraud"]
    for col in required:
        assert col in df.columns, f"Missing column: {col}"


def test_load_data_tx_id_unique():
    df = load_data()
    assert df["tx_id"].nunique() == len(df)


def test_load_data_type_is_uppercase():
    df = load_data()
    assert df["type"].str.isupper().all()


def test_load_data_no_null_amounts():
    df = load_data()
    assert df["amount"].isna().sum() == 0


def test_load_data_returns_copy():
    df1 = load_data()
    df2 = load_data()
    df1["__test__"] = 999
    assert "__test__" not in df2.columns


def test_get_transaction_found():
    df = load_data()
    tx_id = df["tx_id"].iloc[0]
    row = get_transaction(tx_id)
    assert row is not None
    assert row["tx_id"] == tx_id


def test_get_transaction_not_found():
    result = get_transaction("nonexistent_id_xyz")
    assert result is None


def test_get_dataset_stats_keys():
    stats = get_dataset_stats()
    expected = ["total_rows", "fraud_count", "flagged_count",
                "type_counts", "total_amount", "avg_amount", "max_amount"]
    for k in expected:
        assert k in stats, f"Missing stat key: {k}"


def test_get_dataset_stats_totals_positive():
    stats = get_dataset_stats()
    assert stats["total_rows"] > 0
    assert stats["total_amount"] > 0
    assert stats["avg_amount"] > 0
