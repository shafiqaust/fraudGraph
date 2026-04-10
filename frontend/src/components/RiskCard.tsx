import type { Transaction } from '../api/api'

interface Props { tx: Transaction | null }

const TYPE_LABEL: Record<string, string> = {
  TRANSFER: 'Bank Transfer', CASH_OUT: 'Cash Withdrawal',
  PAYMENT: 'Payment', DEBIT: 'Debit', CASH_IN: 'Deposit',
}
const TYPE_COLOR: Record<string, string> = {
  TRANSFER: '#dc2626', CASH_OUT: '#ea580c',
  PAYMENT: '#2563eb', DEBIT: '#6b7280', CASH_IN: '#16a34a',
}
const LEVEL_CFG: Record<string, { color: string; bg: string; border: string; icon: string; msg: string }> = {
  High:   { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: '🚨', msg: 'Multiple strong fraud indicators. Immediate review recommended.' },
  Medium: { color: '#ea580c', bg: '#fff7ed', border: '#fed7aa', icon: '⚠️', msg: 'Suspicious patterns detected. Manual review suggested.' },
  Low:    { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', icon: '✅', msg: 'Transaction appears normal. No significant fraud signals.' },
}
const RULE_ENGLISH: Record<string, string> = {
  high_amount:        '💵 Very large amount of money',
  risky_type:         '🔄 High-risk transaction type',
  balance_drain:      '🪣 Sender\'s account was completely emptied',
  dest_zero_to_large: '📥 Receiver went from $0 to a large sum instantly',
  system_flagged:     '🏦 Bank\'s own system flagged this transaction',
  balance_mismatch:   '🔢 The numbers don\'t add up correctly',
}

function Bar({ label, help, value, color }: { label: string; help: string; value: number; color: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-700)' }}>{label}</div>
          <div style={{ fontSize: 10, color: 'var(--gray-400)', marginTop: 1 }}>{help}</div>
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: 'var(--mono)' }}>
          {(value * 100).toFixed(0)}%
        </div>
      </div>
      <div style={{ height: 8, background: 'var(--gray-200)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${value * 100}%`,
          background: color, borderRadius: 4, transition: 'width .6s ease',
        }} />
      </div>
    </div>
  )
}

export default function RiskCard({ tx }: Props) {
  if (!tx) return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 24, textAlign: 'center', color: 'var(--gray-400)',
    }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>👆</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 6 }}>
        Select a Transaction
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.6 }}>
        Click any row to see a full fraud risk breakdown
      </div>
    </div>
  )

  const cfg = LEVEL_CFG[tx.risk_level]

  return (
    <div style={{ padding: 16, overflowY: 'auto', height: '100%' }}>

      {/* Verdict */}
      <div style={{
        background: cfg.bg, border: `1px solid ${cfg.border}`,
        borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 24 }}>{cfg.icon}</span>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: cfg.color, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              AI Verdict
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: cfg.color }}>{tx.risk_level} Risk</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: cfg.color, lineHeight: 1.6, fontStyle: 'italic' }}>
          {cfg.msg}
        </div>
      </div>

      {/* What happened */}
      <div style={{
        background: 'var(--gray-50)', borderRadius: 'var(--radius)',
        padding: '12px 14px', marginBottom: 14,
        border: '1px solid var(--gray-200)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
          What happened
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: tx.amount > 200000 ? '#dc2626' : 'var(--gray-900)', marginBottom: 4, fontFamily: 'var(--mono)' }}>
          ${tx.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
        <div style={{ fontSize: 12, color: 'var(--gray-600)', marginBottom: 12 }}>
          {TYPE_LABEL[tx.type] ?? tx.type} from <strong>{tx.nameOrig}</strong> to <strong>{tx.nameDest}</strong>
        </div>
        {[
          ['Sent from',         tx.nameOrig],
          ['Received by',       tx.nameDest],
          ['Sender had before', `$${tx.oldbalanceOrg.toLocaleString(undefined, { maximumFractionDigits: 0 })}`],
          ['Sender had after',  tx.newbalanceOrig === 0 ? '⚠️ $0.00 — Account emptied!' : `$${tx.newbalanceOrig.toLocaleString(undefined, { maximumFractionDigits: 0 })}`],
          ['Receiver had before',`$${tx.oldbalanceDest.toLocaleString(undefined, { maximumFractionDigits: 0 })}`],
          ['Receiver had after', `$${tx.newbalanceDest.toLocaleString(undefined, { maximumFractionDigits: 0 })}`],
          ['Transaction type',   TYPE_LABEL[tx.type] ?? tx.type],
          ['Fraud confirmed',    tx.isFraud ? '⚠️ YES — confirmed fraud' : 'Not labeled as fraud'],
        ].map(([k, v]) => (
          <div key={k as string} style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '4px 0', borderBottom: '1px solid var(--gray-200)', fontSize: 11,
          }}>
            <span style={{ color: 'var(--gray-500)' }}>{k}</span>
            <span style={{
              fontWeight: 600,
              color: (v as string).includes('⚠️') ? '#dc2626'
                   : ['Sent from','Received by'].includes(k as string) ? 'var(--gray-600)'
                   : ['Transaction type'].includes(k as string) ? (TYPE_COLOR[tx.type] ?? 'var(--gray-700)')
                   : 'var(--gray-700)',
              fontFamily: (k as string).includes('had') ? 'var(--mono)' : 'inherit',
              fontSize: ['Sent from','Received by'].includes(k as string) ? 10 : 11,
            }}>
              {v}
            </span>
          </div>
        ))}
      </div>

      {/* Score bars */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
          How confident is the AI?
        </div>
        <Bar label="Pattern matching score"    help="Based on 6 hand-crafted fraud detection rules"         value={tx.rule_score} color="#2563eb" />
        <Bar label="Statistical anomaly score" help="How unusual vs 3,000 other transactions"               value={tx.ml_score}   color="#7c3aed" />
        <Bar label="Overall fraud probability" help="Combined score (60% rules + 40% statistics)"           value={tx.risk_score} color={cfg.color} />
      </div>

      {/* Rules fired */}
      {tx.triggered_rules.length > 0 ? (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            Why the alarm fired ({tx.triggered_rules.length} {tx.triggered_rules.length === 1 ? 'reason' : 'reasons'})
          </div>
          {tx.triggered_rules.map((r, i) => (
            <div key={r.id} style={{
              display: 'flex', gap: 10, marginBottom: 6,
              padding: '8px 12px', background: '#fef2f2',
              borderRadius: 'var(--radius-sm)', border: '1px solid #fecaca',
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{i === 0 ? '🚩' : '⚑'}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', marginBottom: 2 }}>
                  {RULE_ENGLISH[r.id] ?? r.id}
                </div>
                <div style={{ fontSize: 11, color: '#991b1b', lineHeight: 1.5 }}>{r.label}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          padding: '12px 14px', background: '#f0fdf4',
          border: '1px solid #bbf7d0', borderRadius: 'var(--radius-sm)',
          fontSize: 12, color: '#15803d',
        }}>
          ✅ No fraud rules triggered — risk is based on statistical patterns only.
        </div>
      )}
    </div>
  )
}
