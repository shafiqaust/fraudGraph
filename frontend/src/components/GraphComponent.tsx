import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { GraphResponse, GraphNode, GraphEdge, MAPFConflictDetail } from '../api/api'

interface Props { graph: GraphResponse | null; loading: boolean; centerEntity: string }

const TYPE_LABEL: Record<string,string> = {
  TRANSFER:'Bank Transfer', CASH_OUT:'Cash Withdrawal',
  PAYMENT:'Payment', DEBIT:'Debit', CASH_IN:'Deposit',
}
const TYPE_COLOR: Record<string,string> = {
  TRANSFER:'#dc2626', CASH_OUT:'#ea580c',
  PAYMENT:'#2563eb', DEBIT:'#6b7280', CASH_IN:'#16a34a',
}

function riskColor(r:number){ return r>=0.65?'#dc2626':r>=0.35?'#ea580c':'#16a34a' }
function riskBg(r:number){ return r>=0.65?'#fff1f2':r>=0.35?'#fff7ed':'#f0fdf4' }
function riskBorder(r:number){ return r>=0.65?'#fecaca':r>=0.35?'#fed7aa':'#bbf7d0' }
function riskLabel(r:number){ return r>=0.65?'High Risk':r>=0.35?'Medium Risk':'Low Risk' }
function fmt(n:number){ return '$'+n.toLocaleString(undefined,{maximumFractionDigits:0}) }

interface Panel {
  emoji: string; character: string; charColor: string; charBg: string
  bubble: string; detail: string
  highlight?: { label: string; value: string; color: string }[]
  tableRows?: { label: string; value: string; flag?: string; flagColor?: string }[]
}

function CartoonPanel({ panel, visible }: { panel: Panel; visible: boolean }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 12,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.97)',
      transition: 'all 0.45s cubic-bezier(0.34,1.56,0.64,1)',
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 54, height: 54, borderRadius: '50%', background: panel.charBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, boxShadow: `0 0 0 3px ${panel.charColor}, 0 0 0 6px ${panel.charColor}33` }}>
            {panel.emoji}
          </div>
          <div style={{ fontSize: 9, fontWeight: 700, color: panel.charColor, textAlign: 'center', maxWidth: 56, lineHeight: 1.2 }}>{panel.character}</div>
        </div>
        <div style={{ position: 'relative', flex: 1 }}>
          <div style={{ position: 'absolute', left: -8, bottom: 14, width: 0, height: 0, borderTop: '8px solid transparent', borderBottom: '8px solid transparent', borderRight: `10px solid ${panel.charColor}` }}/>
          <div style={{ background: '#fff', border: `2px solid ${panel.charColor}`, borderRadius: 14, padding: '12px 14px', fontSize: 13, fontWeight: 600, color: '#111827', lineHeight: 1.55, boxShadow: `0 4px 16px ${panel.charColor}22` }}>
            {panel.bubble}
          </div>
        </div>
      </div>
      <div style={{ background: '#f9fafb', border: '1px solid var(--gray-200)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#374151', lineHeight: 1.75 }}>
        {panel.detail}
      </div>
      {panel.highlight && panel.highlight.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {panel.highlight.map((h, i) => (
            <div key={i} style={{ background: h.color + '18', border: `1px solid ${h.color}55`, borderRadius: 8, padding: '5px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 80 }}>
              <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 2 }}>{h.label}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: h.color, fontFamily: 'var(--mono)' }}>{h.value}</div>
            </div>
          ))}
        </div>
      )}
      {panel.tableRows && panel.tableRows.length > 0 && (
        <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--gray-200)' }}>
          {panel.tableRows.map((row, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', background: i % 2 === 0 ? '#fff' : '#f9fafb', borderBottom: i < (panel.tableRows!.length - 1) ? '1px solid var(--gray-100)' : 'none' }}>
              <span style={{ fontSize: 11, color: '#6b7280' }}>{row.label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#111827', fontFamily: 'var(--mono)' }}>{row.value}</span>
                {row.flag && <span style={{ fontSize: 9, fontWeight: 700, background: row.flagColor + '22', color: row.flagColor, border: `1px solid ${row.flagColor}55`, padding: '1px 5px', borderRadius: 3 }}>{row.flag}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StoryLightbox({ title, subtitle, headerColor, panels, onClose }: { title: string; subtitle: string; headerColor: string; panels: Panel[]; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)
  const [autoPlay, setAutoPlay] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { setVisible(false); const t = setTimeout(() => setVisible(true), 60); return () => clearTimeout(t) }, [step])

  useEffect(() => {
    if (!autoPlay) return
    timerRef.current = setInterval(() => {
      setStep(s => { if (s + 1 >= panels.length) { setAutoPlay(false); return s } return s + 1 })
    }, 3200)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [autoPlay, panels.length])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') { setAutoPlay(false); setStep(s => Math.min(s + 1, panels.length - 1)) }
      if (e.key === 'ArrowLeft')  { setAutoPlay(false); setStep(s => Math.max(s - 1, 0)) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, panels.length])

  const go = (n: number) => { setAutoPlay(false); setStep(n) }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(10,15,30,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(6px)' }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(0,0,0,.4)', overflow: 'hidden' }}>
        <div style={{ background: `linear-gradient(135deg,${headerColor},${headerColor}cc)`, padding: '16px 20px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.65)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>{subtitle}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', lineHeight: 1.3 }}>{title}</div>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font)', flexShrink: 0 }}>x</button>
          </div>
          <div style={{ display: 'flex', gap: 5, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {panels.map((_, i) => (
              <button key={i} onClick={() => go(i)} style={{ width: i === step ? 22 : 8, height: 8, borderRadius: 4, background: i === step ? '#fff' : i < step ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.25)', border: 'none', cursor: 'pointer', transition: 'all .3s', padding: 0 }}/>
            ))}
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,.6)', marginLeft: 6 }}>{step + 1} / {panels.length}</span>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
          <CartoonPanel panel={panels[step]} visible={visible} />
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--gray-200)', background: 'var(--gray-50)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <button onClick={() => go(Math.max(step - 1, 0))} disabled={step === 0} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--gray-200)', background: '#fff', cursor: step === 0 ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, color: step === 0 ? 'var(--gray-300)' : 'var(--gray-700)', fontFamily: 'var(--font)' }}>Back</button>
          {autoPlay
            ? <button onClick={() => setAutoPlay(false)} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--gray-300)', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--gray-700)', fontFamily: 'var(--font)' }}>Pause</button>
            : <button onClick={() => setAutoPlay(true)} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #bfdbfe', background: '#eff6ff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#2563eb', fontFamily: 'var(--font)' }}>Auto</button>
          }
          <button onClick={() => { setStep(0); setAutoPlay(true) }} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--gray-200)', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--gray-700)', fontFamily: 'var(--font)' }}>Restart</button>
          <div style={{ flex: 1 }}/>
          {step < panels.length - 1
            ? <button onClick={() => go(step + 1)} style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: headerColor, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font)' }}>Next</button>
            : <button onClick={onClose} style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font)' }}>Done</button>
          }
        </div>
        <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--gray-300)', paddingBottom: 8 }}>Arrow keys to navigate · Esc to close</div>
      </div>
    </div>
  )
}

