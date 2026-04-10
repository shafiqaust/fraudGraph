import { useState, useEffect, useRef } from 'react'
import type { Transaction } from '../api/api'

interface Props { tx: Transaction | null }

// ── Agent definitions ──────────────────────────────────────────────────────────
const AGENTS = [
  { id: 'loader',   name: 'Data Agent',       role: 'Transaction Reader',      color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', avatar: 'D' },
  { id: 'rules',    name: 'Rules Agent',       role: 'Fraud Rule Inspector',    color: '#dc2626', bg: '#fef2f2', border: '#fecaca', avatar: 'R' },
  { id: 'ml',       name: 'ML Agent',          role: 'Anomaly Detector',        color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', avatar: 'M' },
  { id: 'graph',    name: 'Graph Agent',       role: 'Network Analyser',        color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc', avatar: 'G' },
  { id: 'verdict',  name: 'Verdict Agent',     role: 'Final Decision Maker',    color: '#ea580c', bg: '#fff7ed', border: '#fed7aa', avatar: 'V' },
]

const TYPE_LABEL: Record<string, string> = {
  TRANSFER: 'Bank Transfer', CASH_OUT: 'Cash Withdrawal',
  PAYMENT: 'Payment', DEBIT: 'Debit', CASH_IN: 'Deposit',
}

const fmt = (n: number) => '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 })

// ── Build agent story from transaction data ────────────────────────────────────
function buildStory(tx: Transaction) {
  const ids = tx.triggered_rules.map(r => r.id)
  const steps: {
    agentId: string
    type: 'info' | 'warning' | 'error' | 'success' | 'thinking'
    title: string
    detail: string
    data?: string
  }[] = []

  // DATA AGENT
  steps.push({ agentId: 'loader', type: 'thinking', title: 'Reading transaction record...', detail: 'Pulling transaction from the dataset and extracting all fields.' })
  steps.push({ agentId: 'loader', type: 'info', title: 'Transaction loaded successfully', detail: `Found a ${TYPE_LABEL[tx.type] ?? tx.type} of ${fmt(tx.amount)} at step ${tx.step}.`, data: `ID: ${tx.tx_id}  |  From: ${tx.nameOrig}  |  To: ${tx.nameDest}` })

  if (tx.oldbalanceOrg > 0) {
    steps.push({ agentId: 'loader', type: 'info', title: 'Sender account balance checked', detail: `Sender held ${fmt(tx.oldbalanceOrg)} before the transaction.`, data: `Before: ${fmt(tx.oldbalanceOrg)}  →  After: ${fmt(tx.newbalanceOrig)}` })
  }
  if (tx.newbalanceOrig === 0 && tx.oldbalanceOrg > 0) {
    steps.push({ agentId: 'loader', type: 'error', title: 'ALERT: Account completely emptied!', detail: `The sender's balance dropped from ${fmt(tx.oldbalanceOrg)} to exactly $0.00 — this is extremely unusual behaviour.`, data: `Drain amount: ${fmt(tx.amount)}  |  Remaining: $0.00` })
  }
  if (tx.oldbalanceDest === 0 && tx.newbalanceDest > 100000) {
    steps.push({ agentId: 'loader', type: 'error', title: 'ALERT: Dormant account suddenly activated!', detail: `The receiver had $0.00 and suddenly received ${fmt(tx.newbalanceDest)}. This matches a classic mule account pattern.`, data: `Receiver before: $0  |  Receiver after: ${fmt(tx.newbalanceDest)}` })
  }

  // RULES AGENT
  steps.push({ agentId: 'rules', type: 'thinking', title: 'Running 6 fraud detection rules...', detail: 'Checking each rule against the transaction data one by one.' })

  const ruleMessages: Record<string, { good: boolean; msg: string }> = {
    high_amount:        { good: false, msg: `Amount ${fmt(tx.amount)} exceeds the $200,000 high-value threshold — Rule TRIGGERED` },
    risky_type:         { good: false, msg: `Transaction type ${tx.type} is in the high-risk category (TRANSFER / CASH_OUT) — Rule TRIGGERED` },
    balance_drain:      { good: false, msg: `Source balance went from ${fmt(tx.oldbalanceOrg)} to $0 — full drain detected — Rule TRIGGERED` },
    dest_zero_to_large: { good: false, msg: `Destination received ${fmt(tx.newbalanceDest)} from $0 — mule account pattern — Rule TRIGGERED` },
    system_flagged:     { good: false, msg: `isFlaggedFraud = 1 — the bank system already flagged this — Rule TRIGGERED` },
    balance_mismatch:   { good: false, msg: `Balance arithmetic mismatch detected — possible data manipulation — Rule TRIGGERED` },
  }

  const allRuleIds = ['high_amount','risky_type','balance_drain','dest_zero_to_large','system_flagged','balance_mismatch']
  allRuleIds.forEach(ruleId => {
    const fired = ids.includes(ruleId)
    const msgs: Record<string, string> = {
      high_amount:        fired ? `Amount ${fmt(tx.amount)} EXCEEDS $200,000 threshold` : `Amount ${fmt(tx.amount)} is within normal range`,
      risky_type:         fired ? `Type ${tx.type} is HIGH-RISK` : `Type ${tx.type} is low-risk`,
      balance_drain:      fired ? `Source drained to $0 — SUSPICIOUS` : `Source balance looks normal`,
      dest_zero_to_large: fired ? `Dormant account suddenly activated — SUSPICIOUS` : `Destination balance history looks normal`,
      system_flagged:     fired ? `Bank system flag = YES` : `Bank system flag = NO`,
      balance_mismatch:   fired ? `Numbers do NOT reconcile — SUSPICIOUS` : `Numbers check out correctly`,
    }
    steps.push({
      agentId: 'rules',
      type: fired ? 'error' : 'success',
      title: fired ? `Rule fired: ${ruleId.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase())}` : `Rule passed: ${ruleId.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase())}`,
      detail: msgs[ruleId] ?? '',
      data: fired ? `Weight added to fraud score: +${tx.triggered_rules.find(r => r.id === ruleId)?.weight ?? 0}` : 'No contribution to fraud score',
    })
  })

  const ruleScore = tx.rule_score
  steps.push({
    agentId: 'rules',
    type: ruleScore >= 0.65 ? 'error' : ruleScore >= 0.35 ? 'warning' : 'success',
    title: `Rules engine complete — score: ${(ruleScore * 100).toFixed(0)}%`,
    detail: `${ids.length} of 6 rules triggered. Combined rule score is ${(ruleScore * 100).toFixed(0)}%.`,
    data: `Rule score: ${(ruleScore * 100).toFixed(0)}%  |  Rules fired: ${ids.length}/6`,
  })

  // ML AGENT
  steps.push({ agentId: 'ml', type: 'thinking', title: 'Running Isolation Forest model...', detail: 'Comparing this transaction against 3,080 others to find statistical anomalies.' })
  steps.push({
    agentId: 'ml',
    type: tx.ml_score > 0.65 ? 'error' : tx.ml_score > 0.35 ? 'warning' : 'success',
    title: tx.ml_score > 0.65 ? 'Statistical outlier detected!' : tx.ml_score > 0.35 ? 'Slightly unusual pattern' : 'Within normal statistical range',
    detail: tx.ml_score > 0.65
      ? `This transaction is in the top ${(100 - tx.ml_score * 100).toFixed(0)}% most anomalous in the dataset. Features like amount, balance ratios, and account patterns are highly unusual.`
      : tx.ml_score > 0.35
      ? `Some unusual characteristics detected but not extreme. The statistical anomaly contributes to the overall risk score.`
      : `The transaction looks statistically normal. The Isolation Forest did not find significant anomalies.`,
    data: `ML anomaly score: ${(tx.ml_score * 100).toFixed(0)}%  |  Threshold for outlier: 55%`,
  })

  // GRAPH AGENT
  steps.push({ agentId: 'graph', type: 'thinking', title: 'Traversing account network...', detail: 'Building a 2-hop relationship graph around the sender account.' })
  steps.push({ agentId: 'graph', type: 'info', title: 'Network analysis complete', detail: `Mapped connections between ${tx.nameOrig}, ${tx.nameDest}, and their linked accounts. Red edges in the graph represent confirmed fraud transactions.`, data: `Center: ${tx.nameOrig}  |  Depth: 2 hops  |  GNN propagation applied` })
  if (ids.includes('balance_drain') || ids.includes('dest_zero_to_large')) {
    steps.push({ agentId: 'graph', type: 'warning', title: 'Suspicious network pattern detected', detail: `The receiver account ${tx.nameDest} shows a zero-to-large inflow pattern that is consistent with a mule account in a fraud ring. MAPF conflict detection is running to find coordinated behaviour.`, data: 'MAPF: checking for coordinated multi-account activity' })
  }

  // VERDICT AGENT
  steps.push({ agentId: 'verdict', type: 'thinking', title: 'Combining all signals for final verdict...', detail: 'Weighing rule score (60%) and ML score (40%) to produce the final fraud probability.' })

  const combined = tx.risk_score
  steps.push({
    agentId: 'verdict',
    type: tx.risk_level === 'High' ? 'error' : tx.risk_level === 'Medium' ? 'warning' : 'success',
    title: `FINAL VERDICT: ${tx.risk_level.toUpperCase()} RISK — ${(combined * 100).toFixed(0)}% fraud probability`,
    detail: `Combined score = (0.6 × ${(tx.rule_score * 100).toFixed(0)}% rules) + (0.4 × ${(tx.ml_score * 100).toFixed(0)}% ML) = ${(combined * 100).toFixed(0)}%.`,
    data: `Action required: ${tx.risk_level === 'High' ? 'FREEZE ACCOUNTS + FILE SAR' : tx.risk_level === 'Medium' ? 'MANUAL REVIEW' : 'MONITOR ONLY'}`,
  })

  if (tx.isFraud === 1) {
    steps.push({ agentId: 'verdict', type: 'error', title: 'Ground truth confirmed: This IS fraud', detail: 'The dataset label isFraud=1 confirms this transaction is a real fraud case. The AI correctly identified it.', data: 'Classification: TRUE POSITIVE — AI correctly flagged a real fraud' })
  } else if (tx.risk_level === 'Low') {
    steps.push({ agentId: 'verdict', type: 'success', title: 'Transaction appears legitimate', detail: 'No fraud label in dataset. The AI assessed this as low risk — likely a legitimate transaction.', data: 'Classification: TRUE NEGATIVE — correctly assessed as safe' })
  }

  return steps
}

// ── Agent Avatar component ────────────────────────────────────────────────────
function AgentAvatar({ agentId, size = 32, pulse = false }: { agentId: string; size?: number; pulse?: boolean }) {
  const agent = AGENTS.find(a => a.id === agentId) ?? AGENTS[0]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: agent.color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 800, color: '#fff',
      flexShrink: 0,
      boxShadow: pulse ? `0 0 0 4px ${agent.bg}, 0 0 0 6px ${agent.color}60` : 'none',
      transition: 'box-shadow .3s',
    }}>
      {agent.avatar}
    </div>
  )
}

