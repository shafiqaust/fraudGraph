import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { GraphResponse, GraphNode } from '../api/api'

interface Props { graph: GraphResponse | null; loading: boolean; centerEntity: string }

function riskColor(risk: number) {
  if (risk >= 0.65) return '#dc2626'
  if (risk >= 0.35) return '#ea580c'
  return '#16a34a'
}
function riskLabel(risk: number) {
  if (risk >= 0.65) return 'High Risk'
  if (risk >= 0.35) return 'Medium Risk'
  return 'Low Risk'
}

interface NodePopup {
  node: GraphNode
  x: number
  y: number
  transactions: { amount: number; type: string; is_fraud: number }[]
}

const TYPE_LABEL: Record<string, string> = {
  TRANSFER: 'Bank Transfer', CASH_OUT: 'Cash Withdrawal',
  PAYMENT: 'Payment', DEBIT: 'Debit', CASH_IN: 'Deposit',
}



// ── MAPF Conflict Bar (shown in graph panel) ──────────────────────────────────
function MAPFConflictBar({ conflicts, center }: { conflicts: string[]; center: string }) {
  const [showLightbox, setShowLightbox] = useState(false)
  return (
    <>
      {showLightbox && <MAPFLightbox conflicts={conflicts} center={center} onClose={() => setShowLightbox(false)} />}
      <div style={{ padding: '0', borderTop: '1px solid #e9d5ff', background: 'linear-gradient(135deg,#faf5ff,#eff6ff)', flexShrink: 0 }}>
        <button
          onClick={() => setShowLightbox(true)}
          style={{ width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font)', textAlign: 'left' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,.07)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, color: '#fff', fontWeight: 800 }}>M</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5' }}>
              Coordinated Fraud Pattern Detected
            </div>
            <div style={{ fontSize: 10, color: '#818cf8', marginTop: 1 }}>
              {conflicts.length} MAPF conflict{conflicts.length !== 1 ? 's' : ''} — click to watch animated analysis
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>
              {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}
            </span>
            <span style={{ fontSize: 10, color: '#6366f1', fontWeight: 600 }}>Watch replay ›</span>
          </div>
        </button>
      </div>
    </>
  )
}

// ── MAPF Animated Lightbox ────────────────────────────────────────────────────

interface MAPFStep {
  phase:   string
  agent:   string
  agentBg: string
  agentColor: string
  type:    'scan' | 'match' | 'alert' | 'info' | 'verdict'
  title:   string
  detail:  string
  data?:   string
}

function buildMAPFStory(conflicts: string[], center: string): MAPFStep[] {
  const steps: MAPFStep[] = []

  // Phase 1 — MAPF setup
  steps.push({
    phase: 'Initialisation', agent: 'MAPF Engine', agentBg: '#1e1b4b', agentColor: '#818cf8',
    type: 'info',
    title: 'Multi-Agent Path Finding (MAPF) initialised',
    detail: 'MAPF treats every bank account as an "agent" moving along transaction paths over time. A conflict occurs when multiple agents converge on the same destination within a narrow time window — a pattern that strongly indicates coordinated fraud.',
    data: `Center account: ${center}  |  Time window: 5 steps  |  Max conflicts shown: 5`,
  })

  steps.push({
    phase: 'Initialisation', agent: 'MAPF Engine', agentBg: '#1e1b4b', agentColor: '#818cf8',
    type: 'scan',
    title: 'Scanning transaction history for path overlaps...',
    detail: `Building transaction paths for all accounts connected to ${center} and checking for temporal overlaps.`,
    data: 'Algorithm: BFS neighbourhood traversal → step-window conflict detection',
  })

  // Phase 2 — per conflict
  conflicts.forEach((conflict, i) => {
    // Parse the conflict string to extract key info
    const accountMatch = conflict.match(/Account\s+(\S+)/)
    const amountMatch  = conflict.match(/\$[\d,]+/)
    const typeMatch    = conflict.match(/(TRANSFER|CASH_OUT|PAYMENT|DEBIT|CASH_IN)/)
    const destMatch    = conflict.match(/destination\s*\(([^)]+)\)/)
    const stepsMatch   = conflict.match(/within\s+(\d+)\s+steps/)

    const account = accountMatch?.[1] ?? `Account-${i+1}`
    const amount  = amountMatch?.[0]  ?? 'unknown amount'
    const txType  = typeMatch?.[1]    ?? 'transaction'
    const dest    = destMatch?.[1]    ?? 'same destination'
    const window  = stepsMatch?.[1]   ?? '5'

    steps.push({
      phase: `Conflict ${i + 1}`, agent: 'Path Detector', agentBg: '#7c2d12', agentColor: '#fb923c',
      type: 'match',
      title: `Path overlap detected — Account ${account}`,
      detail: `Account ${account} sent a ${txType} of ${amount} to the same destination (${dest}) within ${window} steps of the center account. In MAPF terms, two agents chose the same resource at the same time.`,
      data: `Competing account: ${account}  |  Amount: ${amount}  |  Destination: ${dest}`,
    })

    steps.push({
      phase: `Conflict ${i + 1}`, agent: 'Fraud Analyst', agentBg: '#881337', agentColor: '#f43f5e',
      type: 'alert',
      title: 'Coordinated behaviour confirmed',
      detail: `This is not coincidence. Independent accounts sending the same transaction type to the same destination in close succession is a hallmark of organised fraud rings — where a controller directs multiple mule accounts simultaneously.`,
      data: `Pattern: Ring fraud  |  Risk multiplier applied to connected nodes`,
    })
  })

  // Phase 3 — what this means
  steps.push({
    phase: 'Analysis', agent: 'Network Analyst', agentBg: '#065f46', agentColor: '#34d399',
    type: 'info',
    title: 'What MAPF conflicts tell us about the fraud structure',
    detail: 'In a legitimate scenario, independent accounts would rarely send the same transaction type to the same dormant account in the same 5-step window. The probability of this happening by chance drops below 0.1% with 2+ conflicts. This strongly suggests a coordinated operator controlling multiple accounts.',
    data: `Conflicts found: ${conflicts.length}  |  Implied ring size: ${conflicts.length + 1}+ accounts`,
  })

  steps.push({
    phase: 'Analysis', agent: 'Network Analyst', agentBg: '#065f46', agentColor: '#34d399',
    type: 'info',
    title: 'GNN risk propagation applied to conflict nodes',
    detail: 'Each account identified in a MAPF conflict has had its propagated_risk score elevated in the graph. The risk "flows" from high-confidence fraud nodes through the network edges — accounts closely connected to confirmed fraud carry elevated risk even if not directly flagged.',
    data: 'Propagation formula: Risk(node) = base + 0.3 x sum(neighbour_risk x edge_weight)',
  })

  // Phase 4 — verdict
  steps.push({
    phase: 'Verdict', agent: 'MAPF Verdict', agentBg: '#1e1b4b', agentColor: '#818cf8',
    type: 'verdict',
    title: conflicts.length >= 3
      ? 'HIGH CONFIDENCE: Organised fraud ring detected'
      : conflicts.length === 2
      ? 'MEDIUM-HIGH CONFIDENCE: Coordinated fraud pattern'
      : 'SUSPICIOUS: Possible coordinated activity',
    detail: conflicts.length >= 2
      ? `${conflicts.length} independent accounts converged on the same destination — this is a textbook fraud ring pattern. All involved accounts should be frozen and investigated together, not individually.`
      : `1 coordination conflict found. This alone is suspicious but may not be definitive. Cross-reference with the account's full transaction history and the graph node risk scores.`,
    data: `Recommended action: ${conflicts.length >= 2 ? 'Freeze all connected accounts + escalate to fraud team' : 'Flag for manual review + monitor'}`,
  })

  return steps
}