function buildNodePanels(node: GraphNode, allEdges: GraphEdge[], centerEntity: string): Panel[] {
  const isCenter = node.id === centerEntity
  const isMerchant = node.type === 'merchant'
  const risk = node.propagated_risk
  const myEdges = allEdges.filter(e => e.source === node.id || e.target === node.id)
  const sentEdges = allEdges.filter(e => e.source === node.id)
  const recvEdges = allEdges.filter(e => e.target === node.id)
  const fraudEdges = myEdges.filter(e => e.is_fraud === 1)
  const totalSent = sentEdges.reduce((s, e) => s + e.amount, 0)
  const totalRecv = recvEdges.reduce((s, e) => s + e.amount, 0)
  const panels: Panel[] = []

  panels.push({
    emoji: isCenter ? '\uD83D\uDD0D' : isMerchant ? '\uD83C\uDFEA' : risk >= 0.65 ? '\uD83D\uDEA8' : '\uD83D\uDC64',
    character: isCenter ? 'Lead Detective' : isMerchant ? 'Merchant Agent' : risk >= 0.65 ? 'Fraud Alert' : 'Account Agent',
    charColor: isCenter ? '#2563eb' : risk >= 0.65 ? '#dc2626' : risk >= 0.35 ? '#ea580c' : '#16a34a',
    charBg: isCenter ? '#eff6ff' : risk >= 0.65 ? '#fef2f2' : risk >= 0.35 ? '#fff7ed' : '#f0fdf4',
    bubble: isCenter ? `This is the account you flagged for investigation: ${node.id}` : isMerchant ? `I am a merchant (a business). Merchants receive payments but rarely start fraud themselves.` : risk >= 0.65 ? `Warning! Account ${node.id} looks very suspicious.` : risk >= 0.35 ? `Account ${node.id} has some suspicious patterns worth checking.` : `Account ${node.id} seems normal — it is here because it connects to the investigation.`,
    detail: isCenter ? `You selected account ${node.id} to investigate. The Money Flow Network was built by tracing every account this one has ever sent money to or received money from — going 2 hops outward. Every other circle on the graph connects back to this account.` : isMerchant ? `Merchant account ${node.id} appears because it received payment from one of the investigated accounts. Merchants are often legitimate endpoints, but can also be used as cover for money laundering.` : `Account ${node.id} showed up while the system traced money flows. It sent or received money in transactions connected — directly or indirectly — to the account you are investigating.`,
    highlight: [
      { label: 'Risk Score', value: `${(risk * 100).toFixed(0)}%`, color: riskColor(risk) },
      { label: 'Fraud Links', value: String(fraudEdges.length), color: fraudEdges.length > 0 ? '#dc2626' : '#16a34a' },
      { label: 'Transactions', value: String(myEdges.length), color: '#6b7280' },
    ],
  })

  panels.push({
    emoji: '\uD83D\uDCB8',
    character: 'Money Tracker',
    charColor: '#7c3aed',
    charBg: '#f5f3ff',
    bubble: `Let me show you the money flow through account ${node.id.slice(0, 9)}...`,
    detail: `Here is every penny that moved through this account in the visible network. OUT means this account sent money to someone else. IN means this account received money. Large outflows right after receiving are a classic laundering sign.`,
    highlight: [
      { label: 'Total Sent Out', value: fmt(totalSent), color: '#dc2626' },
      { label: 'Total Received', value: fmt(totalRecv), color: '#16a34a' },
      { label: 'Net Flow', value: fmt(totalRecv - totalSent), color: totalRecv > totalSent ? '#16a34a' : '#dc2626' },
    ],
    tableRows: myEdges.slice(0, 6).map(e => ({
      label: (e.source === node.id ? 'OUT to ' : 'IN from ') + (e.source === node.id ? e.target : e.source).slice(0, 10),
      value: fmt(e.amount),
      flag: e.is_fraud ? 'FRAUD' : undefined,
      flagColor: '#dc2626',
    })),
  })

  if (fraudEdges.length > 0) {
    panels.push({
      emoji: '\uD83D\uDE94',
      character: 'Fraud Officer',
      charColor: '#dc2626',
      charBg: '#fef2f2',
      bubble: `I found ${fraudEdges.length} confirmed fraud transaction${fraudEdges.length > 1 ? 's' : ''} directly on this account!`,
      detail: `The dataset confirms that ${fraudEdges.length} transaction${fraudEdges.length > 1 ? 's' : ''} on account ${node.id} ${fraudEdges.length > 1 ? 'are' : 'is'} real confirmed fraud — not a prediction. These appear as thick red lines on the graph. Total fraud amount: ${fmt(fraudEdges.reduce((s, e) => s + e.amount, 0))}.`,
      highlight: [
        { label: 'Confirmed Fraud Txns', value: String(fraudEdges.length), color: '#dc2626' },
        { label: 'Total Fraud Amount', value: fmt(fraudEdges.reduce((s, e) => s + e.amount, 0)), color: '#dc2626' },
      ],
    })
  }

  panels.push({
    emoji: '\uD83E\uDDEE',
    character: 'Risk Calculator',
    charColor: '#7c3aed',
    charBg: '#f5f3ff',
    bubble: `Here is exactly how I calculated the ${(risk * 100).toFixed(0)}% risk score for this account.`,
    detail: `The risk score has two parts. BASE score (${(node.base_risk * 100).toFixed(0)}%) comes from this account own behaviour — large transactions, balance drains, suspicious types, or confirmed fraud. NETWORK score adds risk that spreads from neighbouring accounts through the graph. Formula: Risk = base + 0.30 x sum(neighbour_risk x connection_strength). Being close to a suspicious account raises your own score.`,
    highlight: [
      { label: 'Base Risk', value: `${(node.base_risk * 100).toFixed(0)}%`, color: '#6b7280' },
      { label: 'Network Added', value: `+${Math.max(0, (risk - node.base_risk) * 100).toFixed(0)}%`, color: '#7c3aed' },
      { label: 'Final Score', value: `${(risk * 100).toFixed(0)}%`, color: riskColor(risk) },
    ],
  })

  panels.push({
    emoji: risk >= 0.65 ? '\uD83D\uDED1' : risk >= 0.35 ? '\uD83D\uDCCB' : '\u2705',
    character: 'Case Supervisor',
    charColor: riskColor(risk),
    charBg: riskBg(risk),
    bubble: risk >= 0.65 ? `URGENT: Account ${node.id.slice(0, 9)} needs to be frozen right now.` : risk >= 0.35 ? `Account ${node.id.slice(0, 9)} needs manual review — do not freeze yet.` : `Account ${node.id.slice(0, 9)} is probably fine. Keep an eye on it.`,
    detail: risk >= 0.65 ? `Step 1: Freeze this account immediately to stop any further money movement. Step 2: Call the real account holder using bank records — not a number they give you. Step 3: Pull the full 90-day history and look for test transactions before this one. Step 4: Investigate every account connected to this one — fraud rings affect multiple accounts at once.` : risk >= 0.35 ? `Step 1: Add this account to the watch list. Do NOT freeze yet. Step 2: Pull the last 30 days of transaction history and look for the same patterns that triggered the main investigation. Step 3: If this account also appears in other high-risk chains, escalate it to the same priority as the center account.` : `No immediate action needed. This account appears because of its indirect connection to the investigated account — not because of its own behaviour. If the main investigation confirms a fraud ring, come back and check this account history again.`,
  })

  return panels
}

