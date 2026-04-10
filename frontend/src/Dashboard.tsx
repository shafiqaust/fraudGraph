import { useState, useEffect } from 'react'
import { fetchStats, fetchTransactions, fetchGraph } from './api/api'
import type { Transaction, StatsResponse, GraphResponse } from './api/api'
import SummaryCards      from './components/SummaryCards'
import TransactionTable  from './components/TransactionTable'
import RiskCard          from './components/RiskCard'
import ExplanationBox    from './components/ExplanationBox'
import GraphComponent    from './components/GraphComponent'
import CaseInvestigation from './components/CaseInvestigation'

type Tab = 'case' | 'explain' | 'risk'

const TYPE_LABEL: Record<string, string> = {
  TRANSFER: 'Bank Transfer', CASH_OUT: 'Cash Withdrawal',
  PAYMENT: 'Payment', DEBIT: 'Debit', CASH_IN: 'Deposit',
}

export default function Dashboard() {
  const [stats,        setStats]        = useState<StatsResponse | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [selected,     setSelected]     = useState<Transaction | null>(null)
  const [graph,        setGraph]        = useState<GraphResponse | null>(null)
  const [graphLoading, setGraphLoading] = useState(false)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')
  const [activeTab,    setActiveTab]    = useState<Tab>('case')

  useEffect(() => {
    ;(async () => {
      try {
        const [s, t] = await Promise.all([
          fetchStats(),
          fetchTransactions({ limit: 500, sort_by: 'risk_score' }),
        ])
        setStats(s)
        setTransactions(t.transactions)
      } catch {
        setError('Cannot reach the fraud detection server. Make sure the backend is running on port 8000.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const handleSelect = async (tx: Transaction) => {
    setSelected(tx)
    setGraph(null)
    setGraphLoading(true)
    setActiveTab('case')
    try {
      const g = await fetchGraph(tx.nameOrig, 2)
      setGraph(g)
    } catch { } finally {
      setGraphLoading(false)
    }
  }

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#0f172a,#1e1b4b)', gap: 20 }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', border: '4px solid #dc2626', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: '#fff', fontSize: 22, fontWeight: 800, marginBottom: 6 }}>FraudGraph AI</div>
        <div style={{ color: '#94a3b8', fontSize: 14, marginBottom: 4 }}>Starting fraud detection engine...</div>
        <div style={{ color: '#475569', fontSize: 12 }}>First load takes about 4 seconds</div>
      </div>
      <div style={{ display: 'flex', gap: 20 }}>
        {['Loading transactions','Training AI model','Scoring transactions'].map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc2626', animation: `pulse 1.5s ${i * .4}s infinite` }} />
            {s}
          </div>
        ))}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}`}</style>
    </div>
  )

  if (error) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gray-100)' }}>
      <div style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 12, padding: '32px 40px', maxWidth: 440, textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔌</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>Backend Server Not Running</div>
        <div style={{ fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.7, marginBottom: 20 }}>{error}</div>
        <div style={{ background: '#f8fafc', border: '1px solid var(--gray-200)', borderRadius: 8, padding: '12px 14px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--gray-600)', textAlign: 'left', lineHeight: 1.8 }}>
          cd fraudgraph/backend<br />
          source venv/bin/activate<br />
          uvicorn main:app --reload --port 8000
        </div>
      </div>
    </div>
  )

  const TABS: { key: Tab; icon: string; label: string; sub: string }[] = [
    { key: 'case',    icon: '🔎', label: 'Case Investigation', sub: 'Full analysis & action plan' },
    { key: 'explain', icon: '🧠', label: 'AI Reasoning',       sub: 'Step-by-step explanation'   },
    { key: 'risk',    icon: '🎯', label: 'Risk Scores',        sub: 'Scores, rules & details'     },
  ]

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Topbar */}
      <div style={{ background: '#0f172a', height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🛡️</div>
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 15, lineHeight: 1.1 }}>FraudGraph AI</div>
            <div style={{ color: '#475569', fontSize: 10 }}>Fraud Investigation Dashboard</div>
          </div>
        </div>
        <div style={{ height: 20, width: 1, background: '#1e293b' }} />
        <div style={{ fontSize: 11, color: '#64748b', background: '#1e293b', padding: '3px 10px', borderRadius: 4, fontFamily: 'var(--mono)' }}>
          Neuro-Symbolic AI · GNN · MAPF
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <div style={{ background: '#7f1d1d', borderRadius: 6, padding: '4px 12px', fontSize: 11, fontWeight: 700, color: '#fca5a5' }}>
            🚨 {stats?.high_risk_count ?? 0} HIGH
          </div>
          <div style={{ background: '#431407', borderRadius: 6, padding: '4px 12px', fontSize: 11, fontWeight: 600, color: '#fdba74' }}>
            ⚠️ {stats?.medium_risk_count ?? 0} MEDIUM
          </div>
          <div style={{ background: '#14532d', borderRadius: 6, padding: '4px 12px', fontSize: 11, fontWeight: 600, color: '#86efac' }}>
            ✅ {stats?.low_risk_count?.toLocaleString() ?? 0} SAFE
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <SummaryCards stats={stats} />

      {/* Selected banner */}
      {selected && (
        <div style={{
          background: selected.risk_level === 'High' ? '#fef2f2' : selected.risk_level === 'Medium' ? '#fff7ed' : '#f0fdf4',
          borderBottom: `2px solid ${selected.risk_level === 'High' ? '#fecaca' : selected.risk_level === 'Medium' ? '#fed7aa' : '#bbf7d0'}`,
          padding: '7px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <span>{selected.risk_level === 'High' ? '🚨' : selected.risk_level === 'Medium' ? '⚠️' : '✅'}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-700)' }}>Investigating:</span>
          <span style={{ fontSize: 12, color: 'var(--gray-600)' }}>
            <strong>${selected.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
            {' '}{TYPE_LABEL[selected.type] ?? selected.type}
            {' '}from <strong>{selected.nameOrig}</strong> to <strong>{selected.nameDest}</strong>
            {' '}—{' '}
            <strong style={{ color: selected.risk_level === 'High' ? '#dc2626' : selected.risk_level === 'Medium' ? '#ea580c' : '#16a34a' }}>
              {(selected.risk_score * 100).toFixed(0)}% fraud probability
            </strong>
          </span>
          <button onClick={() => { setSelected(null); setGraph(null) }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Main grid */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '360px 1fr', overflow: 'hidden' }}>

        {/* LEFT — table */}
        <div style={{ borderRight: '1px solid var(--gray-200)', display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--gray-200)', background: 'var(--gray-50)', flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-800)' }}>📋 All Transactions</div>
            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>Click any row to open a full investigation</div>
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <TransactionTable transactions={transactions} selected={selected} onSelect={handleSelect} />
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', overflow: 'hidden' }}>

          {/* TOP — tabs */}
          <div style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--gray-200)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--gray-200)', background: 'var(--gray-50)', flexShrink: 0 }}>
              {TABS.map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                  padding: '8px 16px', border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)',
                  background: activeTab === tab.key ? '#fff' : 'transparent',
                  color: activeTab === tab.key ? 'var(--gray-900)' : 'var(--gray-400)',
                  borderBottom: activeTab === tab.key ? '2px solid #dc2626' : '2px solid transparent',
                  transition: 'all .15s', display: 'flex', flexDirection: 'column', gap: 1, textAlign: 'left',
                }}>
                  <span>{tab.icon} {tab.label}</span>
                  <span style={{ fontSize: 9, opacity: .6, fontWeight: 400 }}>{tab.sub}</span>
                </button>
              ))}
              {!selected && (
                <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--gray-400)', alignSelf: 'center', marginLeft: 'auto' }}>
                  ← Select a transaction to begin
                </div>
              )}
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {activeTab === 'case'    && <CaseInvestigation tx={selected} />}
              {activeTab === 'explain' && <ExplanationBox    tx={selected} />}
              {activeTab === 'risk'    && <RiskCard          tx={selected} />}
            </div>
          </div>

          {/* BOTTOM — graph */}
          <div style={{ overflow: 'hidden' }}>
            <GraphComponent graph={graph} loading={graphLoading} centerEntity={selected?.nameOrig ?? ''} />
          </div>
        </div>
      </div>
    </div>
  )
}
