# FraudGraph AI

> **AI-powered fraud detection that catches stolen money in milliseconds — using rules, machine learning, and network graph analysis together.**

Built at **HackathonNMSU** by **TheLastWindow** (Fuad & Zaman) · Fintech Track

---

## What Is This?

FraudGraph AI is a full-stack fraud investigation dashboard. It takes a bank transaction, scores it for fraud probability in under a second, draws a map of every account the money touched, and gives the investigator a plain-English report telling them exactly what went wrong and what to do next.

A junior investigator with zero experience can make the same decision as a 10-year fraud expert — in under 30 seconds.

---

## Live Demo

```
Frontend  →  http://localhost:5173
Backend   →  http://localhost:8000
API docs  →  http://localhost:8000/docs
```

---

## How It Works

The system runs three checks simultaneously on every transaction:

**1. Rules Engine** — 6 instant symbolic checks
- Was the account completely emptied?
- Is the amount unusually large (over $200,000)?
- Did a dormant account suddenly receive a huge sum?
- Is the transaction type high-risk (TRANSFER or CASH_OUT)?
- Do the balance numbers add up correctly?
- Did the bank's own system already flag it?

**2. ML Anomaly Model** — IsolationForest trained on 3,080 transactions
- Compares the transaction statistically against all known transactions
- Scores how anomalous it looks on a 0–1 scale
- Anything in the top 5% most unusual transactions gets a high score

**3. Network Graph** — GNN-inspired risk propagation
- Traces every account the money touched (2 hops outward)
- Spreads risk through connections: `Risk = base + 0.30 × Σ(neighbour_risk × edge_weight)`
- Detects coordinated fraud rings using MAPF (Multi-Agent Path Finding)

**Final score:** `(60% × rule_score) + (40% × ml_score)`

| Score | Risk Level | Action |
|-------|-----------|--------|
| < 35% | Low | Monitor only |
| 35–65% | Medium | Review today |
| > 65% | High | Freeze accounts NOW |

---

## Features

### Transaction Table
- Search, filter by risk level and transaction type
- Sort by fraud probability, amount, or step
- Click any row to open the full investigation

### Money Flow Network Graph
- Interactive D3.js force graph showing all connected accounts
- Red nodes = high risk, orange = medium, green = safe
- Click any circle or line for a full animated story lightbox
- MAPF conflict bar shows coordinated fraud ring detection

### Case Investigation Panel
Seven collapsible sections:
1. **What went wrong** — animated cartoon detective explains each red flag
2. **What kind of fraud** — scenario probabilities (account takeover, phishing, mule network, etc.)
3. **Reconstructed timeline** — step-by-step what the fraudster did
4. **Who is at risk** — victim, bank, receiver, other customers
5. **Warning signs** — signals that should have raised alarms earlier
6. **Action plan** — prioritised steps (DO NOW / DO TODAY / THIS WEEK)
7. **How the AI decided** — full breakdown of rule score vs ML score

### Animated Lightboxes
- Click any node → 5-panel cartoon story of that account
- Click any edge → 5-panel story of that transaction
- MAPF button → animated agent bubbles showing fraud ring coordination with real transaction data table

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend language | Python 3.10 |
| API server | FastAPI + Uvicorn |
| ML model | Scikit-learn IsolationForest |
| Graph engine | NetworkX + custom GNN propagation |
| Fraud ring detection | Custom MAPF algorithm |
| AI explanations | Claude API / GPT API |
| Data processing | Pandas, NumPy |
| Frontend framework | React 18 + TypeScript + Vite |
| Graph visualisation | D3.js |
| HTTP client | Axios |
| Dataset | PaySim (3,080 transactions) |

---

## Project Structure

```
fraudgraph/
├── backend/
│   ├── main.py                  # FastAPI app, CORS, router mount
│   ├── requirements.txt
│   ├── pytest.ini               # pythonpath = . (required)
│   ├── data/
│   │   └── demo_data.csv        # 3,080 PaySim transactions
│   ├── routes/
│   │   └── fraud.py             # 5 API endpoints
│   └── services/
│       ├── data_loader.py       # CSV load + cache
│       ├── rules_engine.py      # 6 symbolic fraud rules
│       ├── scoring.py           # IsolationForest + combined score
│       ├── explanation.py       # Plain-English explanation generator
│       └── graph_engine.py      # NetworkX + GNN propagation + MAPF
│
└── frontend/
    ├── vite.config.ts           # Proxy /api → localhost:8000
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx
    │   ├── Dashboard.tsx        # 3-tab right panel layout
    │   ├── api/
    │   │   └── api.ts           # Axios client + TypeScript types
    │   └── components/
    │       ├── SummaryCards.tsx      # 4 stat cards at top
    │       ├── TransactionTable.tsx  # Search + filter + sort table
    │       ├── GraphComponent.tsx    # D3 network + all lightboxes
    │       ├── CaseInvestigation.tsx # 7-section investigation report
    │       ├── RiskCard.tsx          # Score bars + risk tabs
    │       └── ExplanationBox.tsx    # Animated AI agent reasoning
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server status + model ready check |
| GET | `/api/stats` | Dashboard summary statistics |
| GET | `/api/transactions` | List transactions with filter/sort/limit |
| GET | `/api/transaction/{tx_id}` | Single transaction full detail |
| GET | `/api/graph?entity_id=&depth=` | Money flow network for an account |

---

## Setup & Installation

### Prerequisites
- Python 3.10+
- Node.js 18+ and npm

### Backend

```bash
cd fraudgraph/backend

