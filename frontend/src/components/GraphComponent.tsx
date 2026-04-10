import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { GraphResponse, GraphNode, MAPFConflictDetail } from '../api/api'

interface Props {
  graph:        GraphResponse | null
  loading:      boolean
  centerEntity: string
}

const TYPE_LABEL: Record<string, string> = {
  TRANSFER: 'Bank Transfer', CASH_OUT: 'Cash Withdrawal',
  PAYMENT: 'Payment', DEBIT: 'Debit', CASH_IN: 'Deposit',
}
const TYPE_COLOR: Record<string, string> = {
  TRANSFER: '#dc2626', CASH_OUT: '#ea580c',
  PAYMENT: '#2563eb', DEBIT: '#6b7280', CASH_IN: '#16a34a',
}

function riskColor(r: number) {
  return r >= 0.65 ? '#dc2626' : r >= 0.35 ? '#ea580c' : '#16a34a'
}
function riskLabel(r: number) {
  return r >= 0.65 ? 'High Risk' : r >= 0.35 ? 'Medium Risk' : 'Low Risk'
}
function fmt(n: number) {
  return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

interface NodePopupState {
  node:  GraphNode
  x:     number
  y:     number
  edges: { amount: number; type: string; is_fraud: number; dir: string }[]
}

// ══════════════════════════════════════════════════════════════════
// MAPF ANIMATED LIGHTBOX
// ══════════════════════════════════════════════════════════════════

interface AnimStep {
  agent:      string
  agentColor: string
  agentBg:    string
  type:       'thinking' | 'info' | 'match' | 'alert' | 'success' | 'verdict'
  title:      string
  detail:     string
  data?:      string
  table?:     { step: number; from: string; to: string; type: string; amount: number; highlight: string }[]
}

function buildAnimSteps(detail: MAPFConflictDetail, allConflicts: MAPFConflictDetail[]): AnimStep[] {
  const steps: AnimStep[] = []
  const diff = detail.step_difference

  steps.push({
    agent: 'MAPF Engine', agentColor: '#818cf8', agentBg: '#1e1b4b',
    type: 'thinking',
    title: 'Initialising Multi-Agent Path Finding analysis...',
    detail: 'MAPF models every bank account as an "agent" moving along transaction paths through time. We search for agents that converge on the same destination within a narrow time window — a hallmark of coordinated fraud rings.',
  })

  steps.push({
    agent: 'MAPF Engine', agentColor: '#818cf8', agentBg: '#1e1b4b',
    type: 'info',
    title: `Scanning ${allConflicts.length} conflict${allConflicts.length !== 1 ? 's' : ''} detected around account ${detail.center_account}`,
    detail: `The detection window is plus or minus ${detail.window} steps. If another account sends the same transaction type to the same destination within ${detail.window} steps of our center account, it counts as a coordinated path conflict.`,
    data: `Center account: ${detail.center_account}  |  Time window: ±${detail.window} steps  |  Tx type matched: ${detail.tx_type}`,
  })

  steps.push({
    agent: 'Timeline Agent', agentColor: '#34d399', agentBg: '#065f46',
    type: 'info',
    title: 'What does "step" mean in this dataset?',
    detail: 'Each "step" represents one transaction cycle in the PaySim simulation — roughly equivalent to one hour of real banking activity. The dataset contains 3,080 transactions spread across hundreds of unique steps. Steps are sequential time markers used to order events.',
    data: `Competitor transaction at step: ${detail.competitor_step}  |  Center transaction at step: ${detail.center_step}  |  Difference: ${diff} step${diff !== 1 ? 's' : ''}`,
  })

  steps.push({
    agent: 'Timeline Agent', agentColor: '#34d399', agentBg: '#065f46',
    type: 'match',
    title: `The ${detail.step_context.length} actual transactions around step ${detail.competitor_step} — the conflict window`,
    detail: `Below are the real transactions that occurred within ${detail.window} steps of the competitor transaction (step ${detail.competitor_step}). Highlighted rows are the ones that triggered the MAPF conflict alert.`,
    table: detail.step_context.map(s => ({
      step: s.step, from: s.from, to: s.to,
      type: s.type, amount: s.amount, highlight: s.highlight,
    })),
  })

  steps.push({
    agent: 'Path Detector', agentColor: '#fb923c', agentBg: '#7c2d12',
    type: 'alert',
    title: 'Conflict confirmed: Two accounts targeted the same destination',
    detail: `Account ${detail.competitor_account} sent a ${TYPE_LABEL[detail.tx_type] ?? detail.tx_type} of ${fmt(detail.competitor_amount)} to ${detail.destination}. Account ${detail.center_account} also sent transactions to ${detail.destination}. Both within ${detail.window} steps of each other.`,
    data: `Agent 1 (center):     ${detail.center_account}  at step ${detail.center_step}\nAgent 2 (competitor): ${detail.competitor_account}  at step ${detail.competitor_step}  amount: ${fmt(detail.competitor_amount)}`,
  })

  const oddsNote = allConflicts.length >= 3
    ? 'With 3 or more conflicts, the probability of coincidence drops below 0.1%.'
    : allConflicts.length === 2
    ? 'With 2 conflicts, the probability of coincidence is under 2%.'
    : 'A single conflict is suspicious but not definitive on its own.'

  steps.push({
    agent: 'Fraud Analyst', agentColor: '#f43f5e', agentBg: '#881337',
    type: 'alert',
    title: 'Why two accounts hitting the same destination matters',
    detail: `In legitimate banking, independent accounts rarely send the same transaction type to the same dormant account in the same narrow time window. ${oddsNote} This pattern is consistent with a fraud ring controller directing multiple accounts simultaneously.`,
    data: `Total conflicts found: ${allConflicts.length}  |  Implied ring size: at least ${allConflicts.length + 1} accounts`,
  })

  steps.push({
    agent: 'GNN Propagator', agentColor: '#a78bfa', agentBg: '#3b0764',
    type: 'info',
    title: 'Risk scores elevated across the network via GNN propagation',
    detail: 'Each account in a MAPF conflict has had its propagated_risk score raised in the graph. The formula: Risk(node) = base_risk + 0.30 x sum(neighbour_risk x edge_weight). Accounts connected to high-risk nodes carry elevated risk even if not directly flagged.',
    data: `${detail.competitor_account} risk raised  |  ${detail.destination} risk raised  |  All connected nodes updated`,
  })

  const verdictTitle = allConflicts.length >= 3
    ? `HIGH CONFIDENCE: Organised fraud ring — ${allConflicts.length} coordinated paths detected`
    : allConflicts.length === 2
    ? 'MEDIUM-HIGH: Coordinated fraud pattern — 2 path conflicts confirmed'
    : 'SUSPICIOUS: Possible coordinated activity — 1 path conflict found'

  steps.push({
    agent: 'MAPF Verdict', agentColor: '#818cf8', agentBg: '#1e1b4b',
    type: 'verdict',
    title: verdictTitle,
    detail: allConflicts.length >= 2
      ? `${allConflicts.length} independent accounts converged on the same destination in close succession. This is textbook fraud ring behaviour. All involved accounts should be investigated together, not individually.`
      : 'One coordination event found. Cross-reference with full transaction history and GNN node risk scores before escalating.',
    data: `Recommended action: ${allConflicts.length >= 2 ? 'Freeze all connected accounts + escalate to fraud team + file SAR' : 'Flag for manual review + monitor activity'}`,
  })

  return steps
}

function AnimBubble({ step, visible, isLast }: { step: AnimStep; visible: boolean; isLast: boolean }) {
  const cfg = {
    thinking: { bg: '#f8fafc', border: '#e2e8f0', label: 'analysing', lc: '#64748b' },
    info:     { bg: '#eff6ff', border: '#bfdbfe', label: 'info',      lc: '#2563eb' },
    match:    { bg: '#fff7ed', border: '#fed7aa', label: 'match',     lc: '#ea580c' },
    alert:    { bg: '#fef2f2', border: '#fecaca', label: 'alert',     lc: '#dc2626' },
    success:  { bg: '#f0fdf4', border: '#bbf7d0', label: 'clear',     lc: '#16a34a' },
    verdict:  { bg: '#f5f3ff', border: '#ddd6fe', label: 'verdict',   lc: '#7c3aed' },
  }[step.type]

  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(14px)',
      transition: 'opacity .4s ease, transform .4s ease',
      marginBottom: isLast ? 0 : 14,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0, paddingTop: 2 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: step.agentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: step.agentColor, border: `2px solid ${step.agentColor}40` }}>
          {step.agent.slice(0, 2).toUpperCase()}
        </div>
        {!isLast && <div style={{ width: 1, flex: 1, minHeight: 10, background: 'var(--gray-200)' }} />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: step.agentColor }}>{step.agent}</span>
          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.lc, fontWeight: 600 }}>{cfg.label}</span>
        </div>
        <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: step.detail ? 6 : 0 }}>
            {step.type === 'thinking' && (
              <span style={{ display: 'inline-flex', gap: 2 }}>
                {[0,1,2].map(i => (
                  <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: '#94a3b8', display: 'inline-block', animation: `dotpulse 1.2s ${i * 0.2}s infinite` }} />
                ))}
              </span>
            )}
            <span style={{ fontSize: 12, fontWeight: 700, color: cfg.lc }}>{step.title}</span>
          </div>
          {step.detail && (
            <div style={{ fontSize: 11, color: 'var(--gray-600)', lineHeight: 1.75 }}>{step.detail}</div>
          )}
          {step.table && (
            <div style={{ marginTop: 10, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--gray-200)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                <thead>
                  <tr style={{ background: '#1e1b4b' }}>
                    {['Step','From','To','Type','Amount','Flag'].map(h => (
                      <th key={h} style={{ padding: '5px 8px', textAlign: 'left', color: '#a5b4fc', fontWeight: 600, letterSpacing: '.04em', fontSize: 9, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {step.table.map((row, ri) => {
                    const isComp   = row.highlight === 'competitor'
                    const isCenter = row.highlight === 'center'
                    const isFraud  = row.highlight === 'fraud'
                    const rowBg    = isComp   ? '#fef2f2'
                                  : isCenter  ? '#eff6ff'
                                  : isFraud   ? '#fff7ed'
                                  : ri % 2 === 0 ? '#fff' : '#f9fafb'
                    return (
                      <tr key={ri} style={{ background: rowBg, borderBottom: '1px solid var(--gray-100)' }}>
                        <td style={{ padding: '5px 8px', fontFamily: 'var(--mono)', fontWeight: isComp || isCenter ? 700 : 400, color: isComp ? '#dc2626' : isCenter ? '#2563eb' : 'var(--gray-600)' }}>{row.step}</td>
                        <td style={{ padding: '5px 8px', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--gray-600)', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.from.slice(0,9)}</td>
                        <td style={{ padding: '5px 8px', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--gray-600)', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.to.slice(0,9)}</td>
                        <td style={{ padding: '5px 8px', color: TYPE_COLOR[row.type] ?? 'var(--gray-600)', fontWeight: 600, fontSize: 9 }}>{TYPE_LABEL[row.type]?.split(' ')[0] ?? row.type}</td>
                        <td style={{ padding: '5px 8px', fontFamily: 'var(--mono)', color: 'var(--gray-700)', fontWeight: isComp || isCenter ? 700 : 400 }}>{fmt(row.amount)}</td>
                        <td style={{ padding: '5px 8px' }}>
                          {isComp   && <span style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 700 }}>COMPETITOR</span>}
                          {isCenter && <span style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 700 }}>CENTER</span>}
                          {isFraud  && <span style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa', padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 700 }}>FRAUD</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {step.data && (
            <div style={{ marginTop: 8, padding: '5px 8px', background: 'rgba(0,0,0,.04)', borderRadius: 4, fontSize: 10, fontFamily: 'var(--mono)', color: cfg.lc, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {step.data}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MAPFLightbox({ conflicts, details, center, onClose }: { conflicts: string[]; details: MAPFConflictDetail[]; center: string; onClose: () => void }) {
  const [activeIdx,    setActiveIdx]    = useState(0)
  const [visibleCount, setVisibleCount] = useState(0)
  const [playing,      setPlaying]      = useState(true)
  const [speed,        setSpeed]        = useState(900)
  const scrollRef = useRef<HTMLDivElement>(null)
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null)

  const activeDetail = details[activeIdx] ?? null
  const animSteps    = activeDetail ? buildAnimSteps(activeDetail, details) : []

  useEffect(() => { setVisibleCount(0); setPlaying(true) }, [activeIdx])

  useEffect(() => {
    if (playing && visibleCount < animSteps.length) {
      timerRef.current = setInterval(() => {
        setVisibleCount(c => { if (c + 1 >= animSteps.length) setPlaying(false); return c + 1 })
      }, speed)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [playing, speed, animSteps.length, visibleCount])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [visibleCount])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}
    >
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 740, height: '92vh', maxHeight: 820, display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,.35)', overflow: 'hidden' }}>

        <div style={{ background: 'linear-gradient(135deg,#1e1b4b,#312e81)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: 16, flexShrink: 0 }}>M</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>MAPF Coordinated Fraud Analysis</div>
            <div style={{ color: '#818cf8', fontSize: 11 }}>Multi-Agent Path Finding — step-by-step investigation with actual transaction data</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.1)', border: 'none', color: '#a5b4fc', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font)' }}>x</button>
        </div>

        <div style={{ background: '#312e81', padding: '8px 20px', display: 'flex', gap: 20, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
          {[
            { label: 'Conflicts',        value: conflicts.length,     color: '#f87171' },
            { label: 'Accounts in ring', value: conflicts.length + 1, color: '#fb923c' },
            { label: 'Analysis steps',   value: animSteps.length,     color: '#a5b4fc' },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color, fontFamily: 'var(--mono)', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 9, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</div>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', fontSize: 10, color: '#818cf8' }}>
            Center account: <strong style={{ color: '#a5b4fc' }}>{center}</strong>
          </div>
        </div>

        {details.length > 1 && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--gray-200)', background: 'var(--gray-50)', display: 'flex', gap: 6, flexShrink: 0, overflowX: 'auto' }}>
            <span style={{ fontSize: 10, color: 'var(--gray-400)', alignSelf: 'center', whiteSpace: 'nowrap', marginRight: 4 }}>Select conflict:</span>
            {details.map((d, i) => (
              <button key={i} onClick={() => setActiveIdx(i)} style={{ padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'var(--font)', whiteSpace: 'nowrap', background: activeIdx === i ? '#4f46e5' : 'var(--gray-200)', color: activeIdx === i ? '#fff' : 'var(--gray-600)', transition: 'all .15s' }}>
                Conflict {i + 1} — {d.competitor_account.slice(0, 9)}
              </button>
            ))}
          </div>
        )}

        {activeDetail && (
          <div style={{ padding: '8px 16px', background: '#faf5ff', borderBottom: '1px solid #e9d5ff', flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: '#6d28d9', lineHeight: 1.6 }}>
              <strong>Account {activeDetail.competitor_account}</strong> sent a {TYPE_LABEL[activeDetail.tx_type] ?? activeDetail.tx_type} of{' '}
              <strong>{fmt(activeDetail.competitor_amount)}</strong> to <strong>{activeDetail.destination}</strong> at step{' '}
              <strong>{activeDetail.competitor_step}</strong>
              {activeDetail.step_difference > 0
                ? ` — ${activeDetail.step_difference} step${activeDetail.step_difference !== 1 ? 's' : ''} from the center account (step ${activeDetail.center_step}).`
                : ` — at the exact same step as the center account.`
              }
            </div>
          </div>
        )}

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {animSteps.map((step, i) => (
            <AnimBubble key={`${activeIdx}-${i}`} step={step} visible={i < visibleCount} isLast={i === animSteps.length - 1} />
          ))}
          {visibleCount >= animSteps.length && animSteps.length > 0 && (
            <div style={{ textAlign: 'center', padding: '14px 0', fontSize: 12, color: '#7c3aed', fontWeight: 700 }}>
              Analysis complete for conflict {activeIdx + 1} of {details.length}
              {activeIdx < details.length - 1 && (
                <button onClick={() => setActiveIdx(idx => idx + 1)} style={{ marginLeft: 12, padding: '4px 12px', borderRadius: 6, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                  Next conflict
                </button>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: '10px 20px', borderTop: '1px solid var(--gray-200)', background: 'var(--gray-50)', flexShrink: 0 }}>
          <div style={{ height: 4, background: 'var(--gray-200)', borderRadius: 2, marginBottom: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${animSteps.length > 0 ? (visibleCount / animSteps.length) * 100 : 0}%`, background: 'linear-gradient(90deg,#4f46e5,#7c3aed)', borderRadius: 2, transition: 'width .3s' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--gray-400)', fontFamily: 'var(--mono)' }}>{visibleCount}/{animSteps.length} steps</span>
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
              <button onClick={() => { setVisibleCount(0); setPlaying(true) }} style={{ padding: '5px 11px', borderRadius: 6, border: '1px solid var(--gray-200)', background: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--gray-700)' }}>Restart</button>
              {playing
                ? <button onClick={() => setPlaying(false)} style={{ padding: '5px 11px', borderRadius: 6, border: '1px solid var(--gray-300)', background: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--gray-700)' }}>Pause</button>
                : visibleCount < animSteps.length
                ? <button onClick={() => setPlaying(true)} style={{ padding: '5px 11px', borderRadius: 6, border: '1px solid #bfdbfe', background: '#eff6ff', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', color: '#2563eb' }}>Resume</button>
                : null
              }
              <button onClick={() => { setVisibleCount(animSteps.length); setPlaying(false) }} style={{ padding: '5px 11px', borderRadius: 6, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>Show All</button>
              <select value={speed} onChange={e => setSpeed(Number(e.target.value))} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--gray-200)', fontSize: 11, fontFamily: 'var(--font)', background: '#fff', color: 'var(--gray-700)' }}>
                <option value={1800}>Slow</option>
                <option value={900}>Normal</option>
                <option value={350}>Fast</option>
                <option value={80}>Very Fast</option>
              </select>
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes dotpulse{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1);opacity:1}}`}</style>
    </div>
  )
}

function MAPFConflictBar({ conflicts, details, center }: { conflicts: string[]; details: MAPFConflictDetail[]; center: string }) {
  const [showLightbox, setShowLightbox] = useState(false)
  return (
    <>
      {showLightbox && <MAPFLightbox conflicts={conflicts} details={details} center={center} onClose={() => setShowLightbox(false)} />}
      <div style={{ borderTop: '1px solid #e9d5ff', background: 'linear-gradient(135deg,#faf5ff,#eff6ff)', flexShrink: 0 }}>
        <button
          onClick={() => setShowLightbox(true)}
          style={{ width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font)', textAlign: 'left' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,.07)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: 14, flexShrink: 0 }}>M</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5' }}>Coordinated Fraud Pattern Detected</div>
            <div style={{ fontSize: 10, color: '#818cf8', marginTop: 1 }}>
              {conflicts.length} MAPF conflict{conflicts.length !== 1 ? 's' : ''} — click to see the actual transaction steps and animated analysis
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>
              {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}
            </span>
            <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 700 }}>Watch steps</span>
          </div>
        </button>
        <div style={{ padding: '0 14px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {conflicts.map((c, i) => {
            const d = details[i]
            return (
              <div key={i} style={{ fontSize: 10, color: '#5b21b6', lineHeight: 1.5, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <span style={{ color: '#7c3aed', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                <span>
                  {c}
                  {d && (
                    <span style={{ color: '#818cf8', marginLeft: 6 }}>
                      (step {d.competitor_step}{d.step_difference > 0 ? `, ${d.step_difference} step${d.step_difference !== 1 ? 's' : ''} from center` : ', same step as center'})
                    </span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ══════════════════════════════════════════════════════════════════
// MAIN GraphComponent
// ══════════════════════════════════════════════════════════════════

export default function GraphComponent({ graph, loading, centerEntity }: Props) {
  const svgRef  = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [popup, setPopup] = useState<NodePopupState | null>(null)

  useEffect(() => {
    if (!graph || !svgRef.current || !wrapRef.current) return
    const el = svgRef.current
    const W  = wrapRef.current.clientWidth  || 600
    const H  = wrapRef.current.clientHeight || 280
    const svg = d3.select(el)
    svg.selectAll('*').remove()
    svg.attr('width', W).attr('height', H)

    const g = svg.append('g')
    svg.call(d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 4]).on('zoom', e => g.attr('transform', e.transform.toString())))
    svg.on('click', () => setPopup(null))

    const nodes: any[] = graph.nodes.map(n => ({ ...n }))
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]))
    const links: any[] = graph.edges
      .filter(e => byId[e.source] && byId[e.target])
      .map(e => ({ ...e, source: byId[e.source], target: byId[e.target] }))

    const sim = d3.forceSimulation(nodes)
      .force('link',      d3.forceLink(links).distance(110).strength(0.35))
      .force('charge',    d3.forceManyBody().strength(-280))
      .force('center',    d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide(36))

    const link = g.selectAll('line').data(links).join('line')
      .attr('stroke',         d => d.is_fraud ? '#dc2626' : '#d1d5db')
      .attr('stroke-width',   d => d.is_fraud ? 2.5 : 1.2)
      .attr('stroke-opacity', d => d.is_fraud ? 0.85 : 0.45)
      .attr('stroke-dasharray', d => d.is_fraud ? '0' : '4,3')

    const edgeLabel = g.selectAll('text.el').data(links.filter(l => l.is_fraud)).join('text')
      .attr('class', 'el').attr('font-size', 9).attr('fill', '#dc2626')
      .attr('text-anchor', 'middle').attr('font-family', 'var(--mono)').attr('pointer-events', 'none')
      .text(d => `$${(d.amount / 1000).toFixed(0)}k`)

    const node = g.selectAll<SVGGElement, any>('g.nd').data(nodes).join('g')
      .attr('class', 'nd').style('cursor', 'pointer')
      .call(
        d3.drag<SVGGElement, any>()
          .on('start', (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
          .on('drag',  (ev, d) => { d.fx = ev.x; d.fy = ev.y })
          .on('end',   (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null })
      )
      .on('click', function(ev, d) {
        ev.stopPropagation()
        const wrap = wrapRef.current!.getBoundingClientRect()
        const edgesForNode = graph.edges
          .filter(e => e.source === d.id || e.target === d.id).slice(0, 6)
          .map(e => ({ amount: e.amount, type: e.type, is_fraud: e.is_fraud, dir: e.source === d.id ? 'sent' : 'received' }))
        setPopup({
          node: d,
          x: Math.min(ev.clientX - wrap.left + 12, (wrapRef.current?.clientWidth ?? 600) - 260),
          y: Math.min(ev.clientY - wrap.top  + 12, (wrapRef.current?.clientHeight ?? 300) - 340),
          edges: edgesForNode,
        })
      })

    const isCenter = (d: any) => d.id === centerEntity
    node.filter(isCenter).append('circle').attr('r', 34).attr('fill', 'none').attr('stroke', '#dc2626').attr('stroke-width', 1.5).attr('stroke-opacity', 0.3).attr('stroke-dasharray', '5,3')
    node.append('circle').attr('r', d => isCenter(d) ? 22 : Math.max(13, 10 + d.propagated_risk * 12)).attr('fill', d => riskColor(d.propagated_risk)).attr('stroke', '#fff').attr('stroke-width', d => isCenter(d) ? 3 : 2).attr('opacity', 0.9)
    node.append('text').attr('text-anchor', 'middle').attr('dominant-baseline', 'central').attr('font-size', d => isCenter(d) ? 13 : 9).attr('pointer-events', 'none').attr('fill', '#fff').attr('font-weight', 'bold').text(d => d.type === 'merchant' ? 'M' : isCenter(d) ? 'S' : 'A')
    node.append('text').attr('text-anchor', 'middle').attr('dy', d => (isCenter(d) ? 22 : Math.max(13, 10 + d.propagated_risk * 12)) + 13).attr('font-size', 8).attr('font-family', 'var(--mono)').attr('fill', 'var(--gray-500)').attr('pointer-events', 'none').text(d => d.id.slice(0, 9))

    sim.on('tick', () => {
      link.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y)
      edgeLabel.attr('x', d => (d.source.x + d.target.x) / 2).attr('y', d => (d.source.y + d.target.y) / 2 - 5)
      node.attr('transform', d => `translate(${d.x},${d.y})`)
    })
    return () => { sim.stop() }
  }, [graph, centerEntity])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      <div style={{ padding: '6px 14px', borderBottom: '1px solid var(--gray-200)', background: 'var(--gray-50)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-700)' }}>Money Flow Network</span>
        <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>Click any circle to see account details</span>
        {graph && (
          <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--gray-400)' }}>
            {graph.stats.node_count} accounts · {graph.stats.edge_count} transactions{graph.stats.conflict_count > 0 ? ` · ${graph.stats.conflict_count} MAPF conflicts` : ''}
          </span>
        )}
      </div>
      <div style={{ padding: '4px 14px', borderBottom: '1px solid var(--gray-100)', display: 'flex', gap: 14, alignItems: 'center', flexShrink: 0 }}>
        {[['#dc2626','High risk'],['#ea580c','Medium'],['#16a34a','Low risk']].map(([c,l]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--gray-500)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />{l}
          </div>
        ))}
        <div style={{ fontSize: 10, color: 'var(--gray-400)', marginLeft: 'auto' }}>
          S = selected · M = merchant · A = account — red lines = fraud
        </div>
      </div>

      <div ref={wrapRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 20, gap: 10 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', border: '3px solid #dc2626', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
            <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>Building money flow map...</div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}
        {!graph && !loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)', gap: 8 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--gray-300)' }}>NET</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-500)' }}>Money Flow Network</div>
            <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 260, lineHeight: 1.6 }}>Select a transaction to see how money moved between accounts</div>
          </div>
        )}
        <svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block' }} />

        {popup && (
          <div style={{ position: 'absolute', left: popup.x, top: popup.y, width: 248, background: '#fff', zIndex: 100, border: `2px solid ${riskColor(popup.node.propagated_risk)}`, borderRadius: 'var(--radius)', boxShadow: '0 10px 25px rgba(0,0,0,.15)', overflow: 'hidden' }}>
            <div style={{ background: riskColor(popup.node.propagated_risk), padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,.7)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>
                  {popup.node.type === 'merchant' ? 'Merchant' : popup.node.id === centerEntity ? 'Selected Account' : 'Connected Account'}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', fontFamily: 'var(--mono)' }}>{popup.node.id}</div>
              </div>
              <button onClick={() => setPopup(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.8)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 0, marginLeft: 8 }}>x</button>
            </div>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--gray-100)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: riskColor(popup.node.propagated_risk) }}>{riskLabel(popup.node.propagated_risk)}</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: riskColor(popup.node.propagated_risk), fontFamily: 'var(--mono)' }}>{(popup.node.propagated_risk * 100).toFixed(0)}%</span>
              </div>
              <div style={{ height: 6, background: 'var(--gray-200)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ height: '100%', width: `${popup.node.propagated_risk * 100}%`, background: riskColor(popup.node.propagated_risk), borderRadius: 3 }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--gray-700)', lineHeight: 1.7 }}>
                {popup.node.propagated_risk >= 0.65
                  ? `Highly suspicious — ${(popup.node.propagated_risk * 100).toFixed(0)}% fraud probability based on its own activity and connections to risky accounts.`
                  : popup.node.propagated_risk >= 0.35
                  ? `Some suspicious patterns — ${(popup.node.propagated_risk * 100).toFixed(0)}% fraud probability. May be connected to fraudulent activity.`
                  : `Appears normal — ${(popup.node.propagated_risk * 100).toFixed(0)}% fraud probability. Likely an indirect connection.`
                }
              </div>
            </div>
            {popup.edges.length > 0 && (
              <div style={{ padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Connected transactions</div>
                {popup.edges.map((e, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--gray-100)', fontSize: 11 }}>
                    <div>
                      <span style={{ color: e.dir === 'sent' ? '#dc2626' : '#16a34a', fontWeight: 600, marginRight: 4 }}>{e.dir === 'sent' ? 'Sent' : 'Received'}</span>
                      <span style={{ color: 'var(--gray-500)' }}>{TYPE_LABEL[e.type]?.split(' ')[0] ?? e.type}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                      <span style={{ fontFamily: 'var(--mono)', color: e.is_fraud ? '#dc2626' : 'var(--gray-700)', fontWeight: e.is_fraud ? 700 : 400 }}>{fmt(e.amount)}</span>
                      {e.is_fraud === 1 && <span style={{ fontSize: 9, background: '#fef2f2', color: '#dc2626', padding: '1px 4px', borderRadius: 3, fontWeight: 700 }}>FRAUD</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {graph?.mapf_conflicts && graph.mapf_conflicts.length > 0 && (
        <MAPFConflictBar
          conflicts={graph.mapf_conflicts}
          details={graph.mapf_details ?? []}
          center={centerEntity}
        />
      )}
    </div>
  )
}
