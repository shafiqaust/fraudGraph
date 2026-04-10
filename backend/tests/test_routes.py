"""Integration tests for API routes (routes/fraud.py)"""
import pytest
from httpx import AsyncClient, ASGITransport
from main import app


@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"


@pytest.fixture(scope="module")
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.anyio
async def test_health(client):
    r = await client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


@pytest.mark.anyio
async def test_stats_keys(client):
    r = await client.get("/api/stats")
    assert r.status_code == 200
    data = r.json()
    for k in ["total_rows", "fraud_count", "high_risk_count", "low_risk_count"]:
        assert k in data


@pytest.mark.anyio
async def test_transactions_default(client):
    r = await client.get("/api/transactions")
    assert r.status_code == 200
    body = r.json()
    assert "transactions" in body
    assert "total"        in body
    assert len(body["transactions"]) > 0


@pytest.mark.anyio
async def test_transactions_risk_filter(client):
    r = await client.get("/api/transactions?risk_level=High")
    assert r.status_code == 200
    body = r.json()
    for tx in body["transactions"]:
        assert tx["risk_level"] == "High"


@pytest.mark.anyio
async def test_transactions_type_filter(client):
    r = await client.get("/api/transactions?tx_type=TRANSFER")
    assert r.status_code == 200
    body = r.json()
    for tx in body["transactions"]:
        assert tx["type"] == "TRANSFER"


@pytest.mark.anyio
async def test_transaction_detail_found(client):
    r   = await client.get("/api/transactions?limit=1")
    tx  = r.json()["transactions"][0]
    r2  = await client.get(f"/api/transaction/{tx['tx_id']}")
    assert r2.status_code == 200
    assert r2.json()["tx_id"] == tx["tx_id"]


@pytest.mark.anyio
async def test_transaction_detail_not_found(client):
    r = await client.get("/api/transaction/NONEXISTENT_99999")
    assert r.status_code == 404


@pytest.mark.anyio
async def test_graph_endpoint(client):
    r    = await client.get("/api/transactions?risk_level=High&limit=1")
    txs  = r.json()["transactions"]
    if not txs:
        pytest.skip("No high-risk transactions in dataset")
    entity = txs[0]["nameOrig"]
    r2     = await client.get(f"/api/graph?entity_id={entity}&depth=1")
    assert r2.status_code == 200
    body   = r2.json()
    assert "nodes"  in body
    assert "edges"  in body
    assert "center" in body


@pytest.mark.anyio
async def test_graph_missing_entity_id(client):
    r = await client.get("/api/graph")
    assert r.status_code == 422  # Unprocessable Entity — missing required param