# Create virtual environment
python -m venv venv
source venv/bin/activate        # Mac/Linux
# venv\Scripts\activate         # Windows

# Install dependencies
pip install fastapi uvicorn pandas numpy scikit-learn networkx

# Start the server
uvicorn main:app --reload --port 8000
```

Verify it is running:
```bash
curl http://localhost:8000/api/health
# {"status":"ok","service":"FraudGraph AI","model_ready":true}
```

### Frontend

```bash
cd fraudgraph/frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open `http://localhost:5173` in your browser.

> **Important:** Both servers must run simultaneously in two separate terminal tabs. The frontend proxies all `/api` requests to port 8000.

---

## The Fraud Detection Pipeline

```
Transaction arrives
       ↓
rules_engine.py
  ├── balance_drain?       (weight 0.30)
  ├── dest_zero_to_large?  (weight 0.25)
  ├── high_amount?         (weight 0.25)
  ├── risky_type?          (weight 0.20)
  ├── balance_mismatch?    (weight 0.20)
  └── system_flagged?      (weight 0.15)
       ↓
scoring.py
  ├── rule_score = min(sum of triggered weights, 1.0)
  ├── ml_score   = IsolationForest anomaly (0–1)
  └── final      = 0.6 × rule_score + 0.4 × ml_score
       ↓
graph_engine.py
  ├── BFS subgraph (2 hops from entity)
  ├── GNN risk propagation across edges
  └── MAPF conflict detection (±5 step window)
       ↓
explanation.py
  └── Plain-English narrative from triggered rules + ML context
       ↓
fraud.py API route
  └── JSON response → React frontend → Investigation dashboard
```

---

## How "What Went Wrong" Works

The rules engine returns a list of triggered rule IDs. The frontend `getMistakes()` function maps each ID to a human-readable story card:

```
balance_drain       → "The entire account was emptied in one transaction"
dest_zero_to_large  → "Money was sent to a dormant mule account"
high_amount         → "An unusually large sum was moved"
risky_type          → "Bank Transfers are the most common fraud vehicle"
balance_mismatch    → "The transaction numbers do not add up correctly"
system_flagged      → "The bank's own system already flagged this"
```

Each card shows the title in bold and a detailed plain-English explanation using the actual transaction values (account numbers, amounts, balances) filled in dynamically.

---

## MAPF — Coordinated Fraud Ring Detection

MAPF (Multi-Agent Path Finding) models every bank account as an "agent" moving through time. It detects when two or more agents converge on the same destination within a ±5 step time window — a pattern consistent with a fraud ring controller directing multiple accounts simultaneously.

For each conflict detected, the system returns:
- The competitor account and center account
- Their exact step numbers and amounts
- The 11 actual transactions surrounding the conflict window
- Each transaction colour-coded: COMPETITOR / CENTER / FRAUD / normal

This data powers the animated MAPF lightbox in the frontend.

---

## Risk Score Thresholds

```python
HIGH   = risk_score >= 0.65   # Freeze accounts immediately
MEDIUM = risk_score >= 0.35   # Review manually today
LOW    = risk_score <  0.35   # Monitor only
```

---

## Dataset

The system uses the **PaySim** synthetic financial dataset — a simulation of mobile money transactions designed to mirror real fraud patterns.

- 3,080 transactions total
- 80 confirmed fraud cases (`isFraud = 1`)
- 41 system-flagged transactions (`isFlaggedFraud = 1`)
- Transaction types: TRANSFER, CASH_OUT, PAYMENT, DEBIT, CASH_IN
- Only TRANSFER and CASH_OUT contain confirmed fraud cases

---

## Known Limitations

- Dataset is synthetic (PaySim), not real bank data
- IsolationForest requires retraining when new transaction patterns emerge
- MAPF window of ±5 steps may miss slower coordinated attacks
- Graph depth limited to 2 hops for performance — deeper graphs slow rendering

---

## Roadmap

- [ ] Real-time transaction stream via Kafka or webhook
- [ ] PyTorch Geometric GNN replacing the formula-based propagation
- [ ] Auto-generated SAR (Suspicious Activity Report) PDF export
- [ ] Multi-bank network — shared anonymised fraud signals across institutions
- [ ] Temporal sequence analysis — detect patterns across multiple transactions
- [ ] Feedback loop — investigator decisions retrain the model automatically
- [ ] Mobile push alert for high-risk transactions
- [ ] REST API packaging for bank integration

---

## Team

**TheLastWindow**

- Fuad
- Zaman

Built in 48 hours at HackathonNMSU · Fintech Track

---

## License

MIT — free to use, modify, and distribute.
