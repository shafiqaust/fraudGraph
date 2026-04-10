import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { GraphResponse, GraphNode } from '../api/api'

interface Props {
  graph:         GraphResponse | null
  loading:       boolean
  centerEntity:  string
}

const TYPE_LABEL: Record<string, string> = {
  TRANSFER: 'Bank Transfer', CASH_OUT: 'Cash Withdrawal',
  PAYMENT: 'Payment', DEBIT: 'Debit', CASH_IN: 'Deposit',
}

function riskColor(r: number) {
  return r >= 0.65 ? '#dc2626' : r >= 0.35 ? '#ea580c' : '#16a34a'
}
function riskLabel(r: number) {
  return r >= 0.65 ? 'High Risk' : r >= 0.35 ? 'Medium Risk' : 'Low Risk'
}
function riskBg(r: number) {
  return r >= 0.65 ? '#fef2f2' : r >= 0.35 ? '#fff7ed' : '#f0fdf4'
}
function riskBorder(r: number) {
  return r >= 0.65 ? '#fecaca' : r >= 0.35 ? '#fed7aa' : '#bbf7d0'
}

interface Popup {
  node:  GraphNode
  x:     number
  y:     number
  edges: { amount: number; type: string; is_fraud: number; dir: string }[]
}

export default function GraphComponent({ graph, loading, centerEntity }: Props) {
  const svgRef  = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [popup, setPopup] = useState<Popup | null>(null)

  useEffect(() => {
    if (!graph || !svgRef.current || !wrapRef.current) return
    const el = svgRef.current
    const W  = wrapRef.current.clientWidth  || 600
    const H  = wrapRef.current.clientHeight || 280

    const svg = d3.select(el)
    svg.selectAll('*').remove()
    svg.attr('width', W).attr('height', H)

    const g = svg.append('g')
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 4])
        .on('zoom', e => g.attr('transform', e.transform.toString()))
    )
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

    // Edges
    const link = g.selectAll('line').data(links).join('line')
      .attr('stroke',         d => d.is_fraud ? '#dc2626' : '#d1d5db')
      .attr('stroke-width',   d => d.is_fraud ? 2.5 : 1.2)
      .attr('stroke-opacity', d => d.is_fraud ? 0.85 : 0.45)
      .attr('stroke-dasharray', d => d.is_fraud ? '0' : '4,3')

    // Fraud edge labels
    const edgeLabel = g.selectAll('text.el')
      .data(links.filter(l => l.is_fraud))
      .join('text')
      .attr('class', 'el')
      .attr('font-size', 9)
      .attr('fill', '#dc2626')
      .attr('text-anchor', 'middle')
      .attr('font-family', 'var(--mono)')
      .attr('pointer-events', 'none')
      .text(d => `$${(d.amount / 1000).toFixed(0)}k`)

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
        const wrap = wrapRef.current!.getBoundingClientRect()
        const edgesForNode = graph.edges
          .filter(e => e.source === d.id || e.target === d.id)
          .slice(0, 6)
          .map(e => ({
            amount: e.amount, type: e.type, is_fraud: e.is_fraud,
            dir: e.source === d.id ? 'sent' : 'received',
          }))
        setPopup({
          node: d,
          x: Math.min(ev.clientX - wrap.left + 12, (wrapRef.current?.clientWidth ?? 600) - 260),
          y: Math.min(ev.clientY - wrap.top  + 12, (wrapRef.current?.clientHeight ?? 300) - 340),
          edges: edgesForNode,
        })
      })

    const isCenter = (d: any) => d.id === centerEntity

    // Glow ring for center node
    node.filter(isCenter).append('circle')
      .attr('r', 34).attr('fill', 'none')
      .attr('stroke', '#dc2626').attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.3).attr('stroke-dasharray', '5,3')

    // Main circle
    node.append('circle')
      .attr('r',            d => isCenter(d) ? 22 : Math.max(13, 10 + d.propagated_risk * 12))
      .attr('fill',         d => riskColor(d.propagated_risk))
      .attr('stroke',       '#fff')
      .attr('stroke-width', d => isCenter(d) ? 3 : 2)
      .attr('opacity',      0.9)

    // Icon
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', d => isCenter(d) ? 14 : 10)
      .attr('pointer-events', 'none')
      .text(d => d.type === 'merchant' ? '🏪' : isCenter(d) ? '⭐' : '👤')

    // Short ID label below
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', d => (isCenter(d) ? 22 : Math.max(13, 10 + d.propagated_risk * 12)) + 13)
      .attr('font-size', 8).attr('font-family', 'var(--mono)')
      .attr('fill', 'var(--gray-500)').attr('pointer-events', 'none')
      .text(d => d.id.slice(0, 9))

    sim.on('tick', () => {
      link
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y)
      edgeLabel
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2 - 5)
      node.attr('transform', d => `translate(${d.x},${d.y})`)
    })

    return () => { sim.stop() }
  }, [graph, centerEntity])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#fff' }}>

      {/* Header */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid var(--gray-200)', background: 'var(--gray-50)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-700)' }}>🕸️ Money Flow Network</span>
        <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
          Click any circle to learn about that account
        </span>
        {graph && (
          <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--gray-400)' }}>
            {graph.stats.node_count} accounts · {graph.stats.edge_count} transactions
            {graph.stats.conflict_count > 0 && ` · ⚡ ${graph.stats.conflict_count} coordinated`}
          </span>
        )}
      </div>

      {/* Legend */}
      <div style={{ padding: '4px 14px', borderBottom: '1px solid var(--gray-100)', display: 'flex', gap: 14, alignItems: 'center', flexShrink: 0 }}>
        {[['#dc2626','🔴 High risk'],['#ea580c','🟠 Medium'],['#16a34a','🟢 Low risk']].map(([c,l]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--gray-500)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />{l}
          </div>
        ))}
        <div style={{ fontSize: 10, color: 'var(--gray-400)', marginLeft: 'auto' }}>
          ⭐ selected · 🏪 merchant · 👤 account — red lines = fraud transfers
        </div>
      </div>

      {/* Canvas */}
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
            <div style={{ fontSize: 32 }}>🕸️</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-500)' }}>Money Flow Network</div>
            <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 260, lineHeight: 1.6 }}>
              Select a transaction to see how money moved between accounts
            </div>
          </div>
        )}

        <svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block' }} />

        {/* Click popup */}
        {popup && (
          <div style={{
            position: 'absolute', left: popup.x, top: popup.y,
            width: 248, background: '#fff', zIndex: 100,
            border: `2px solid ${riskColor(popup.node.propagated_risk)}`,
            borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden',
          }}>

            {/* Popup header */}
            <div style={{ background: riskColor(popup.node.propagated_risk), padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,.7)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>
                  {popup.node.type === 'merchant' ? '🏪 Merchant' : popup.node.id === centerEntity ? '⭐ Selected Account' : '👤 Connected Account'}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', fontFamily: 'var(--mono)' }}>
                  {popup.node.id}
                </div>
              </div>
              <button onClick={() => setPopup(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.8)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 0, flexShrink: 0, marginLeft: 8 }}>×</button>
            </div>

            {/* Risk score */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--gray-100)', background: riskBg(popup.node.propagated_risk) }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: riskColor(popup.node.propagated_risk) }}>
                  {riskLabel(popup.node.propagated_risk)}
                </span>
                <span style={{ fontSize: 18, fontWeight: 800, color: riskColor(popup.node.propagated_risk), fontFamily: 'var(--mono)' }}>
                  {(popup.node.propagated_risk * 100).toFixed(0)}%
                </span>
              </div>
              <div style={{ height: 6, background: 'rgba(0,0,0,.1)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ height: '100%', width: `${popup.node.propagated_risk * 100}%`, background: riskColor(popup.node.propagated_risk), borderRadius: 3 }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>
                Initial: {(popup.node.base_risk * 100).toFixed(0)}% → After network analysis: {(popup.node.propagated_risk * 100).toFixed(0)}%
              </div>
            </div>

            {/* Plain English explanation */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--gray-100)' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>
                What does this mean?
              </div>
              <div style={{ fontSize: 12, color: 'var(--gray-700)', lineHeight: 1.7 }}>
                {popup.node.propagated_risk >= 0.65
                  ? `This account is highly suspicious — ${(popup.node.propagated_risk * 100).toFixed(0)}% fraud probability. Based on its own transactions and connections to other risky accounts, this should be investigated immediately.`
                  : popup.node.propagated_risk >= 0.35
                  ? `This account shows some suspicious patterns — ${(popup.node.propagated_risk * 100).toFixed(0)}% fraud probability. It may be connected to fraudulent activity and warrants further review.`
                  : `This account appears normal — only ${(popup.node.propagated_risk * 100).toFixed(0)}% fraud probability. It is connected to the suspicious transaction but is likely not directly involved in fraud.`
                }
              </div>
            </div>

            {/* Connected transactions */}
            {popup.edges.length > 0 && (
              <div style={{ padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                  Connected transactions
                </div>
                {popup.edges.map((e, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--gray-100)', fontSize: 11 }}>
                    <div>
                      <span style={{ color: e.dir === 'sent' ? '#dc2626' : '#16a34a', fontWeight: 600, marginRight: 4 }}>
                        {e.dir === 'sent' ? '↑ Sent' : '↓ Received'}
                      </span>
                      <span style={{ color: 'var(--gray-500)' }}>{TYPE_LABEL[e.type] ?? e.type}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                      <span style={{ fontFamily: 'var(--mono)', color: e.is_fraud ? '#dc2626' : 'var(--gray-700)', fontWeight: e.is_fraud ? 700 : 400 }}>
                        ${e.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                      {e.is_fraud === 1 && (
                        <span style={{ fontSize: 9, background: '#fef2f2', color: '#dc2626', padding: '1px 4px', borderRadius: 3, fontWeight: 700 }}>
                          FRAUD
                        </span>
                      )}
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
        <div style={{ padding: '7px 14px', borderTop: '1px solid var(--gray-200)', background: '#fff7ed', maxHeight: 75, overflowY: 'auto', flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#ea580c', marginBottom: 3 }}>
            ⚡ Coordinated Fraud Pattern Detected
          </div>
          {graph.mapf_conflicts.map((c, i) => (
            <div key={i} style={{ fontSize: 10, color: '#92400e', lineHeight: 1.5 }}>· {c}</div>
          ))}
        </div>
      )}
    </div>
  )
}