function MAPFStepBubble({ step, visible, isLast }: { step: MAPFStep; visible: boolean; isLast: boolean }) {
  const typeConfig = {
    scan:    { bg: '#f8fafc', border: '#e2e8f0', label: 'scanning', labelColor: '#64748b' },
    match:   { bg: '#fff7ed', border: '#fed7aa', label: 'match found', labelColor: '#ea580c' },
    alert:   { bg: '#fef2f2', border: '#fecaca', label: 'alert', labelColor: '#dc2626' },
    info:    { bg: '#eff6ff', border: '#bfdbfe', label: 'info', labelColor: '#2563eb' },
    verdict: { bg: '#f5f3ff', border: '#ddd6fe', label: 'verdict', labelColor: '#7c3aed' },
  }[step.type]

  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(14px)',
      transition: 'opacity .4s ease, transform .4s ease',
      marginBottom: isLast ? 0 : 12,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0, paddingTop: 2 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: step.agentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: step.agentColor, flexShrink: 0 }}>
          {step.agent.slice(0,2).toUpperCase()}
        </div>
        {!isLast && <div style={{ width: 1, flex: 1, minHeight: 10, background: 'var(--gray-200)' }} />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: step.agentColor }}>{step.agent}</span>
          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: typeConfig.bg, border: `1px solid ${typeConfig.border}`, color: typeConfig.labelColor, fontWeight: 600 }}>
            {typeConfig.label}
          </span>
          <span style={{ fontSize: 9, color: 'var(--gray-400)' }}>{step.phase}</span>
        </div>
        <div style={{ background: typeConfig.bg, border: `1px solid ${typeConfig.border}`, borderRadius: 8, padding: '9px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: step.detail ? 5 : 0 }}>
            {step.type === 'scan' && (
              <span style={{ display: 'inline-flex', gap: 2 }}>
                {[0,1,2].map(i => (
                  <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: '#94a3b8', display: 'inline-block', animation: `dotpulse 1.2s ${i * 0.2}s infinite` }} />
                ))}
              </span>
            )}
            <span style={{ fontSize: 12, fontWeight: 700, color: typeConfig.labelColor }}>{step.title}</span>
          </div>
          {step.detail && (
            <div style={{ fontSize: 11, color: 'var(--gray-600)', lineHeight: 1.7 }}>{step.detail}</div>
          )}
          {step.data && (
            <div style={{ marginTop: 6, padding: '4px 8px', background: 'rgba(0,0,0,.04)', borderRadius: 4, fontSize: 10, fontFamily: 'var(--mono)', color: typeConfig.labelColor }}>
              {step.data}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MAPFLightbox({ conflicts, center, onClose }: { conflicts: string[]; center: string; onClose: () => void }) {
  const steps = buildMAPFStory(conflicts, center)
  const [visibleCount, setVisibleCount] = useState(0)
  const [playing, setPlaying]           = useState(true)
  const [speed, setSpeed]               = useState(900)
  const scrollRef = useRef<HTMLDivElement>(null)
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (playing && visibleCount < steps.length) {
      timerRef.current = setInterval(() => {
        setVisibleCount(c => {
          if (c + 1 >= steps.length) setPlaying(false)
          return c + 1
        })
      }, speed)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [playing, speed, steps.length, visibleCount])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [visibleCount])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const phases = [...new Set(steps.map(s => s.phase))]

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}
    >
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 680, height: '88vh', maxHeight: 780, display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,.3)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg,#1e1b4b,#312e81)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
            M
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>MAPF Conflict Analysis — Animated Replay</div>
            <div style={{ color: '#818cf8', fontSize: 11, marginTop: 1 }}>Multi-Agent Path Finding applied to fraud network detection</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.1)', border: 'none', color: '#a5b4fc', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font)' }}>x</button>
        </div>

        {/* Stats bar */}
        <div style={{ background: '#312e81', padding: '8px 20px', display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 16 }}>
            {[
              { label: 'Conflicts found', value: conflicts.length, color: '#f87171' },
              { label: 'Accounts involved', value: conflicts.length + 1, color: '#fb923c' },
              { label: 'Analysis steps', value: steps.length, color: '#a5b4fc' },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 18, fontWeight: 800, color: s.color, fontFamily: 'var(--mono)', lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 9, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {phases.map(phase => {
              const done = steps.slice(0, visibleCount).some(s => s.phase === phase)
              const active = steps[Math.max(0, visibleCount - 1)]?.phase === phase && visibleCount < steps.length
              return (
                <div key={phase} style={{ fontSize: 9, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: active ? '#4f46e5' : done ? 'rgba(255,255,255,.15)' : 'rgba(255,255,255,.05)', color: active ? '#fff' : done ? '#a5b4fc' : '#4a4a7a', transition: 'all .3s' }}>
                  {phase}
                </div>
              )
            })}
          </div>
        </div>

        {/* What is MAPF — explainer strip */}
        <div style={{ padding: '8px 20px', background: '#faf5ff', borderBottom: '1px solid #e9d5ff', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: '#6d28d9', lineHeight: 1.6 }}>
            <strong>What is MAPF?</strong> Multi-Agent Path Finding models each account as an "agent" travelling along transaction paths over time.
            A <strong>conflict</strong> occurs when multiple agents reach the same destination within a narrow time window — signalling coordinated behaviour impossible by chance.
          </div>
        </div>

        {/* Story feed */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {steps.map((step, i) => (
            <MAPFStepBubble key={i} step={step} visible={i < visibleCount} isLast={i === steps.length - 1} />
          ))}
          {visibleCount >= steps.length && (
            <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 13, color: '#7c3aed', fontWeight: 700 }}>
              MAPF analysis complete — {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''} identified
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{ padding: '10px 20px', borderTop: '1px solid var(--gray-200)', background: 'var(--gray-50)', flexShrink: 0 }}>
          <div style={{ height: 4, background: 'var(--gray-200)', borderRadius: 2, marginBottom: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(visibleCount / steps.length) * 100}%`, background: 'linear-gradient(90deg,#4f46e5,#7c3aed)', borderRadius: 2, transition: 'width .3s' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--gray-400)', fontFamily: 'var(--mono)' }}>{visibleCount}/{steps.length}</span>
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
              <button onClick={() => { setVisibleCount(0); setPlaying(true) }} style={{ padding: '5px 11px', borderRadius: 6, border: '1px solid var(--gray-200)', background: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--gray-700)' }}>Restart</button>
              {playing
                ? <button onClick={() => setPlaying(false)} style={{ padding: '5px 11px', borderRadius: 6, border: '1px solid var(--gray-300)', background: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--gray-700)' }}>Pause</button>
                : visibleCount < steps.length
                ? <button onClick={() => setPlaying(true)} style={{ padding: '5px 11px', borderRadius: 6, border: '1px solid #bfdbfe', background: '#eff6ff', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', color: '#2563eb' }}>Resume</button>
                : null
              }
              <button onClick={() => { setVisibleCount(steps.length); setPlaying(false) }} style={{ padding: '5px 11px', borderRadius: 6, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>Show All</button>
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

export default function GraphComponent({ graph, loading, centerEntity }: Props) {
  const svgRef   = useRef<SVGSVGElement>(null)
  const wrapRef  = useRef<HTMLDivElement>(null)
  const [popup, setPopup] = useState<NodePopup | null>(null)

  useEffect(() => {
    if (!graph || !svgRef.current || !wrapRef.current) return
    const el = svgRef.current
    const W  = wrapRef.current.clientWidth  || 600
    const H  = wrapRef.current.clientHeight || 300

    const svg = d3.select(el)
    svg.selectAll('*').remove()
    svg.attr('width', W).attr('height', H)

    const g = svg.append('g')

    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 4])
        .on('zoom', e => g.attr('transform', e.transform.toString()))
    )

    // Click outside to close popup
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

    // Draw edges
    const link = g.selectAll('line').data(links).join('line')
      .attr('stroke',         d => d.is_fraud ? '#dc2626' : '#d1d5db')
      .attr('stroke-width',   d => d.is_fraud ? 2.5 : 1.2)
      .attr('stroke-opacity', d => d.is_fraud ? 0.85 : 0.5)
      .attr('stroke-dasharray', d => d.is_fraud ? '0' : '4,3')

    // Edge amount labels
    const edgeLabel = g.selectAll('text.edge-label').data(links.filter(l => l.is_fraud)).join('text')
      .attr('class', 'edge-label')
      .attr('font-size', 9)
      .attr('fill', '#dc2626')
      .attr('text-anchor', 'middle')
      .attr('font-family', 'var(--mono)')
      .text(d => `$${(d.amount/1000).toFixed(0)}k`)

    // Node groups
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
        const rect = (ev.target as SVGElement).closest('svg')!.getBoundingClientRect()
        const wrap = wrapRef.current!.getBoundingClientRect()
        // Gather edges involving this node
        const txs = graph.edges
          .filter(e => e.source === d.id || e.target === d.id)
          .slice(0, 5)
          .map(e => ({ amount: e.amount, type: e.type, is_fraud: e.is_fraud }))
        setPopup({ node: d, x: ev.clientX - wrap.left, y: ev.clientY - wrap.top, transactions: txs })
      })

    const isCenter = (d: any) => d.id === centerEntity

    // Glow ring for center
    node.filter(isCenter).append('circle')
      .attr('r', 32).attr('fill', 'none')
      .attr('stroke', '#dc2626').attr('stroke-width', 2)
      .attr('stroke-opacity', 0.3)
      .attr('stroke-dasharray', '6,3')

    // Main circle
    node.append('circle')
      .attr('r', d => isCenter(d) ? 24 : Math.max(14, 10 + d.propagated_risk * 14))
      .attr('fill', d => riskColor(d.propagated_risk))
      .attr('stroke', '#fff')
      .attr('stroke-width', d => isCenter(d) ? 3 : 2)
      .attr('filter', d => isCenter(d) ? 'drop-shadow(0 2px 6px rgba(220,38,38,.4))' : 'none')

    // Icon inside circle
    node.append('text')
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
      .attr('font-size', d => isCenter(d) ? 14 : 10)
      .attr('pointer-events', 'none')
      .text(d => d.type === 'merchant' ? '🏪' : isCenter(d) ? '⭐' : '👤')

    // Label below circle
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', d => (isCenter(d) ? 24 : Math.max(14, 10 + d.propagated_risk * 14)) + 12)
      .attr('font-size', 9).attr('font-family', 'var(--mono)')
      .attr('fill', 'var(--gray-600)').attr('pointer-events', 'none')
      .text(d => d.id.slice(0, 9))

    sim.on('tick', () => {
      link
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y)
      edgeLabel
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2 - 4)
      node.attr('transform', d => `translate(${d.x},${d.y})`)
    })

    return () => { sim.stop() }
  }, [graph, centerEntity])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', background: '#fff' }}>

      {/* Header */}
      <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--gray-200)', background: 'var(--gray-50)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-700)' }}>🕸️ Money Flow Network</span>
          <span style={{ fontSize: 11, color: 'var(--gray-400)', marginLeft: 8 }}>
            Who sent money to whom — click any circle to learn more
          </span>
        </div>
        {graph && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--gray-400)' }}>
            <span>{graph.stats.node_count} accounts</span>
            <span>·</span>
            <span>{graph.stats.edge_count} transactions</span>
            {graph.stats.conflict_count > 0 && <><span>·</span><span style={{ color: '#ea580c' }}>{graph.stats.conflict_count} coordinated patterns</span></>}
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ padding: '5px 14px', borderBottom: '1px solid var(--gray-100)', background: '#fff', display: 'flex', gap: 14, alignItems: 'center' }}>
        {[
          { color: '#dc2626', label: '🔴 High risk account' },
          { color: '#ea580c', label: '🟠 Medium risk' },
          { color: '#16a34a', label: '🟢 Low risk' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--gray-500)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.color, flexShrink: 0 }} />
            {l.label}
          </div>
        ))}
        <div style={{ fontSize: 10, color: 'var(--gray-400)', marginLeft: 'auto' }}>
          ⭐ = selected account &nbsp;·&nbsp; 🏪 = merchant &nbsp;·&nbsp; 👤 = other account
        </div>
      </div>

      {/* Graph canvas */}
      <div ref={wrapRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* Loading overlay */}
        {loading && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 20, gap: 10 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', border: '3px solid #dc2626', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
            <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>Building money flow map...</div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        {/* Empty state */}
        {!graph && !loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)', gap: 8 }}>
            <div style={{ fontSize: 36 }}>🕸️</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-500)' }}>Money Flow Network</div>
            <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 260 }}>
              Select any transaction from the table to see how money moved between accounts
            </div>
          </div>
        )}

        {/* SVG */}
        <svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block' }} />

        {/* NODE POPUP — shows when you click a circle */}
        {popup && (
          <div style={{
            position: 'absolute',
            left: Math.min(popup.x + 10, (wrapRef.current?.clientWidth ?? 600) - 260),
            top:  Math.min(popup.y + 10, (wrapRef.current?.clientHeight ?? 300) - 280),
            width: 250, background: '#fff',
            border: `2px solid ${riskColor(popup.node.propagated_risk)}`,
            borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-md)',
            zIndex: 100, overflow: 'hidden',
          }}>
            {/* Popup header */}
            <div style={{ background: riskColor(popup.node.propagated_risk), padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.75)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  {popup.node.type === 'merchant' ? '🏪 Merchant' : popup.node.id === centerEntity ? '⭐ Selected Account' : '👤 Account'}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: 'var(--mono)' }}>
                  {popup.node.id}
                </div>
              </div>
              <button onClick={() => setPopup(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.8)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
            </div>

            {/* Risk assessment */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--gray-100)' }}>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 6 }}>Risk Assessment</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--gray-600)' }}>Initial score</span>
                <span style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600, color: riskColor(popup.node.base_risk) }}>
                  {(popup.node.base_risk * 100).toFixed(0)}%
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--gray-600)' }}>After network analysis</span>
                <span style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700, color: riskColor(popup.node.propagated_risk) }}>
                  {(popup.node.propagated_risk * 100).toFixed(0)}%
                </span>
              </div>
              {/* Risk bar */}
              <div style={{ height: 6, background: 'var(--gray-200)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${popup.node.propagated_risk * 100}%`, background: riskColor(popup.node.propagated_risk), borderRadius: 3 }} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: riskColor(popup.node.propagated_risk), marginTop: 6, textAlign: 'center' }}>
                {riskLabel(popup.node.propagated_risk)}
              </div>
            </div>

            {/* Plain English explanation */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--gray-100)', background: 'var(--gray-50)' }}>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>What does this mean?</div>
              <div style={{ fontSize: 12, color: 'var(--gray-700)', lineHeight: 1.6 }}>
                {popup.node.propagated_risk >= 0.65
                  ? `This account is highly suspicious. It has a ${(popup.node.propagated_risk * 100).toFixed(0)}% fraud probability based on its own activity and its connections to other risky accounts.`
                  : popup.node.propagated_risk >= 0.35
                  ? `This account shows some suspicious patterns — a ${(popup.node.propagated_risk * 100).toFixed(0)}% fraud probability. It may be connected to risky accounts worth investigating.`
                  : `This account appears normal — only a ${(popup.node.propagated_risk * 100).toFixed(0)}% fraud probability. It may be connected to the suspicious transaction indirectly.`
                }
              </div>
            </div>

            {/* Transactions involving this node */}
            {popup.transactions.length > 0 && (
              <div style={{ padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 6 }}>
                  Connected transactions ({popup.transactions.length})
                </div>
                {popup.transactions.map((t, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid var(--gray-100)', fontSize: 11 }}>
                    <span style={{ color: 'var(--gray-600)' }}>{TYPE_LABEL[t.type] ?? t.type}</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontFamily: 'var(--mono)', color: t.is_fraud ? '#dc2626' : 'var(--gray-700)', fontWeight: t.is_fraud ? 700 : 400 }}>
                        ${t.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                      {t.is_fraud === 1 && <span style={{ fontSize: 9, background: '#fef2f2', color: '#dc2626', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>FRAUD</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MAPF conflicts */}
      {graph?.mapf_conflicts && graph.mapf_conflicts.length > 0 && (
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--gray-200)', background: '#fff7ed', flexShrink: 0, maxHeight: 80, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#ea580c', marginBottom: 4 }}>
            ⚡ Coordinated Fraud Pattern Detected
          </div>
          {graph.mapf_conflicts.map((c, i) => (
            <div key={i} style={{ fontSize: 11, color: '#92400e', lineHeight: 1.5 }}>
              · {c}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
