import { useState } from 'react'
import type { Transaction } from '../api/api'

interface Props {
  transactions: Transaction[]
  selected:     Transaction | null
  onSelect:     (tx: Transaction) => void
}

const TYPE_LABEL: Record<string, string> = {
  TRANSFER: 'Bank Transfer',
  CASH_OUT: 'Cash Withdrawal',
  PAYMENT:  'Payment',
  DEBIT:    'Debit',
  CASH_IN:  'Deposit',
}

const TYPE_COLOR: Record<string, string> = {
  TRANSFER: '#dc2626',
  CASH_OUT: '#ea580c',
  PAYMENT:  '#2563eb',
  DEBIT:    '#6b7280',
  CASH_IN:  '#16a34a',
}

const RISK_CFG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  High:   { label: '🔴 High Risk',   bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  Medium: { label: '🟡 Medium Risk', bg: '#fff7ed', color: '#ea580c', border: '#fed7aa' },
  Low:    { label: '🟢 Low Risk',    bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
}

const inputStyle: React.CSSProperties = {
  fontSize: 12, padding: '5px 9px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--gray-200)',
  background: '#fff', color: 'var(--gray-700)',
  fontFamily: 'var(--font)', outline: 'none',
  width: '100%',
}

export default function TransactionTable({ transactions, selected, onSelect }: Props) {
  const [riskF,  setRiskF]  = useState('')
  const [typeF,  setTypeF]  = useState('')
  const [search, setSearch] = useState('')

  const filtered = transactions.filter(tx =>
    (!riskF  || tx.risk_level === riskF) &&
    (!typeF  || tx.type === typeF) &&
    (!search || tx.nameOrig.toLowerCase().includes(search.toLowerCase()) ||
               tx.nameDest.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Filters */}
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid var(--gray-200)',
        background: 'var(--gray-50)',
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        flexShrink: 0,
      }}>
        <input
          placeholder="🔍  Search by account ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={inputStyle}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <select
            value={riskF}
            onChange={e => setRiskF(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          >
            <option value=''>All risk levels</option>
            <option value='High'>🔴 High Risk</option>
            <option value='Medium'>🟡 Medium Risk</option>
            <option value='Low'>🟢 Low Risk</option>
          </select>
          <select
            value={typeF}
            onChange={e => setTypeF(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          >
            <option value=''>All types</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div style={{ fontSize: 10, color: 'var(--gray-400)', textAlign: 'right' }}>
          Showing {filtered.length} of {transactions.length} transactions
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{
            padding: 32, textAlign: 'center',
            color: 'var(--gray-400)', fontSize: 13,
          }}>
            No transactions match your filters
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{
                background: 'var(--gray-50)',
                position: 'sticky', top: 0, zIndex: 1,
              }}>
                {['Risk Level', 'Type', 'Amount', 'Score'].map(h => (
                  <th key={h} style={{
                    padding: '8px 10px', textAlign: 'left',
                    fontSize: 10, fontWeight: 600, color: 'var(--gray-500)',
                    borderBottom: '1px solid var(--gray-200)',
                    textTransform: 'uppercase', letterSpacing: '.05em',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(tx => {
                const rc = RISK_CFG[tx.risk_level]
                const isSelected = selected?.tx_id === tx.tx_id
                return (
                  <tr
                    key={tx.tx_id}
                    onClick={() => onSelect(tx)}
                    style={{
                      cursor: 'pointer',
                      background: isSelected ? '#fef2f2' : '#fff',
                      borderLeft: `3px solid ${isSelected ? '#dc2626' : 'transparent'}`,
                      transition: 'all .1s',
                    }}
                    onMouseEnter={e => {
                      if (!isSelected)
                        (e.currentTarget as HTMLElement).style.background = 'var(--gray-50)'
                    }}
                    onMouseLeave={e => {
                      if (!isSelected)
                        (e.currentTarget as HTMLElement).style.background = '#fff'
                    }}
                  >
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--gray-100)' }}>
                      <span style={{
                        background: rc.bg, color: rc.color,
                        border: `1px solid ${rc.border}`,
                        fontSize: 10, fontWeight: 600,
                        padding: '2px 7px', borderRadius: 20,
                        whiteSpace: 'nowrap',
                      }}>
                        {rc.label}
                      </span>
                    </td>
                    <td style={{
                      padding: '8px 10px',
                      borderBottom: '1px solid var(--gray-100)',
                      color: TYPE_COLOR[tx.type] ?? 'var(--gray-700)',
                      fontWeight: 600, fontSize: 11,
                    }}>
                      {TYPE_LABEL[tx.type] ?? tx.type}
                    </td>
                    <td style={{
                      padding: '8px 10px',
                      borderBottom: '1px solid var(--gray-100)',
                      fontWeight: tx.amount > 200000 ? 700 : 400,
                      color: tx.amount > 200000 ? '#dc2626' : 'var(--gray-700)',
                      fontFamily: 'var(--mono)', fontSize: 11,
                    }}>
                      ${tx.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--gray-100)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{
                          flex: 1, height: 5,
                          background: 'var(--gray-200)',
                          borderRadius: 3, overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${tx.risk_score * 100}%`,
                            background: rc.color, borderRadius: 3,
                          }} />
                        </div>
                        <span style={{
                          fontSize: 10, fontFamily: 'var(--mono)',
                          color: rc.color, fontWeight: 700, minWidth: 28,
                        }}>
                          {(tx.risk_score * 100).toFixed(0)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