function buildEdgePanels(edge: GraphEdge, sourceNode: GraphNode | undefined, targetNode: GraphNode | undefined): Panel[] {
  const isFraud = edge.is_fraud === 1
  const srcRisk = sourceNode?.propagated_risk ?? 0
  const dstRisk = targetNode?.propagated_risk ?? 0
  const bothHigh = srcRisk >= 0.65 && dstRisk >= 0.65
  const headerColor = isFraud ? '#dc2626' : srcRisk >= 0.65 || dstRisk >= 0.65 ? '#ea580c' : '#2563eb'
  const panels: Panel[] = []

  panels.push({
    emoji: isFraud ? '\uD83D\uDC80' : edge.type === 'CASH_OUT' ? '\uD83D\uDCB5' : edge.type === 'TRANSFER' ? '\u26A1' : '\uD83D\uDCB3',
    character: isFraud ? 'Fraud Confirmed' : 'Transaction Agent',
    charColor: headerColor,
    charBg: isFraud ? '#fef2f2' : '#eff6ff',
    bubble: isFraud ? `This is a confirmed fraud transaction! ${fmt(edge.amount)} moved from ${edge.source.slice(0,9)} to ${edge.target.slice(0,9)}.` : `A ${TYPE_LABEL[edge.type] ?? edge.type} of ${fmt(edge.amount)} moved between these two accounts.`,
    detail: `Account ${edge.source} sent ${fmt(edge.amount)} to account ${edge.target} using a ${TYPE_LABEL[edge.type] ?? edge.type}. ${edge.type === 'TRANSFER' || edge.type === 'CASH_OUT' ? `Important: ${TYPE_LABEL[edge.type]} is one of only two transaction types where fraud occurs in this dataset. Every single confirmed fraud case is either a Bank Transfer or a Cash Withdrawal — fraudsters prefer these because they move money instantly and are almost impossible to reverse.` : `This transaction type has a lower inherent fraud risk — no confirmed fraud cases in the dataset use this type.`}`,
    highlight: [
      { label: 'Amount', value: fmt(edge.amount), color: headerColor },
      { label: 'Type', value: TYPE_LABEL[edge.type] ?? edge.type, color: TYPE_COLOR[edge.type] ?? '#6b7280' },
      { label: 'Status', value: isFraud ? 'CONFIRMED FRAUD' : 'Not flagged', color: isFraud ? '#dc2626' : '#16a34a' },
    ],
  })

  panels.push({
    emoji: srcRisk >= 0.65 ? '\uD83D\uDEA8' : srcRisk >= 0.35 ? '\u26A0\uFE0F' : '\uD83D\uDC64',
    character: 'Sender Profile',
    charColor: riskColor(srcRisk),
    charBg: riskBg(srcRisk),
    bubble: srcRisk >= 0.65 ? `The sender (${edge.source.slice(0,9)}) is HIGH RISK — ${(srcRisk*100).toFixed(0)}% fraud probability!` : srcRisk >= 0.35 ? `The sender (${edge.source.slice(0,9)}) shows some suspicious patterns — ${(srcRisk*100).toFixed(0)}% risk.` : `The sender (${edge.source.slice(0,9)}) looks normal — only ${(srcRisk*100).toFixed(0)}% risk.`,
    detail: srcRisk >= 0.65 ? `Account ${edge.source} is flagged as High Risk. Its own transaction patterns independently matched fraud behaviour, AND its network connections to other risky accounts further elevated the score. A high-risk sender is a major red flag for any large outgoing transaction.` : srcRisk >= 0.35 ? `Account ${edge.source} shows some suspicious signals but is not conclusively fraudulent. It may be an unwitting participant whose account was compromised, or a mid-level mule in a fraud ring.` : `Account ${edge.source} appears to be a normal account. The risk on this transaction, if any, likely comes from other factors such as the amount, type, or the receiver.`,
    highlight: [{ label: 'Sender Risk', value: `${(srcRisk*100).toFixed(0)}%`, color: riskColor(srcRisk) }, { label: 'Level', value: riskLabel(srcRisk), color: riskColor(srcRisk) }],
  })

  panels.push({
    emoji: dstRisk >= 0.65 ? '\uD83C\uDFF4\u200D\u2620\uFE0F' : dstRisk >= 0.35 ? '\uD83E\uDD14' : '\uD83C\uDFE6',
    character: 'Receiver Profile',
    charColor: riskColor(dstRisk),
    charBg: riskBg(dstRisk),
    bubble: dstRisk >= 0.65 ? `The receiver (${edge.target.slice(0,9)}) is also HIGH RISK — this money went to a suspicious account!` : dstRisk >= 0.35 ? `The receiver (${edge.target.slice(0,9)}) has some suspicious signals — ${(dstRisk*100).toFixed(0)}% risk.` : `The receiver (${edge.target.slice(0,9)}) looks normal on its own.`,
    detail: dstRisk >= 0.65 ? `Account ${edge.target} is flagged as High Risk. Sending money to a high-risk account is a major red flag — it suggests funds are being moved to a mule account or collection point in a fraud ring. The money may already be gone.` : dstRisk >= 0.35 ? `Account ${edge.target} shows elevated risk. It could be a mid-chain account — receiving stolen funds from one place and forwarding them to another. Check: did this account immediately send money onward after receiving this transaction?` : `Account ${edge.target} appears to be a normal account. Even with a low-risk receiver, the other factors — sender risk, amount, and type — may still warrant investigation.`,
    highlight: [{ label: 'Receiver Risk', value: `${(dstRisk*100).toFixed(0)}%`, color: riskColor(dstRisk) }, { label: 'Level', value: riskLabel(dstRisk), color: riskColor(dstRisk) }],
  })

  const amountScore = Math.min(edge.amount / 1000000, 1)
  const typeScore = edge.type === 'TRANSFER' ? 0.8 : edge.type === 'CASH_OUT' ? 0.75 : 0.2
  panels.push({
    emoji: '\uD83D\uDCCA',
    character: 'Risk Analyst',
    charColor: '#7c3aed',
    charBg: '#f5f3ff',
    bubble: `Let me break down every risk factor on this transaction for you.`,
    detail: `Risk is assessed across four dimensions. Amount Risk is ${(amountScore*100).toFixed(0)}% — ${edge.amount > 500000 ? 'extremely large, top 1% of all transactions.' : edge.amount > 200000 ? 'above the $200,000 high-value threshold.' : 'within normal range.'} Type Risk is ${(typeScore*100).toFixed(0)}% — ${edge.type === 'TRANSFER' || edge.type === 'CASH_OUT' ? 'this type is used in 100% of confirmed fraud cases.' : 'this type is not associated with confirmed fraud.'}`,
    tableRows: [
      { label: 'Amount risk', value: `${(amountScore*100).toFixed(0)}%`, flag: amountScore > 0.5 ? 'HIGH' : undefined, flagColor: '#dc2626' },
      { label: 'Transaction type risk', value: `${(typeScore*100).toFixed(0)}%`, flag: typeScore > 0.5 ? 'HIGH' : undefined, flagColor: '#dc2626' },
      { label: `Sender risk (${edge.source.slice(0,8)})`, value: `${(srcRisk*100).toFixed(0)}%`, flag: srcRisk >= 0.65 ? 'HIGH' : srcRisk >= 0.35 ? 'MED' : undefined, flagColor: riskColor(srcRisk) },
      { label: `Receiver risk (${edge.target.slice(0,8)})`, value: `${(dstRisk*100).toFixed(0)}%`, flag: dstRisk >= 0.65 ? 'HIGH' : dstRisk >= 0.35 ? 'MED' : undefined, flagColor: riskColor(dstRisk) },
    ],
  })

  panels.push({
    emoji: isFraud ? '\uD83D\uDED1' : bothHigh ? '\u26A0\uFE0F' : srcRisk >= 0.65 || dstRisk >= 0.65 ? '\uD83D\uDCCB' : '\u2705',
    character: 'Case Supervisor',
    charColor: isFraud ? '#dc2626' : bothHigh ? '#ea580c' : srcRisk >= 0.65 || dstRisk >= 0.65 ? '#ea580c' : '#16a34a',
    charBg: isFraud ? '#fef2f2' : bothHigh ? '#fff7ed' : srcRisk >= 0.65 || dstRisk >= 0.65 ? '#fff7ed' : '#f0fdf4',
    bubble: isFraud ? `This confirmed fraud transaction requires immediate action on both accounts.` : bothHigh ? `Both sender and receiver are High Risk — treat this as fraud until proven otherwise.` : srcRisk >= 0.65 || dstRisk >= 0.65 ? `At least one high-risk account is involved — this transaction needs investigation.` : `This transaction appears normal. No immediate action needed.`,
    detail: isFraud ? `Step 1: Freeze account ${edge.source} immediately — prevent further outflows. Step 2: Freeze account ${edge.target} immediately — likely a mule account. Step 3: If the ${fmt(edge.amount)} is still in the receiver account, place a legal hold before it is moved. Step 4: File a Suspicious Activity Report (SAR) with FinCEN within 30 days — legally required for confirmed fraud.` : srcRisk >= 0.65 || dstRisk >= 0.65 ? `Step 1: Flag both accounts for manual review. Step 2: Pull the transaction history for account ${edge.target} — did it immediately send this money onward? That would be a laundering red flag. Step 3: Pull 90-day histories for both sender and receiver and look for coordinated activity patterns.` : `No immediate action needed. Keep this transaction in mind if the investigation widens. If a fraud ring is confirmed around the center account, check whether these two accounts have other connections to the ring.`,
  })

  return panels
}