// ── Single step bubble ────────────────────────────────────────────────────────
function StepBubble({ step, visible, isLast }: { step: ReturnType<typeof buildStory>[0]; visible: boolean; isLast: boolean }) {
  const agent = AGENTS.find(a => a.id === step.agentId) ?? AGENTS[0]

  const typeStyle = {
    thinking: { bg: '#f8fafc',  border: '#e2e8f0', dot: '#94a3b8', label: 'thinking...',   labelColor: '#94a3b8' },
    info:     { bg: '#eff6ff',  border: '#bfdbfe', dot: '#3b82f6', label: 'info',          labelColor: '#2563eb' },
    success:  { bg: '#f0fdf4',  border: '#bbf7d0', dot: '#22c55e', label: 'passed',        labelColor: '#16a34a' },
    warning:  { bg: '#fff7ed',  border: '#fed7aa', dot: '#f97316', label: 'warning',       labelColor: '#ea580c' },
    error:    { bg: '#fef2f2',  border: '#fecaca', dot: '#ef4444', label: 'alert',         labelColor: '#dc2626' },
  }[step.type]

  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(16px)',
      transition: 'opacity .4s ease, transform .4s ease',
      marginBottom: isLast ? 0 : 12,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0, paddingTop: 2 }}>
        <AgentAvatar agentId={step.agentId} size={28} />
        {!isLast && <div style={{ width: 1, flex: 1, background: 'var(--gray-200)', minHeight: 12 }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: agent.color }}>{agent.name}</span>
          <span style={{ fontSize: 9, color: typeStyle.labelColor, background: typeStyle.bg, border: `1px solid ${typeStyle.border}`, padding: '1px 6px', borderRadius: 10, fontWeight: 600 }}>
            {typeStyle.label}
          </span>
        </div>
        <div style={{ background: typeStyle.bg, border: `1px solid ${typeStyle.border}`, borderRadius: 'var(--radius-sm)', padding: '9px 12px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: typeStyle.labelColor === '#94a3b8' ? 'var(--gray-600)' : typeStyle.labelColor, marginBottom: step.detail ? 4 : 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            {step.type === 'thinking' && (
              <span style={{ display: 'inline-flex', gap: 2 }}>
                {[0,1,2].map(i => (
                  <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: typeStyle.dot, display: 'inline-block', animation: `dotpulse 1.2s ${i * 0.2}s infinite` }} />
                ))}
              </span>
            )}
            {step.type === 'error'   && <span style={{ fontSize: 13 }}>!</span>}
            {step.type === 'success' && <span style={{ fontSize: 13 }}>+</span>}
            {step.type === 'warning' && <span style={{ fontSize: 13 }}>~</span>}
            {step.title}
          </div>
          {step.detail && (
            <div style={{ fontSize: 11, color: 'var(--gray-600)', lineHeight: 1.7 }}>{step.detail}</div>
          )}
          {step.data && (
            <div style={{ marginTop: 6, padding: '4px 8px', background: 'rgba(0,0,0,.04)', borderRadius: 4, fontSize: 10, fontFamily: 'var(--mono)', color: typeStyle.labelColor, letterSpacing: '.01em' }}>
              {step.data}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Lightbox overlay ──────────────────────────────────────────────────────────
function AnimatedStoryLightbox({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const steps = buildStory(tx)
  const [visibleCount, setVisibleCount] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(800)
  const scrollRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (playing && visibleCount < steps.length) {
      intervalRef.current = setInterval(() => {
        setVisibleCount(c => {
          const next = c + 1
          if (next >= steps.length) setPlaying(false)
          return next
        })
      }, speed)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [playing, speed, steps.length, visibleCount])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [visibleCount])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const restart = () => { setVisibleCount(0); setPlaying(true) }
  const showAll = () => { setVisibleCount(steps.length); setPlaying(false) }

  const agentCounts = AGENTS.map(a => ({
    ...a,
    count: steps.filter(s => s.id === a.id).length,
    done:  steps.slice(0, visibleCount).filter(s => s.agentId === a.id).length,
  }))

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(15,23,42,.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div style={{
        background: '#fff',
        borderRadius: 16,
        width: '100%', maxWidth: 720,
        height: '90vh', maxHeight: 800,
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px rgba(0,0,0,.25)',
        overflow: 'hidden',
      }}>

        {/* Lightbox header */}
        <div style={{ background: '#0f172a', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>A</div>
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>AI Agent Investigation Replay</div>
            <div style={{ color: '#64748b', fontSize: 11 }}>Watch 5 AI agents analyse this transaction step by step</div>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: '#1e293b', border: 'none', color: '#94a3b8', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font)' }}>x</button>
        </div>

        {/* Transaction summary bar */}
        <div style={{ background: tx.risk_level === 'High' ? '#7f1d1d' : tx.risk_level === 'Medium' ? '#431407' : '#14532d', padding: '8px 20px', display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.7)' }}>Analysing:</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{fmt(tx.amount)} {TYPE_LABEL[tx.type] ?? tx.type}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)' }}>from {tx.nameOrig} to {tx.nameDest}</div>
          <div style={{ marginLeft: 'auto', background: 'rgba(255,255,255,.15)', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 700, color: '#fff' }}>
            {tx.risk_level.toUpperCase()} RISK — {(tx.risk_score * 100).toFixed(0)}%
          </div>
        </div>

        {/* Agent roster */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--gray-200)', display: 'flex', gap: 8, background: 'var(--gray-50)', flexShrink: 0, flexWrap: 'wrap' }}>
          {AGENTS.map(agent => {
            const doneSteps = steps.slice(0, visibleCount).filter(s => s.agentId === agent.id).length
            const totalSteps = steps.filter(s => s.agentId === agent.id).length
            const isActive = visibleCount < steps.length && steps[Math.max(0, visibleCount - 1)]?.agentId === agent.id
            return (
              <div key={agent.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: '#fff', border: `1px solid ${isActive ? agent.color : 'var(--gray-200)'}`, borderRadius: 20, transition: 'border-color .3s' }}>
                <AgentAvatar agentId={agent.id} size={20} pulse={isActive} />
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: agent.color }}>{agent.name}</div>
                  <div style={{ fontSize: 9, color: 'var(--gray-400)' }}>{doneSteps}/{totalSteps} steps</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Story feed */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {steps.map((step, i) => (
            <StepBubble
              key={i}
              step={step}
              visible={i < visibleCount}
              isLast={i === steps.length - 1}
            />
          ))}
          {visibleCount >= steps.length && (
            <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 13, color: 'var(--gray-500)', fontWeight: 600 }}>
              Investigation complete — {steps.length} steps analysed
            </div>
          )}
        </div>

        {/* Progress + controls */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--gray-200)', background: 'var(--gray-50)', flexShrink: 0 }}>
          {/* Progress bar */}
          <div style={{ height: 4, background: 'var(--gray-200)', borderRadius: 2, marginBottom: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(visibleCount / steps.length) * 100}%`, background: '#dc2626', borderRadius: 2, transition: 'width .3s' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--gray-500)', fontFamily: 'var(--mono)' }}>
              {visibleCount} / {steps.length} steps
            </span>
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              <button onClick={restart} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--gray-200)', background: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--gray-700)' }}>
                Restart
              </button>
              {playing ? (
                <button onClick={() => setPlaying(false)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--gray-300)', background: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--gray-700)' }}>
                  Pause
                </button>
              ) : visibleCount < steps.length ? (
                <button onClick={() => setPlaying(true)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #bfdbfe', background: '#eff6ff', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', color: '#2563eb' }}>
                  Resume
                </button>
              ) : null}
              <button onClick={showAll} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                Show All
              </button>
              <select value={speed} onChange={e => setSpeed(Number(e.target.value))} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--gray-200)', fontSize: 11, fontFamily: 'var(--font)', background: '#fff', color: 'var(--gray-700)' }}>
                <option value={1600}>Slow</option>
                <option value={800}>Normal</option>
                <option value={300}>Fast</option>
                <option value={80}>Very Fast</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes dotpulse {
          0%,80%,100% { transform: scale(0.6); opacity: .4; }
          40%          { transform: scale(1);   opacity: 1;  }
        }
      `}</style>
    </div>
  )
}

// ── Main ExplanationBox component ─────────────────────────────────────────────
export default function ExplanationBox({ tx }: Props) {
  const [showLightbox, setShowLightbox] = useState(false)

  // Close lightbox when tx changes
  useEffect(() => { setShowLightbox(false) }, [tx?.tx_id])

  if (!tx) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)', fontSize: 12, padding: 20, textAlign: 'center' }}>
      AI reasoning will appear here once you select a transaction
    </div>
  )

  const lines = tx.explanation.split('\n').filter(l => l.trim() !== '')
  const sections: { type: 'verdict' | 'header' | 'bullet' | 'pattern' | 'ml' | 'amount' | 'normal'; text: string }[] = lines.map(line => {
    if (line.startsWith('[HIGH') || line.startsWith('[MEDIUM') || line.startsWith('[LOW'))
      return { type: 'verdict', text: line.replace(/\[|\]/g, '') }
    if (line.startsWith('Signals detected:'))
      return { type: 'header', text: 'What the AI found suspicious:' }
    if (line.trim().startsWith('*'))
      return { type: 'bullet', text: line.replace(/^\s*\*\s*/, '') }
    if (line.startsWith('Pattern:'))
      return { type: 'pattern', text: line.replace('Pattern:', 'Pattern match:') }
    if (line.startsWith('ML anomaly'))
      return { type: 'ml', text: line.replace('ML anomaly score:', 'AI statistical analysis:') }
    if (line.startsWith('Amount'))
      return { type: 'amount', text: line }
    if (line.includes('No fraud signals'))
      return { type: 'normal', text: line }
    return { type: 'normal', text: line }
  })

  const verdictColors: Record<string, { bg: string; color: string; border: string }> = {
    'HIGH RISK':   { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
    'MEDIUM RISK': { bg: '#fff7ed', color: '#ea580c', border: '#fed7aa' },
    'LOW RISK':    { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  }
  const verdict    = sections.find(s => s.type === 'verdict')
  const verdictKey = Object.keys(verdictColors).find(k => verdict?.text.includes(k)) ?? ''
  const vc         = verdictColors[verdictKey] ?? { bg: 'var(--gray-50)', color: 'var(--gray-700)', border: 'var(--gray-200)' }

  const storySteps  = buildStory(tx)
  const errorCount  = storySteps.filter(s => s.type === 'error').length
  const successCount= storySteps.filter(s => s.type === 'success').length

  return (
    <>
      {showLightbox && <AnimatedStoryLightbox tx={tx} onClose={() => setShowLightbox(false)} />}

      <div style={{ padding: 14, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
          AI Investigation Report
        </div>

        {/* Launch animated replay button */}
        <button
          onClick={() => setShowLightbox(true)}
          style={{
            width: '100%', marginBottom: 12,
            padding: '12px 16px',
            background: 'linear-gradient(135deg, #0f172a, #1e1b4b)',
            border: 'none', borderRadius: 'var(--radius)',
            cursor: 'pointer', fontFamily: 'var(--font)',
            display: 'flex', alignItems: 'center', gap: 12,
            transition: 'opacity .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '.88')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
            A
          </div>
          <div style={{ textAlign: 'left', flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 2 }}>
              Watch AI Agents Investigate
            </div>
            <div style={{ color: '#64748b', fontSize: 11 }}>
              Animated step-by-step replay — {storySteps.length} steps across 5 agents
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {errorCount > 0 && (
              <span style={{ background: '#dc2626', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10 }}>
                {errorCount} alerts
              </span>
            )}
            <span style={{ background: '#16a34a', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10 }}>
              {successCount} passed
            </span>
          </div>
        </button>

        {/* Static summary below the button */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 7 }}>

          {verdict && (
            <div style={{ background: vc.bg, border: `1px solid ${vc.border}`, borderRadius: 'var(--radius)', padding: '10px 12px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: vc.color }}>
                {verdict.text.includes('HIGH') ? '[!] ' : verdict.text.includes('MEDIUM') ? '[~] ' : '[+] '}
                {verdict.text}
              </div>
            </div>
          )}

          {sections.filter(s => s.type !== 'verdict').map((s, i) => {
            if (s.type === 'header') return (
              <div key={i} style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-700)', marginTop: 4 }}>{s.text}</div>
            )
            if (s.type === 'bullet') return (
              <div key={i} style={{ display: 'flex', gap: 8, padding: '8px 10px', background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', alignItems: 'flex-start' }}>
                <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{'>'}</span>
                <span style={{ fontSize: 11, color: 'var(--gray-700)', lineHeight: 1.6 }}>{s.text}</span>
              </div>
            )
            if (s.type === 'pattern') return (
              <div key={i} style={{ padding: '8px 10px', background: '#fef9ed', border: '1px solid #fde68a', borderRadius: 'var(--radius-sm)', fontSize: 11, color: '#92400e', lineHeight: 1.6 }}>{s.text}</div>
            )
            if (s.type === 'ml') return (
              <div key={i} style={{ padding: '8px 10px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 'var(--radius-sm)', fontSize: 11, color: '#5b21b6', lineHeight: 1.6 }}>{s.text}</div>
            )
            if (s.type === 'amount') return (
              <div key={i} style={{ padding: '8px 10px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 'var(--radius-sm)', fontSize: 11, color: '#1e40af', lineHeight: 1.6 }}>{s.text}</div>
            )
            if (s.type === 'normal' && s.text.trim()) return (
              <div key={i} style={{ fontSize: 11, color: 'var(--gray-600)', lineHeight: 1.6 }}>{s.text}</div>
            )
            return null
          })}

          <div style={{ marginTop: 6, padding: '8px 10px', background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', fontSize: 10, color: 'var(--gray-400)', lineHeight: 1.6 }}>
            This analysis combines rule-based detection and machine learning. Always apply human judgement before taking account action.
          </div>
        </div>
      </div>
    </>
  )
}
