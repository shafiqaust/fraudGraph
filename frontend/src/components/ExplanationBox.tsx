import type { Transaction } from '../api/api'

interface Props { tx: Transaction | null }

export default function ExplanationBox({ tx }: Props) {
  if (!tx) return (
    <div style={{
      height: '100%', display: 'flex', alignItems: 'center',
      justifyContent: 'center', color: 'var(--gray-400)',
      fontSize: 12, padding: 20, textAlign: 'center',
    }}>
      AI reasoning will appear here once you select a transaction
    </div>
  )

  const lines = tx.explanation.split('\n')

  const sections = lines.map(line => {
    if (line.startsWith('[HIGH') || line.startsWith('[MEDIUM') || line.startsWith('[LOW'))
      return { type: 'verdict',  text: line.replace(/\[|\]/g, '') }
    if (line.startsWith('Signals detected:'))
      return { type: 'header',   text: '🔍 What the AI found suspicious:' }
    if (line.trim().startsWith('*'))
      return { type: 'bullet',   text: line.replace(/^\s*\*\s*/, '') }
    if (line.startsWith('Pattern:'))
      return { type: 'pattern',  text: line.replace('Pattern:', '📌 Pattern match:') }
    if (line.startsWith('ML anomaly'))
      return { type: 'ml',       text: line.replace('ML anomaly score:', '🤖 AI statistical analysis:') }
    if (line.startsWith('Amount'))
      return { type: 'amount',   text: '💰 ' + line }
    if (line.includes('No fraud signals'))
      return { type: 'normal',   text: '✅ ' + line }
    if (line.trim() === '')
      return { type: 'spacer',   text: '' }
    return { type: 'normal',     text: line }
  })

  const verdictColors: Record<string, { bg: string; color: string; border: string }> = {
    'HIGH RISK':   { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
    'MEDIUM RISK': { bg: '#fff7ed', color: '#ea580c', border: '#fed7aa' },
    'LOW RISK':    { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  }
  const verdict    = sections.find(s => s.type === 'verdict')
  const verdictKey = Object.keys(verdictColors).find(k => verdict?.text.includes(k)) ?? ''
  const vc         = verdictColors[verdictKey] ?? { bg: 'var(--gray-50)', color: 'var(--gray-700)', border: 'var(--gray-200)' }

  return (
    <div style={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
        🧠 AI Investigation Report
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>

        {verdict && (
          <div style={{ background: vc.bg, border: `1px solid ${vc.border}`, borderRadius: 'var(--radius)', padding: '12px 14px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: vc.color }}>
              {verdict.text.includes('HIGH') ? '🚨 ' : verdict.text.includes('MEDIUM') ? '⚠️ ' : '✅ '}
              {verdict.text}
            </div>
          </div>
        )}

        {sections.filter(s => s.type !== 'verdict').map((s, i) => {
          if (s.type === 'spacer') return <div key={i} style={{ height: 2 }} />
          if (s.type === 'header') return (
            <div key={i} style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-700)', marginTop: 4 }}>
              {s.text}
            </div>
          )
          if (s.type === 'bullet') return (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 12px', background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', alignItems: 'flex-start' }}>
              <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 14, flexShrink: 0, marginTop: 1 }}>›</span>
              <span style={{ fontSize: 12, color: 'var(--gray-700)', lineHeight: 1.6 }}>{s.text}</span>
            </div>
          )
          if (s.type === 'pattern') return (
            <div key={i} style={{ padding: '10px 12px', background: '#fef9ed', border: '1px solid #fde68a', borderRadius: 'var(--radius-sm)', fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>
              {s.text}
            </div>
          )
          if (s.type === 'ml') return (
            <div key={i} style={{ padding: '10px 12px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 'var(--radius-sm)', fontSize: 12, color: '#5b21b6', lineHeight: 1.6 }}>
              {s.text}
            </div>
          )
          if (s.type === 'amount') return (
            <div key={i} style={{ padding: '10px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 'var(--radius-sm)', fontSize: 12, color: '#1e40af', lineHeight: 1.6 }}>
              {s.text}
            </div>
          )
          return (
            <div key={i} style={{ fontSize: 12, color: 'var(--gray-600)', lineHeight: 1.6 }}>
              {s.text}
            </div>
          )
        })}

        <div style={{ marginTop: 8, padding: '10px 12px', background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--gray-400)', lineHeight: 1.6 }}>
          ℹ️ This analysis combines rule-based detection and machine learning. Always apply human judgement before taking account action.
        </div>
      </div>
    </div>
  )
}