interface AnimStep {
  agent: string; agentColor: string; agentBg: string
  type: 'thinking'|'info'|'match'|'alert'|'verdict'
  title: string; detail: string; data?: string
  table?: {step:number;from:string;to:string;type:string;amount:number;highlight:string}[]
}

function buildAnimSteps(detail: MAPFConflictDetail, all: MAPFConflictDetail[]): AnimStep[] {
  const s: AnimStep[] = [], diff = detail.step_difference
  s.push({ agent:'MAPF Engine', agentColor:'#818cf8', agentBg:'#1e1b4b', type:'thinking', title:'Initialising Multi-Agent Path Finding analysis...', detail:'MAPF models every bank account as an agent moving through time. We look for agents converging on the same destination in a narrow window — a hallmark of coordinated fraud rings.' })
  s.push({ agent:'MAPF Engine', agentColor:'#818cf8', agentBg:'#1e1b4b', type:'info', title:`${all.length} conflict${all.length!==1?'s':''} detected around account ${detail.center_account}`, detail:`Detection window: +/-${detail.window} steps. If another account sends the same transaction type to the same destination within ${detail.window} steps, it counts as a coordinated path conflict.`, data:`Center: ${detail.center_account}  |  Window: +/-${detail.window} steps  |  Type: ${detail.tx_type}` })
  s.push({ agent:'Timeline Agent', agentColor:'#34d399', agentBg:'#065f46', type:'info', title:'What does step mean?', detail:'Each step = one transaction cycle, roughly one hour of real banking time. Steps are sequential time markers that order events in the simulation.', data:`Competitor at step: ${detail.competitor_step}  |  Center at step: ${detail.center_step}  |  Difference: ${diff} step${diff!==1?'s':''}` })
  s.push({ agent:'Timeline Agent', agentColor:'#34d399', agentBg:'#065f46', type:'match', title:`Actual transactions in the conflict window around step ${detail.competitor_step}`, detail:`Real transactions from the dataset within ${detail.window} steps. Highlighted rows triggered the MAPF alert.`, table:detail.step_context.map(sc=>({step:sc.step,from:sc.from,to:sc.to,type:sc.type,amount:sc.amount,highlight:sc.highlight})) })
  s.push({ agent:'Path Detector', agentColor:'#fb923c', agentBg:'#7c2d12', type:'alert', title:'Conflict confirmed: Two accounts hit the same destination', detail:`Account ${detail.competitor_account} sent a ${TYPE_LABEL[detail.tx_type]??detail.tx_type} of ${fmt(detail.competitor_amount)} to ${detail.destination}. The center account also sent there within ${detail.window} steps.`, data:`Agent 1 (center): ${detail.center_account} step ${detail.center_step}\nAgent 2: ${detail.competitor_account} step ${detail.competitor_step} — ${fmt(detail.competitor_amount)}` })
  const odds = all.length>=3?'3+ conflicts: probability of coincidence below 0.1%.':all.length===2?'2 conflicts: probability under 2%.':'1 conflict: suspicious but not definitive.'
  s.push({ agent:'Fraud Analyst', agentColor:'#f43f5e', agentBg:'#881337', type:'alert', title:'Why this coordination pattern matters', detail:`Independent accounts rarely target the same dormant account in the same narrow time window. ${odds} This is consistent with a fraud ring controller directing multiple accounts simultaneously.`, data:`Total conflicts: ${all.length}  |  Ring size: at least ${all.length+1} accounts` })
  s.push({ agent:'GNN Propagator', agentColor:'#a78bfa', agentBg:'#3b0764', type:'info', title:'Risk scores elevated across the network', detail:'Formula: Risk(node) = base_risk + 0.30 x sum(neighbour_risk x edge_weight). Being near a conflict raises your risk score.', data:`${detail.competitor_account} raised  |  ${detail.destination} raised  |  All connected nodes updated` })
  const vt = all.length>=3?`HIGH CONFIDENCE: Fraud ring — ${all.length} coordinated paths`:all.length===2?'MEDIUM-HIGH: 2 conflicts confirmed':'SUSPICIOUS: 1 conflict found'
  s.push({ agent:'MAPF Verdict', agentColor:'#818cf8', agentBg:'#1e1b4b', type:'verdict', title:vt, detail:all.length>=2?`${all.length} accounts converged on the same destination. Textbook fraud ring. Investigate all together.`:'One event. Cross-reference with GNN scores before escalating.', data:`Action: ${all.length>=2?'Freeze all + escalate + file SAR':'Flag for review + monitor'}` })
  return s
}

