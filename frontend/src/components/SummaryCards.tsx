import type { StatsResponse } from '../api/api'

interface Props { stats: StatsResponse | null }

export default function SummaryCards({ stats }: Props) {
  const cards = [
    {
      icon: '📊',
      label: 'Transactions Reviewed',
      value: stats?.total_rows?.toLocaleString() ?? '…',
      detail: 'Total transactions analysed today',
      color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe',
    },
    {
      icon: '🚨',
      label: 'Confirmed Fraud Found',
      value: stats?.fraud_count ?? '…',
      detail: `${stats ? ((stats.fraud_count / stats.total_rows) * 100).toFixed(1) : '…'}% of all transactions`,
      color: '#dc2626', bg: '#fef2f2', border: '#fecaca',
    },
    {
      icon: '⚠️',
      label: 'Flagged as High Risk',
      value: stats?.high_risk_count ?? '…',
      detail: `+ ${stats?.medium_risk_count ?? '…'} medium risk cases`,
      color: '#ea580c', bg: '#fff7ed', border: '#fed7aa',
    },
    {
      icon: '💰',
      label: 'Total Volume Monitored',
      value: stats ? `$${(stats.total_amount / 1e6).toFixed(1)}M` : '…',
      detail: `Avg $${stats?.avg_amount?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? '…'} per transaction`,
      color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0',
    },
  ]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 12,
      padding: '14px 20px',
      background: '#fff',
      borderBottom: '1px solid var(--gray-200)',
    }}>
      {cards.map(c => (
        <div key={c.label} style={{
          background: c.bg,
          borderRadius: 'var(--radius)',
          padding: '14px 16px',
          border: `1px solid ${c.border}`,
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
        }}>
          <div style={{ fontSize: 22, lineHeight: 1, marginTop: 2, flexShrink: 0 }}>{c.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 10, color: c.color, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3,
            }}>
              {c.label}
            </div>
            <div style={{
              fontSize: 24, fontWeight: 800, color: c.color,
              letterSpacing: '-.5px', lineHeight: 1, marginBottom: 3,
            }}>
              {c.value}
            </div>
            <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>{c.detail}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