function AnimBubble({ step, visible, isLast }: { step:AnimStep; visible:boolean; isLast:boolean }) {
  const cfg = { thinking:{bg:'#f8fafc',border:'#e2e8f0',label:'analysing',lc:'#64748b'}, info:{bg:'#eff6ff',border:'#bfdbfe',label:'info',lc:'#2563eb'}, match:{bg:'#fff7ed',border:'#fed7aa',label:'match',lc:'#ea580c'}, alert:{bg:'#fef2f2',border:'#fecaca',label:'alert',lc:'#dc2626'}, verdict:{bg:'#f5f3ff',border:'#ddd6fe',label:'verdict',lc:'#7c3aed'} }[step.type]
  return (
    <div style={{ display:'flex', gap:10, alignItems:'flex-start', opacity:visible?1:0, transform:visible?'translateY(0)':'translateY(14px)', transition:'opacity .4s ease, transform .4s ease', marginBottom:isLast?0:14 }}>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3, flexShrink:0, paddingTop:2 }}>
        <div style={{ width:28, height:28, borderRadius:'50%', background:step.agentBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:800, color:step.agentColor, border:`2px solid ${step.agentColor}40` }}>{step.agent.slice(0,2).toUpperCase()}</div>
        {!isLast && <div style={{ width:1, flex:1, minHeight:10, background:'var(--gray-200)' }}/>}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4, flexWrap:'wrap' }}>
          <span style={{ fontSize:10, fontWeight:700, color:step.agentColor }}>{step.agent}</span>
          <span style={{ fontSize:9, padding:'1px 6px', borderRadius:10, background:cfg.bg, border:`1px solid ${cfg.border}`, color:cfg.lc, fontWeight:600 }}>{cfg.label}</span>
        </div>
        <div style={{ background:cfg.bg, border:`1px solid ${cfg.border}`, borderRadius:8, padding:'10px 12px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:step.detail?6:0 }}>
            {step.type==='thinking' && <span style={{ display:'inline-flex', gap:2 }}>{[0,1,2].map(i=><span key={i} style={{ width:4, height:4, borderRadius:'50%', background:'#94a3b8', display:'inline-block', animation:`dotpulse 1.2s ${i*0.2}s infinite` }}/>)}</span>}
            <span style={{ fontSize:12, fontWeight:700, color:cfg.lc }}>{step.title}</span>
          </div>
          {step.detail && <div style={{ fontSize:11, color:'var(--gray-600)', lineHeight:1.75 }}>{step.detail}</div>}
          {step.table && (
            <div style={{ marginTop:10, borderRadius:6, overflow:'hidden', border:'1px solid var(--gray-200)' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
                <thead><tr style={{ background:'#1e1b4b' }}>{['Step','From','To','Type','Amount','Flag'].map(h=><th key={h} style={{ padding:'5px 8px', textAlign:'left', color:'#a5b4fc', fontWeight:600, fontSize:9, textTransform:'uppercase' }}>{h}</th>)}</tr></thead>
                <tbody>{step.table.map((row,ri)=>{ const iC=row.highlight==='competitor', iCe=row.highlight==='center', iF=row.highlight==='fraud'; return (<tr key={ri} style={{ background:iC?'#fef2f2':iCe?'#eff6ff':iF?'#fff7ed':ri%2===0?'#fff':'#f9fafb', borderBottom:'1px solid var(--gray-100)' }}><td style={{ padding:'5px 8px', fontFamily:'var(--mono)', fontWeight:iC||iCe?700:400, color:iC?'#dc2626':iCe?'#2563eb':'var(--gray-600)' }}>{row.step}</td><td style={{ padding:'5px 8px', fontFamily:'var(--mono)', fontSize:9 }}>{row.from.slice(0,9)}</td><td style={{ padding:'5px 8px', fontFamily:'var(--mono)', fontSize:9 }}>{row.to.slice(0,9)}</td><td style={{ padding:'5px 8px', color:TYPE_COLOR[row.type]??'#6b7280', fontWeight:600, fontSize:9 }}>{TYPE_LABEL[row.type]?.split(' ')[0]??row.type}</td><td style={{ padding:'5px 8px', fontFamily:'var(--mono)', fontWeight:iC||iCe?700:400 }}>{fmt(row.amount)}</td><td style={{ padding:'5px 8px' }}>{iC&&<span style={{ background:'#fef2f2',color:'#dc2626',border:'1px solid #fecaca',padding:'1px 5px',borderRadius:3,fontSize:8,fontWeight:700 }}>COMPETITOR</span>}{iCe&&<span style={{ background:'#eff6ff',color:'#2563eb',border:'1px solid #bfdbfe',padding:'1px 5px',borderRadius:3,fontSize:8,fontWeight:700 }}>CENTER</span>}{iF&&<span style={{ background:'#fff7ed',color:'#ea580c',border:'1px solid #fed7aa',padding:'1px 5px',borderRadius:3,fontSize:8,fontWeight:700 }}>FRAUD</span>}</td></tr>) })}</tbody>
              </table>
            </div>
          )}
          {step.data && <div style={{ marginTop:8, padding:'5px 8px', background:'rgba(0,0,0,.04)', borderRadius:4, fontSize:10, fontFamily:'var(--mono)', color:cfg.lc, whiteSpace:'pre-wrap', lineHeight:1.6 }}>{step.data}</div>}
        </div>
      </div>
    </div>
  )
}

function MAPFLightbox({ conflicts,details,center,onClose }:{ conflicts:string[];details:MAPFConflictDetail[];center:string;onClose:()=>void }) {
  const [ai,setAi]=useState(0);const [vc,setVc]=useState(0);const [playing,setPlaying]=useState(true);const [speed,setSpeed]=useState(900)
  const scrollRef=useRef<HTMLDivElement>(null);const timerRef=useRef<ReturnType<typeof setInterval>|null>(null)
  const ad=details[ai]??null;const steps=ad?buildAnimSteps(ad,details):[]
  useEffect(()=>{setVc(0);setPlaying(true)},[ai])
  useEffect(()=>{ if(playing&&vc<steps.length){ timerRef.current=setInterval(()=>{setVc(c=>{if(c+1>=steps.length)setPlaying(false);return c+1})},speed) } return()=>{if(timerRef.current)clearInterval(timerRef.current)} },[playing,speed,steps.length,vc])
  useEffect(()=>{scrollRef.current?.scrollTo({top:scrollRef.current.scrollHeight,behavior:'smooth'})},[vc])
  useEffect(()=>{ const h=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()}; window.addEventListener('keydown',h); return()=>window.removeEventListener('keydown',h) },[onClose])
  return (
    <div onClick={e=>{if(e.target===e.currentTarget)onClose()}} style={{ position:'fixed',inset:0,zIndex:9999,background:'rgba(15,23,42,.82)',display:'flex',alignItems:'center',justifyContent:'center',padding:20,backdropFilter:'blur(4px)' }}>
      <div style={{ background:'#fff',borderRadius:16,width:'100%',maxWidth:740,height:'92vh',maxHeight:820,display:'flex',flexDirection:'column',boxShadow:'0 25px 60px rgba(0,0,0,.35)',overflow:'hidden' }}>
        <div style={{ background:'linear-gradient(135deg,#1e1b4b,#312e81)',padding:'14px 20px',display:'flex',alignItems:'center',gap:12,flexShrink:0 }}>
          <div style={{ width:38,height:38,borderRadius:10,background:'#4f46e5',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,color:'#fff',fontSize:20,flexShrink:0 }}>M</div>
          <div style={{ flex:1 }}><div style={{ color:'#fff',fontWeight:800,fontSize:14 }}>MAPF Coordinated Fraud Analysis</div><div style={{ color:'#818cf8',fontSize:11 }}>Multi-Agent Path Finding — animated step-by-step</div></div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,.1)',border:'none',color:'#a5b4fc',width:30,height:30,borderRadius:'50%',cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--font)' }}>x</button>
        </div>
        <div style={{ background:'#312e81',padding:'8px 20px',display:'flex',gap:20,alignItems:'center',flexShrink:0,flexWrap:'wrap' }}>
          {[{label:'Conflicts',value:conflicts.length,color:'#f87171'},{label:'Accounts in ring',value:conflicts.length+1,color:'#fb923c'},{label:'Steps',value:steps.length,color:'#a5b4fc'}].map(s=><div key={s.label}><div style={{ fontSize:20,fontWeight:800,color:s.color,fontFamily:'var(--mono)',lineHeight:1 }}>{s.value}</div><div style={{ fontSize:9,color:'#818cf8',textTransform:'uppercase',letterSpacing:'.05em' }}>{s.label}</div></div>)}
          <div style={{ marginLeft:'auto',fontSize:10,color:'#818cf8' }}>Center: <strong style={{ color:'#a5b4fc' }}>{center}</strong></div>
        </div>
        {details.length>1&&<div style={{ padding:'8px 16px',borderBottom:'1px solid var(--gray-200)',background:'var(--gray-50)',display:'flex',gap:6,flexShrink:0,overflowX:'auto' }}><span style={{ fontSize:10,color:'var(--gray-400)',alignSelf:'center',whiteSpace:'nowrap',marginRight:4 }}>Select:</span>{details.map((d,i)=><button key={i} onClick={()=>setAi(i)} style={{ padding:'4px 12px',borderRadius:20,border:'none',cursor:'pointer',fontSize:11,fontWeight:600,fontFamily:'var(--font)',whiteSpace:'nowrap',background:ai===i?'#4f46e5':'var(--gray-200)',color:ai===i?'#fff':'var(--gray-600)',transition:'all .15s' }}>Conflict {i+1}</button>)}</div>}
        {ad&&<div style={{ padding:'8px 16px',background:'#faf5ff',borderBottom:'1px solid #e9d5ff',flexShrink:0 }}><div style={{ fontSize:11,color:'#6d28d9',lineHeight:1.6 }}><strong>{ad.competitor_account}</strong> sent {fmt(ad.competitor_amount)} to <strong>{ad.destination}</strong> at step <strong>{ad.competitor_step}</strong>{ad.step_difference>0?` — ${ad.step_difference} step${ad.step_difference!==1?'s':''} from center`:' — same step as center'}.</div></div>}
        <div ref={scrollRef} style={{ flex:1,overflowY:'auto',padding:'16px 20px' }}>
          {steps.map((step,i)=><AnimBubble key={`${ai}-${i}`} step={step} visible={i<vc} isLast={i===steps.length-1}/>)}
          {vc>=steps.length&&steps.length>0&&<div style={{ textAlign:'center',padding:'14px 0',fontSize:12,color:'#7c3aed',fontWeight:700 }}>Done — conflict {ai+1} of {details.length}{ai<details.length-1&&<button onClick={()=>setAi(x=>x+1)} style={{ marginLeft:12,padding:'4px 12px',borderRadius:6,border:'none',background:'#4f46e5',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'var(--font)' }}>Next conflict</button>}</div>}
        </div>
        <div style={{ padding:'10px 20px',borderTop:'1px solid var(--gray-200)',background:'var(--gray-50)',flexShrink:0 }}>
          <div style={{ height:4,background:'var(--gray-200)',borderRadius:2,marginBottom:10,overflow:'hidden' }}><div style={{ height:'100%',width:`${steps.length>0?(vc/steps.length)*100:0}%`,background:'linear-gradient(90deg,#4f46e5,#7c3aed)',borderRadius:2,transition:'width .3s' }}/></div>
          <div style={{ display:'flex',alignItems:'center',gap:8 }}>
            <span style={{ fontSize:10,color:'var(--gray-400)',fontFamily:'var(--mono)' }}>{vc}/{steps.length}</span>
            <div style={{ display:'flex',gap:6,marginLeft:'auto' }}>
              <button onClick={()=>{setVc(0);setPlaying(true)}} style={{ padding:'5px 11px',borderRadius:6,border:'1px solid var(--gray-200)',background:'#fff',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'var(--font)',color:'var(--gray-700)' }}>Restart</button>
              {playing?<button onClick={()=>setPlaying(false)} style={{ padding:'5px 11px',borderRadius:6,border:'1px solid var(--gray-300)',background:'#fff',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'var(--font)',color:'var(--gray-700)' }}>Pause</button>:vc<steps.length?<button onClick={()=>setPlaying(true)} style={{ padding:'5px 11px',borderRadius:6,border:'1px solid #bfdbfe',background:'#eff6ff',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'var(--font)',color:'#2563eb' }}>Resume</button>:null}
              <button onClick={()=>{setVc(steps.length);setPlaying(false)}} style={{ padding:'5px 11px',borderRadius:6,border:'none',background:'#4f46e5',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'var(--font)' }}>Show All</button>
              <select value={speed} onChange={e=>setSpeed(Number(e.target.value))} style={{ padding:'4px 8px',borderRadius:6,border:'1px solid var(--gray-200)',fontSize:11,fontFamily:'var(--font)',background:'#fff',color:'var(--gray-700)' }}><option value={1800}>Slow</option><option value={900}>Normal</option><option value={350}>Fast</option><option value={80}>Very Fast</option></select>
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes dotpulse{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1);opacity:1}}`}</style>
    </div>
  )
}

function MAPFConflictBar({ conflicts,details,center }:{ conflicts:string[];details:MAPFConflictDetail[];center:string }) {
  const [show,setShow]=useState(false)
  return (
    <>
      {show&&<MAPFLightbox conflicts={conflicts} details={details} center={center} onClose={()=>setShow(false)}/>}
      <div style={{ borderTop:'1px solid #e9d5ff',background:'linear-gradient(135deg,#faf5ff,#eff6ff)',flexShrink:0 }}>
        <button onClick={()=>setShow(true)} style={{ width:'100%',padding:'9px 14px',background:'none',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:10,fontFamily:'var(--font)',textAlign:'left' }} onMouseEnter={e=>(e.currentTarget.style.background='rgba(99,102,241,.07)')} onMouseLeave={e=>(e.currentTarget.style.background='none')}>
          <div style={{ width:30,height:30,borderRadius:8,background:'linear-gradient(135deg,#4f46e5,#7c3aed)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,color:'#fff',fontSize:16,flexShrink:0 }}>M</div>
          <div style={{ flex:1 }}><div style={{ fontSize:12,fontWeight:700,color:'#4f46e5' }}>Coordinated Fraud Pattern Detected</div><div style={{ fontSize:10,color:'#818cf8',marginTop:1 }}>{conflicts.length} MAPF conflict{conflicts.length!==1?'s':''} — click for animated investigation</div></div>
          <span style={{ background:'#fef2f2',color:'#dc2626',border:'1px solid #fecaca',fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:10 }}>{conflicts.length} conflict{conflicts.length!==1?'s':''}</span>
        </button>
      </div>
    </>
  )
}

export default function GraphComponent({ graph, loading, centerEntity }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [nodeLB, setNodeLB] = useState<GraphNode | null>(null)
  const [edgeLB, setEdgeLB] = useState<GraphEdge | null>(null)
  const nodeById = Object.fromEntries((graph?.nodes ?? []).map(n => [n.id, n]))

  useEffect(() => {
    if (!graph || !svgRef.current || !wrapRef.current) return
    const W = wrapRef.current.clientWidth || 600
    const H = wrapRef.current.clientHeight || 280
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', W).attr('height', H)
    const g = svg.append('g')
    svg.call(d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 4]).on('zoom', e => g.attr('transform', e.transform.toString())))
    svg.on('click', () => { setNodeLB(null); setEdgeLB(null) })

    const nodes: any[] = graph.nodes.map(n => ({ ...n }))
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]))
    const links: any[] = graph.edges.filter(e => byId[e.source] && byId[e.target]).map(e => ({ ...e, source: byId[e.source], target: byId[e.target] }))
    const sim = d3.forceSimulation(nodes).force('link', d3.forceLink(links).distance(110).strength(0.35)).force('charge', d3.forceManyBody().strength(-280)).force('center', d3.forceCenter(W / 2, H / 2)).force('collision', d3.forceCollide(36))

    const link = g.selectAll('line').data(links).join('line')
      .attr('stroke', d => d.is_fraud ? '#dc2626' : '#d1d5db')
      .attr('stroke-width', d => d.is_fraud ? 3 : 2)
      .attr('stroke-opacity', d => d.is_fraud ? 0.85 : 0.4)
      .attr('stroke-dasharray', d => d.is_fraud ? '0' : '5,3')
      .attr('cursor', 'pointer')
      .on('mouseenter', function(_, d) { d3.select(this).attr('stroke-opacity', 1).attr('stroke-width', d.is_fraud ? 5 : 3.5) })
      .on('mouseleave', function(_, d) { d3.select(this).attr('stroke-opacity', d.is_fraud ? 0.85 : 0.4).attr('stroke-width', d.is_fraud ? 3 : 2) })
      .on('click', function(ev, d) { ev.stopPropagation(); const orig = graph.edges.find(e => e.source === d.source.id && e.target === d.target.id); if (orig) { setNodeLB(null); setEdgeLB(orig) } })

    g.selectAll('text.el').data(links.filter(l => l.is_fraud)).join('text').attr('class', 'el').attr('font-size', 9).attr('fill', '#dc2626').attr('text-anchor', 'middle').attr('font-family', 'var(--mono)').attr('pointer-events', 'none').text(d => `$${(d.amount / 1000).toFixed(0)}k`)

    const isC = (d: any) => d.id === centerEntity
    const node = g.selectAll<SVGGElement, any>('g.nd').data(nodes).join('g').attr('class', 'nd').style('cursor', 'pointer')
      .call(d3.drag<SVGGElement, any>().on('start', (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y }).on('drag', (ev, d) => { d.fx = ev.x; d.fy = ev.y }).on('end', (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null }))
      .on('mouseenter', function(_, d) { const r = isC(d) ? 22 : Math.max(13, 10 + d.propagated_risk * 12); d3.select(this).select('circle.main').attr('r', r * 1.2) })
      .on('mouseleave', function(_, d) { const r = isC(d) ? 22 : Math.max(13, 10 + d.propagated_risk * 12); d3.select(this).select('circle.main').attr('r', r) })
      .on('click', function(ev, d) { ev.stopPropagation(); const gn = graph.nodes.find(n => n.id === d.id); if (gn) { setEdgeLB(null); setNodeLB(gn) } })

    node.filter(isC).append('circle').attr('r', 36).attr('fill', 'none').attr('stroke', '#dc2626').attr('stroke-width', 1.5).attr('stroke-opacity', 0.3).attr('stroke-dasharray', '5,3')
    node.append('circle').attr('class', 'main').attr('r', d => isC(d) ? 22 : Math.max(13, 10 + d.propagated_risk * 12)).attr('fill', d => riskColor(d.propagated_risk)).attr('stroke', '#fff').attr('stroke-width', d => isC(d) ? 3 : 2).attr('opacity', 0.93)
    node.append('text').attr('text-anchor', 'middle').attr('dominant-baseline', 'central').attr('font-size', d => isC(d) ? 14 : 10).attr('pointer-events', 'none').attr('fill', '#fff').attr('font-weight', 'bold').text(d => d.type === 'merchant' ? 'M' : isC(d) ? 'S' : 'A')
    node.append('text').attr('text-anchor', 'middle').attr('dy', d => (isC(d) ? 22 : Math.max(13, 10 + d.propagated_risk * 12)) + 13).attr('font-size', 8).attr('font-family', 'var(--mono)').attr('fill', 'var(--gray-400)').attr('pointer-events', 'none').text(d => d.id.slice(0, 9))
    node.append('title').text(d => `Click to investigate\nAccount: ${d.id}\nRisk: ${(d.propagated_risk * 100).toFixed(0)}% (${riskLabel(d.propagated_risk)})`)

    sim.on('tick', () => {
      link.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y)
      g.selectAll('text.el').attr('x', d => ((d as any).source.x + (d as any).target.x) / 2).attr('y', d => ((d as any).source.y + (d as any).target.y) / 2 - 6)
      node.attr('transform', d => `translate(${d.x},${d.y})`)
    })
    return () => { sim.stop() }
  }, [graph, centerEntity])

  const nodePanels = nodeLB ? buildNodePanels(nodeLB, graph?.edges ?? [], centerEntity) : []
  const edgePanels = edgeLB ? buildEdgePanels(edgeLB, nodeById[edgeLB.source], nodeById[edgeLB.target]) : []
  const nodeHeaderColor = nodeLB ? riskColor(nodeLB.propagated_risk) : '#2563eb'
  const edgeHeaderColor = edgeLB ? (edgeLB.is_fraud ? '#dc2626' : Math.max(nodeById[edgeLB.source]?.propagated_risk ?? 0, nodeById[edgeLB.target]?.propagated_risk ?? 0) >= 0.65 ? '#ea580c' : '#2563eb') : '#2563eb'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      {nodeLB && <StoryLightbox title={`Account ${nodeLB.id}`} subtitle={nodeLB.id === centerEntity ? 'Investigation center' : nodeLB.type === 'merchant' ? 'Merchant account' : `Connected account — ${riskLabel(nodeLB.propagated_risk)}`} headerColor={nodeHeaderColor} panels={nodePanels} onClose={() => setNodeLB(null)}/>}
      {edgeLB && <StoryLightbox title={`${fmt(edgeLB.amount)} — ${TYPE_LABEL[edgeLB.type] ?? edgeLB.type}`} subtitle={edgeLB.is_fraud ? 'CONFIRMED FRAUD TRANSACTION' : `From ${edgeLB.source.slice(0,10)} to ${edgeLB.target.slice(0,10)}`} headerColor={edgeHeaderColor} panels={edgePanels} onClose={() => setEdgeLB(null)}/>}

      <div style={{ padding: '7px 14px', borderBottom: '1px solid var(--gray-200)', background: 'var(--gray-50)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-700)' }}>Money Flow Network</span>
        <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>Click any circle or line for the full story</span>
        {graph && <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--gray-400)' }}>{graph.stats.node_count} accounts · {graph.stats.edge_count} transactions{graph.stats.conflict_count > 0 ? ` · ${graph.stats.conflict_count} MAPF` : ''}</span>}
      </div>
      <div style={{ padding: '4px 14px', borderBottom: '1px solid var(--gray-100)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
        {[['#dc2626','High risk'],['#ea580c','Medium'],['#16a34a','Low risk']].map(([c,l]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--gray-500)' }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: c }}/>{l}</div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--gray-500)' }}><div style={{ width: 18, height: 2, background: '#dc2626', borderRadius: 1 }}/>Fraud line</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--gray-500)' }}><div style={{ width: 18, height: 1, background: '#d1d5db', borderRadius: 1 }}/>Normal line</div>
        <div style={{ fontSize: 10, color: 'var(--gray-400)', marginLeft: 'auto' }}>S=selected · M=merchant · A=account — click anything</div>
      </div>

      <div ref={wrapRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loading && <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 20, gap: 10 }}><div style={{ width: 22, height: 22, borderRadius: '50%', border: '3px solid #dc2626', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }}/><div style={{ fontSize: 12, color: 'var(--gray-500)' }}>Building money flow map...</div><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>}
        {!graph && !loading && <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--gray-400)' }}><div style={{ fontSize: 28, fontWeight: 700, color: 'var(--gray-200)' }}>NET</div><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-500)' }}>Money Flow Network</div><div style={{ fontSize: 12, textAlign: 'center', maxWidth: 280, lineHeight: 1.7 }}>Select a transaction from the table. Then click any circle or line to read its full story.</div></div>}
        <svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block' }}/>
      </div>

      {graph?.mapf_conflicts && graph.mapf_conflicts.length > 0 && <MAPFConflictBar conflicts={graph.mapf_conflicts} details={graph.mapf_details ?? []} center={centerEntity}/>}
    </div>
  )
}
