import { useState, useEffect, useRef } from 'react'
import type { Transaction } from '../api/api'

interface Props { tx: Transaction | null }

const TYPE_LABEL: Record<string, string> = {
  TRANSFER: 'Bank Transfer', CASH_OUT: 'Cash Withdrawal',
  PAYMENT: 'Payment', DEBIT: 'Debit', CASH_IN: 'Deposit',
}
const fmt = (n: number) => '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 })

const LEVEL_CFG: Record<string, { bg: string; color: string; border: string; label: string }> = {
  critical: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', label: 'Critical' },
  high:     { bg: '#fff7ed', color: '#ea580c', border: '#fed7aa', label: 'High'     },
  medium:   { bg: '#fefce8', color: '#ca8a04', border: '#fde047', label: 'Medium'   },
  low:      { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0', label: 'Low'      },
}
const URGENCY_CFG = {
  immediate:   { bg: '#fef2f2', color: '#dc2626', label: 'Do this NOW' },
  today:       { bg: '#fff7ed', color: '#ea580c', label: 'Do today'    },
  'this-week': { bg: '#eff6ff', color: '#2563eb', label: 'This week'   },
}

// ─────────────────────────────────────────────────────────────────
// DATA BUILDERS (unchanged logic, same as before)
// ─────────────────────────────────────────────────────────────────
function getMistakes(tx: Transaction) {
  const ids = tx.triggered_rules.map(r => r.id)
  const out: { title: string; detail: string; emoji: string; character: string; charColor: string; charBg: string }[] = []

  if (ids.includes('balance_drain'))
    out.push({
      emoji: 'DRAIN', character: 'Drain Detective',
      charColor: '#dc2626', charBg: '#fef2f2',
      title: 'The entire account was emptied in one transaction',
      detail: `The sender had ${fmt(tx.oldbalanceOrg)} and transferred everything, leaving exactly $0.00. Legitimate users almost never empty their entire account in a single transaction. This is the strongest single indicator of fraud — it tells us someone wanted all the money gone immediately.`,
    })
  if (ids.includes('dest_zero_to_large'))
    out.push({
      emoji: 'MULE', character: 'Mule Hunter',
      charColor: '#7c3aed', charBg: '#f5f3ff',
      title: 'Money was sent to a dormant mule account',
      detail: `The receiving account had $0.00 before this transaction and suddenly received ${fmt(tx.newbalanceDest)}. This is a classic money mule pattern — a fake or hijacked account created purely to receive stolen funds and move them elsewhere before investigators can react.`,
    })
  if (ids.includes('high_amount') && tx.amount > 500000)
    out.push({
      emoji: 'BIG', character: 'Amount Analyst',
      charColor: '#ea580c', charBg: '#fff7ed',
      title: 'An unusually large sum moved in a single transaction',
      detail: `${fmt(tx.amount)} is in the top 1% of all transactions in this dataset. Fraudsters prefer large single transfers when speed is critical — for example during an account takeover, they want to move as much as possible before the victim or bank notices anything unusual.`,
    })
  if (ids.includes('risky_type') && tx.type === 'TRANSFER')
    out.push({
      emoji: 'WIRE', character: 'Transfer Agent',
      charColor: '#2563eb', charBg: '#eff6ff',
      title: 'Bank Transfers are the most common fraud vehicle',
      detail: 'TRANSFER transactions move money directly between accounts with no merchant involved. They are fast, hard to reverse, and easy to chain through multiple accounts — making tracing extremely difficult. This type is used in every confirmed fraud case in this dataset.',
    })
  if (ids.includes('risky_type') && tx.type === 'CASH_OUT')
    out.push({
      emoji: 'CASH', character: 'Cash Tracker',
      charColor: '#ea580c', charBg: '#fff7ed',
      title: 'Cash Withdrawal — used to extract stolen funds',
      detail: 'CASH_OUT is the final step in many fraud chains — someone who received stolen funds tries to convert them to cash before detection. Once converted to cash, recovery is nearly impossible. This is why CASH_OUT, alongside TRANSFER, accounts for 100% of confirmed fraud in this dataset.',
    })
  if (ids.includes('balance_mismatch'))
    out.push({
      emoji: 'MATH', character: 'Numbers Inspector',
      charColor: '#ca8a04', charBg: '#fefce8',
      title: 'The transaction numbers do not add up correctly',
      detail: `The sender balance went from ${fmt(tx.oldbalanceOrg)} to ${fmt(tx.newbalanceOrig)}, but the declared amount was ${fmt(tx.amount)}. The arithmetic does not reconcile — this suggests a hidden split transaction or deliberate manipulation of the records to obscure the true flow of money.`,
    })
  if (ids.includes('system_flagged'))
    out.push({
      emoji: 'FLAG', character: 'System Alert',
      charColor: '#dc2626', charBg: '#fef2f2',
      title: "The bank's own automated system already flagged this",
      detail: 'The isFlaggedFraud field shows the original real-time fraud filter also raised an alert independently — before our AI even ran. When two completely separate systems both flag the same transaction, confidence in the fraud assessment is significantly higher.',
    })
  if (out.length === 0 && tx.risk_level === 'High')
    out.push({
      emoji: 'AI', character: 'AI Analyst',
      charColor: '#7c3aed', charBg: '#f5f3ff',
      title: 'Unusual statistical pattern detected by AI',
      detail: `No single rule was violated, but the combination of ${TYPE_LABEL[tx.type]}, amount of ${fmt(tx.amount)}, and balance patterns is statistically highly anomalous compared to the full dataset of 3,080 transactions. The ML model identified this as an outlier.`,
    })
  return out
}

function getScenarios(tx: Transaction) {
  const ids = tx.triggered_rules.map(r => r.id)
  const out: { level: 'critical'|'high'|'medium'|'low'; scenario: string; detail: string; probability: number }[] = []
  if (ids.includes('balance_drain') && ids.includes('dest_zero_to_large'))
    out.push({ level: 'critical', scenario: 'Account Takeover + Fund Extraction', probability: 92, detail: 'A fraudster gained access to the victim account via phishing, malware, or purchased credentials and immediately transferred all funds to a pre-arranged mule account before the victim could react.' })
  if (tx.type === 'TRANSFER' && ids.includes('high_amount'))
    out.push({ level: 'critical', scenario: 'Social Engineering / Phishing Scam', probability: 78, detail: 'The account holder was psychologically manipulated into authorising a large transfer — via a fake bank phone call, romance scam, fake investment opportunity, or impersonation of a trusted authority.' })
  if (tx.type === 'CASH_OUT')
    out.push({ level: 'high', scenario: 'Stolen Credentials Cashout', probability: 71, detail: 'Stolen account credentials were used to log in and cash out the balance before the real owner noticed the intrusion. Credentials may have been bought from a dark web marketplace or obtained via data breach.' })
  if (ids.includes('dest_zero_to_large'))
    out.push({ level: 'high', scenario: 'Money Mule Network Operation', probability: 68, detail: 'The destination account is operating as a money mule — receiving stolen funds and forwarding them. The account holder may be an unwitting participant recruited online, or the account may have been opened with fake identity documents.' })
  if (ids.includes('balance_mismatch'))
    out.push({ level: 'medium', scenario: 'Structuring / Transaction Splitting', probability: 45, detail: 'The balance mismatch suggests this may be part of a series of transactions deliberately broken into smaller amounts to avoid detection thresholds — a technique called structuring or smurfing used to launder money.' })
  out.push({ level: 'low', scenario: 'Legitimate Transaction — False Positive', probability: Math.max(5, Math.round((1 - tx.risk_score) * 100)), detail: `There is a ${(100 - tx.risk_score * 100).toFixed(0)}% chance this is a genuine transaction that happens to match fraud patterns — such as closing an account, a one-time large purchase, or moving money between own accounts at different banks.` })
  return out
}

function getActions(tx: Transaction) {
  const ids = tx.triggered_rules.map(r => r.id)
  const out: { priority: number; urgency: 'immediate'|'today'|'this-week'; action: string; reason: string }[] = []
  if (tx.risk_level === 'High')
    out.push({ priority: 1, urgency: 'immediate', action: 'Freeze both accounts immediately', reason: `Freeze the sender (${tx.nameOrig}) AND the receiver (${tx.nameDest}) right now. Every minute the receiver account stays open, funds could be moved through more hops that make tracing impossible.` })
  if (ids.includes('balance_drain') || tx.risk_level === 'High')
    out.push({ priority: 2, urgency: 'immediate', action: 'Contact the account owner using bank records', reason: `Call the registered phone number for ${tx.nameOrig} — do NOT use a number they provide now. Ask: Did you authorise a ${TYPE_LABEL[tx.type]} of ${fmt(tx.amount)}? Many victims discover fraud only when called.` })
  if (tx.risk_level === 'High')
    out.push({ priority: 3, urgency: 'today', action: 'File a Suspicious Activity Report (SAR)', reason: 'Under BSA/AML regulations, transactions matching this profile require a FinCEN SAR within 30 days. The combination of high amount, balance drain, and mule account pattern meets the mandatory reporting threshold.' })
  if (ids.includes('dest_zero_to_large'))
    out.push({ priority: 4, urgency: 'today', action: `Investigate the receiving account ${tx.nameDest}`, reason: `Pull the full history of ${tx.nameDest}. Key questions: When was it opened? What KYC documents were used? Are there other large deposits from different senders? Has it already forwarded money onwards?` })
  out.push({ priority: 5, urgency: 'this-week', action: 'Review all transactions from the sender in the past 30 days', reason: `If ${tx.nameOrig} was compromised, earlier warning signs may exist — failed logins, small test transactions, profile changes, or new device registrations. A full history review reveals when access was first compromised.` })
  out.push({ priority: 6, urgency: 'this-week', action: 'Check for accounts linked by device, IP, or phone number', reason: 'The network graph shows connected accounts. Fraudsters typically operate rings — one device or phone linked to multiple victim accounts. Identifying those links may reveal the full scope of the operation.' })
  return out.sort((a, b) => a.priority - b.priority)
}

function getTimeline(tx: Transaction) {
  const ids = tx.triggered_rules.map(r => r.id)
  return [
    { time: `Step ${Math.max(1, tx.step - 2)} (estimated)`, event: 'Account was targeted', detail: ids.includes('balance_drain') ? 'Fraudster obtained account credentials — likely through phishing, malware, or purchased from a data breach marketplace. Balance was checked remotely.' : 'Account was identified as a target for fraud.', color: '#7c3aed' },
    { time: `Step ${Math.max(1, tx.step - 1)} (estimated)`, event: 'Account scouted — balance confirmed', detail: `Fraudster verified the balance of ${fmt(tx.oldbalanceOrg)} was available and decided to proceed with the extraction.`, color: '#ea580c' },
    { time: `Step ${tx.step} — THIS TRANSACTION`,           event: `${fmt(tx.amount)} transferred via ${TYPE_LABEL[tx.type]}`, detail: `${tx.nameOrig} (had ${fmt(tx.oldbalanceOrg)}) sent to ${tx.nameDest}. Sender account now shows ${fmt(tx.newbalanceOrig)}.`, color: '#dc2626' },
    ...(ids.includes('dest_zero_to_large') ? [{ time: `Step ${tx.step} (same moment)`, event: 'Mule account receives the funds', detail: `${tx.nameDest} balance jumped from $0 to ${fmt(tx.newbalanceDest)}. This receiving account was pre-arranged and waiting.`, color: '#dc2626' }] : []),
    { time: 'Within hours (predicted)', event: 'Funds moved again to harder-to-trace destination', detail: 'Fraudsters typically move funds multiple times within 24 hours — to cryptocurrency exchanges, overseas accounts, or additional mule accounts. Each hop makes recovery harder.', color: '#9ca3af' },
    { time: 'Hours to days later', event: 'Victim discovers the fraud', detail: 'Most victims find out via a bank notification, a failed transaction, or their regular account check. By then the money may already be beyond reach.', color: '#6b7280' },
  ]
}

function getWarnings(tx: Transaction) {
  const out: { sign: string; when: string }[] = []
  if (tx.oldbalanceOrg > 200000)
    out.push({ sign: `Account held a high balance (${fmt(tx.oldbalanceOrg)}) making it an attractive target`, when: 'Pre-transaction' })
  if (['TRANSFER','CASH_OUT'].includes(tx.type))
    out.push({ sign: `Transaction type is ${TYPE_LABEL[tx.type]} — the only types where fraud occurs in this dataset`, when: 'At initiation' })
  if (tx.newbalanceOrig === 0)
    out.push({ sign: 'Source account was completely drained — strongest single indicator of fraud', when: 'At completion' })
  if (tx.oldbalanceDest === 0 && tx.newbalanceDest > 100000)
    out.push({ sign: `Destination went from $0 to ${fmt(tx.newbalanceDest)} — classic dormant mule account pattern`, when: 'At completion' })
  if (tx.amount > tx.oldbalanceOrg * 0.95 && tx.oldbalanceOrg > 0)
    out.push({ sign: `Transfer amount (${fmt(tx.amount)}) is over 95% of available balance — extreme drain pattern`, when: 'At initiation' })
  if (tx.isFlaggedFraud === 1)
    out.push({ sign: "The bank's own automated fraud filter independently flagged this transaction", when: 'Real-time' })
  return out
}

// ─────────────────────────────────────────────────────────────────
// ANIMATED CARTOON LIGHTBOX — "What Went Wrong"
// ─────────────────────────────────────────────────────────────────
interface MistakePanel {
  title: string; detail: string
  emoji: string; character: string; charColor: string; charBg: string
}

function WentWrongLightbox({ mistakes, tx, onClose }: { mistakes: MistakePanel[]; tx: Transaction; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)
  const [autoPlay, setAutoPlay] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fade in on step change
  useEffect(() => {
    setVisible(false)
    const t = setTimeout(() => setVisible(true), 80)
    return () => clearTimeout(t)
  }, [step])

  // Auto-advance every 4 seconds
  useEffect(() => {
    if (!autoPlay) return
    timerRef.current = setInterval(() => {
      setStep(s => {
        if (s + 1 >= mistakes.length) { setAutoPlay(false); return s }
        return s + 1
      })
    }, 4000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [autoPlay, mistakes.length])

  // Keyboard nav
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') { setAutoPlay(false); setStep(s => Math.min(s + 1, mistakes.length - 1)) }
      if (e.key === 'ArrowLeft')  { setAutoPlay(false); setStep(s => Math.max(s - 1, 0)) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, mistakes.length])

  const go = (n: number) => { setAutoPlay(false); setStep(n) }
  const m = mistakes[step]

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(10,15,30,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(6px)' }}
    >
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 540, display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(0,0,0,.45)', overflow: 'hidden' }}>

        {/* ── Header ── */}
        <div style={{ background: 'linear-gradient(135deg,#7f1d1d,#dc2626)', padding: '16px 20px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.6)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>
                What Went Wrong — {mistakes.length} issue{mistakes.length !== 1 ? 's' : ''} found
              </div>
              <div style={{ fontSize: 15, fontWeight: 900, color: '#fff', lineHeight: 1.3 }}>
                {TYPE_LABEL[tx.type] ?? tx.type} · {fmt(tx.amount)} · {tx.risk_level} Risk
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font)', flexShrink: 0 }}>x</button>
          </div>

          {/* Progress dots */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {mistakes.map((_, i) => (
              <button key={i} onClick={() => go(i)} style={{ padding: 0, border: 'none', cursor: 'pointer', background: 'none' }}>
                <div style={{ width: i === step ? 28 : 8, height: 8, borderRadius: 4, background: i === step ? '#fff' : i < step ? 'rgba(255,255,255,.6)' : 'rgba(255,255,255,.25)', transition: 'all .3s' }}/>
              </button>
            ))}
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,.55)', marginLeft: 4 }}>Issue {step + 1} of {mistakes.length}</span>
          </div>
        </div>

        {/* ── Cartoon Panel ── */}
        <div style={{ padding: '22px 22px 16px', minHeight: 300 }}>

          {/* Character + speech bubble */}
          <div style={{
            display: 'flex', gap: 14, alignItems: 'flex-end', marginBottom: 16,
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.97)',
            transition: 'all 0.45s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            {/* Avatar */}
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 60, height: 60, borderRadius: '50%',
                background: m.charBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 900, color: m.charColor,
                boxShadow: `0 0 0 3px ${m.charColor}, 0 0 0 6px ${m.charColor}33`,
                fontFamily: 'var(--mono)',
              }}>
                {m.emoji}
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, color: m.charColor, textAlign: 'center', maxWidth: 60, lineHeight: 1.2 }}>
                {m.character}
              </div>
            </div>

            {/* Speech bubble */}
            <div style={{ position: 'relative', flex: 1 }}>
              <div style={{ position: 'absolute', left: -10, bottom: 16, width: 0, height: 0, borderTop: '9px solid transparent', borderBottom: '9px solid transparent', borderRight: `12px solid ${m.charColor}` }}/>
              <div style={{
                background: '#fff', border: `2.5px solid ${m.charColor}`,
                borderRadius: 14, padding: '13px 16px',
                boxShadow: `0 4px 20px ${m.charColor}25`,
              }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: m.charColor, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                  Issue {step + 1} of {mistakes.length}
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#111827', lineHeight: 1.4 }}>
                  {m.title}
                </div>
              </div>
            </div>
          </div>

          {/* Detail explanation box */}
          <div style={{
            background: m.charBg, border: `1px solid ${m.charColor}33`,
            borderLeft: `4px solid ${m.charColor}`,
            borderRadius: 10, padding: '14px 16px',
            fontSize: 12, color: '#374151', lineHeight: 1.8,
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(10px)',
            transition: 'all 0.5s ease 0.15s',
          }}>
            {m.detail}
          </div>

          {/* Issue number badge */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {mistakes.map((mi, i) => (
                <button key={i} onClick={() => go(i)} style={{
                  width: 32, height: 32, borderRadius: '50%', border: `2px solid ${i === step ? mi.charColor : 'var(--gray-200)'}`,
                  background: i === step ? mi.charColor : '#fff',
                  color: i === step ? '#fff' : 'var(--gray-400)',
                  fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'var(--font)',
                  transition: 'all .2s',
                }}>
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Controls ── */}
        <div style={{ padding: '10px 20px 16px', display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid var(--gray-100)' }}>
          <button
            onClick={() => go(Math.max(step - 1, 0))} disabled={step === 0}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--gray-200)', background: '#fff', cursor: step === 0 ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, color: step === 0 ? 'var(--gray-300)' : 'var(--gray-700)', fontFamily: 'var(--font)' }}
          >Back</button>

          {autoPlay
            ? <button onClick={() => setAutoPlay(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--gray-300)', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--gray-700)', fontFamily: 'var(--font)' }}>Pause</button>
            : <button onClick={() => { setAutoPlay(true) }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #bfdbfe', background: '#eff6ff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#2563eb', fontFamily: 'var(--font)' }}>Auto</button>
          }

          <button onClick={() => { setStep(0); setAutoPlay(true) }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--gray-200)', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--gray-700)', fontFamily: 'var(--font)' }}>Restart</button>

          <div style={{ flex: 1 }}/>

          {step < mistakes.length - 1
            ? <button onClick={() => go(step + 1)} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font)' }}>Next issue</button>
            : <button onClick={onClose} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font)' }}>Done</button>
          }
        </div>

        <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--gray-300)', paddingBottom: 10 }}>
          Arrow keys to navigate · Esc to close
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// SHARED SECTION WRAPPER
// ─────────────────────────────────────────────────────────────────
function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginBottom: 10, background: '#fff', borderRadius: 'var(--radius)', border: '1px solid var(--gray-200)', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', padding: '11px 14px', background: 'var(--gray-50)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--font)' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-800)', textAlign: 'left' }}>{title}</span>
        <span style={{ fontSize: 11, color: 'var(--gray-400)', transition: 'transform .2s', display: 'inline-block', transform: open ? 'rotate(0)' : 'rotate(-90deg)', flexShrink: 0, marginLeft: 8 }}>v</span>
      </button>
      {open && <div style={{ padding: 14 }}>{children}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────
export default function CaseInvestigation({ tx }: Props) {
  const [showWentWrong, setShowWentWrong] = useState(false)

  if (!tx) return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)', padding: 32, textAlign: 'center', gap: 12 }}>
      <div style={{ fontSize: 48 }}>Search</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-500)' }}>Case Investigation</div>
      <div style={{ fontSize: 12, lineHeight: 1.8, maxWidth: 300 }}>
        Click any transaction in the table to open a complete investigation report — what went wrong, what kind of fraud this is, who is at risk, and what to do next.
      </div>
    </div>
  )

  const mistakes  = getMistakes(tx)
  const scenarios = getScenarios(tx)
  const actions   = getActions(tx)
  const timeline  = getTimeline(tx)
  const warnings  = getWarnings(tx)

  const headerBg =
    tx.risk_level === 'High'   ? 'linear-gradient(135deg,#7f1d1d,#991b1b)' :
    tx.risk_level === 'Medium' ? 'linear-gradient(135deg,#431407,#7c2d12)' :
                                 'linear-gradient(135deg,#14532d,#166534)'

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 14 }}>

      {/* Animated lightbox */}
      {showWentWrong && (
        <WentWrongLightbox
          mistakes={mistakes}
          tx={tx}
          onClose={() => setShowWentWrong(false)}
        />
      )}

      {/* Header card */}
      <div style={{ background: headerBg, borderRadius: 12, padding: '16px 18px', marginBottom: 14, color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 9, opacity: .7, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Case Investigation Report</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 3 }}>
              {tx.risk_level === 'High' ? 'HIGH RISK' : tx.risk_level === 'Medium' ? 'MEDIUM RISK' : 'LOW RISK'} — {TYPE_LABEL[tx.type] ?? tx.type}
            </div>
            <div style={{ fontSize: 12, opacity: .8 }}>{fmt(tx.amount)} · Step {tx.step} · tx_id {tx.tx_id}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 30, fontWeight: 900, fontFamily: 'var(--mono)', lineHeight: 1 }}>{(tx.risk_score * 100).toFixed(0)}%</div>
            <div style={{ fontSize: 10, opacity: .7 }}>fraud probability</div>
            {tx.isFraud === 1 && (
              <div style={{ marginTop: 5, background: 'rgba(255,255,255,.2)', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>CONFIRMED FRAUD</div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'Sent from',         value: tx.nameOrig },
            { label: 'Received by',       value: tx.nameDest },
            { label: 'Sender had before', value: fmt(tx.oldbalanceOrg) },
            { label: 'Sender had after',  value: tx.newbalanceOrig === 0 ? 'WARNING: $0 Emptied' : fmt(tx.newbalanceOrig) },
          ].map(f => (
            <div key={f.label} style={{ background: 'rgba(255,255,255,.12)', borderRadius: 6, padding: '6px 10px', flex: '1 1 100px' }}>
              <div style={{ fontSize: 8, opacity: .7, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>{f.label}</div>
              <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)', wordBreak: 'break-all' }}>{f.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ SECTION 1 — What went wrong (with animated lightbox button) ══ */}
      <Section title={`What went wrong — ${mistakes.length} issue${mistakes.length !== 1 ? 's' : ''} identified`}>
        {/* Launch button */}
        <button
          onClick={() => setShowWentWrong(true)}
          style={{ width: '100%', marginBottom: 12, padding: '13px 16px', borderRadius: 12, border: '2px solid #dc2626', background: 'linear-gradient(135deg,#fef2f2,#fff1f2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--font)', textAlign: 'left' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'linear-gradient(135deg,#fecaca,#fef2f2)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'linear-gradient(135deg,#fef2f2,#fff1f2)')}
        >
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: '#fff', fontFamily: 'var(--mono)' }}>PLAY</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#dc2626', marginBottom: 3 }}>
              Watch the animated breakdown — {mistakes.length} issue{mistakes.length !== 1 ? 's' : ''}
            </div>
            <div style={{ fontSize: 11, color: '#991b1b' }}>
              Each issue explained by a detective character with bold titles and plain English — auto-advances every 4 seconds
            </div>
          </div>
          <div style={{ fontSize: 20, color: '#dc2626', flexShrink: 0, fontWeight: 900 }}>▶</div>
        </button>

        {/* Static list below the button */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {mistakes.map((m, i) => (
            <button
              key={i}
              onClick={() => { setShowWentWrong(true); }}
              style={{ display: 'flex', gap: 12, padding: '12px 14px', background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca', cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'var(--font)' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#fee2e2')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fef2f2')}
            >
              <div style={{ width: 32, height: 32, borderRadius: 8, background: m.charColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff', flexShrink: 0, fontFamily: 'var(--mono)' }}>
                {i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#991b1b', marginBottom: 3 }}>{m.title}</div>
                <div style={{ fontSize: 11, color: '#7f1d1d', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.detail}</div>
              </div>
              <div style={{ fontSize: 10, color: '#dc2626', flexShrink: 0, alignSelf: 'center', fontWeight: 700 }}>Animate</div>
            </button>
          ))}
        </div>
      </Section>

      {/* ══ SECTION 2 — What kind of fraud ══ */}
      <Section title="What kind of fraud could this be?">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {scenarios.map((s, i) => {
            const cfg = LEVEL_CFG[s.level]
            return (
              <div key={i} style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>{s.scenario}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    <div style={{ width: 50, height: 4, background: 'rgba(0,0,0,.12)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${s.probability}%`, background: cfg.color, borderRadius: 2 }}/>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, fontFamily: 'var(--mono)' }}>{s.probability}%</span>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: cfg.color, lineHeight: 1.7, opacity: .88 }}>{s.detail}</div>
              </div>
            )
          })}
        </div>
      </Section>

      {/* ══ SECTION 3 — Timeline ══ */}
      <Section title="What probably happened — step by step timeline">
        <div style={{ position: 'relative', paddingLeft: 28 }}>
          <div style={{ position: 'absolute', left: 10, top: 6, bottom: 6, width: 2, background: 'var(--gray-200)', borderRadius: 1 }}/>
          {timeline.map((ev, i) => (
            <div key={i} style={{ position: 'relative', marginBottom: 14 }}>
              <div style={{ position: 'absolute', left: -22, top: 2, width: 22, height: 22, borderRadius: '50%', background: ev.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff', boxShadow: '0 0 0 3px #fff' }}>
                {i + 1}
              </div>
              <div style={{ background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 8, padding: '9px 12px', marginLeft: 6 }}>
                <div style={{ fontSize: 9, color: 'var(--gray-400)', fontFamily: 'var(--mono)', marginBottom: 2 }}>{ev.time}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: ev.color, marginBottom: 3 }}>{ev.event}</div>
                <div style={{ fontSize: 11, color: 'var(--gray-600)', lineHeight: 1.6 }}>{ev.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ══ SECTION 4 — Who is at risk ══ */}
      <Section title="Who is at risk and how?">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { who: `Account owner — ${tx.nameOrig}`, level: 'critical' as const, risk: tx.newbalanceOrig === 0 ? `Lost their entire balance of ${fmt(tx.oldbalanceOrg)}. If this was an unauthorised takeover, they may not be aware yet. Their login credentials are likely compromised and should be reset immediately.` : `Lost ${fmt(tx.amount)} from their account. If this transfer was not authorised, they are the primary victim. Their account security needs immediate review.` },
            { who: 'The bank and financial institution', level: 'high' as const, risk: 'Faces potential chargeback liability if the transfer is reversed. Also has regulatory exposure — failure to detect and report this transaction promptly could result in BSA/AML penalties from FinCEN.' },
            { who: `Receiving account — ${tx.nameDest}`, level: tx.oldbalanceDest === 0 ? 'critical' as const : 'high' as const, risk: tx.oldbalanceDest === 0 ? 'Started at exactly $0 and received a large sum — almost certainly a mule account. The real identity behind it needs to be investigated urgently before funds are moved again.' : 'Received the funds and needs to be frozen to prevent further movement. Investigate whether the account holder is aware of or complicit in this transaction.' },
            { who: 'Other customers at the same institution', level: 'medium' as const, risk: 'If this is part of a coordinated attack (check the network graph), other customers with similar balance profiles may be targeted next. A pattern sweep across similar accounts is recommended.' },
          ].map((item, i) => {
            const cfg = LEVEL_CFG[item.level]
            return (
              <div key={i} style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: cfg.color, marginBottom: 5 }}>{item.who}</div>
                <div style={{ fontSize: 11, color: cfg.color, lineHeight: 1.7, opacity: .88 }}>{item.risk}</div>
              </div>
            )
          })}
        </div>
      </Section>

      {/* ══ SECTION 5 — Warning signs ══ */}
      <Section title="Warning signs that should have raised an alarm earlier" defaultOpen={false}>
        {warnings.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--gray-500)', fontStyle: 'italic' }}>No additional warning signs beyond the triggered rules.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {warnings.map((w, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 12px', background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid #dc2626' }}>
                <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1, color: '#dc2626', fontWeight: 700 }}>!</span>
                <div style={{ flex: 1, fontSize: 11, color: 'var(--gray-700)', lineHeight: 1.5 }}>{w.sign}</div>
                <span style={{ fontSize: 9, background: 'var(--gray-100)', color: 'var(--gray-500)', padding: '2px 6px', borderRadius: 3, whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'var(--mono)' }}>{w.when}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ══ SECTION 6 — Action plan ══ */}
      <Section title="What to do now — prioritised action plan">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {actions.map((a, i) => {
            const uc = URGENCY_CFG[a.urgency]
            return (
              <div key={i} style={{ background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 8, padding: '12px 14px', display: 'flex', gap: 12 }}>
                <div style={{ flexShrink: 0 }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'var(--gray-600)' }}>#{i+1}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-800)' }}>{a.action}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: uc.bg, color: uc.color, whiteSpace: 'nowrap' }}>{uc.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--gray-600)', lineHeight: 1.7 }}>{a.reason}</div>
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      {/* ══ SECTION 7 — How AI concluded ══ */}
      <Section title="How the AI reached this conclusion" defaultOpen={false}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: 'Rule-based detection — Symbolic AI', score: tx.rule_score, color: '#2563eb', explain: `${tx.triggered_rules.length} of 6 fraud detection rules fired. Rules check specific conditions like was the account emptied or is the amount above $200,000. Score: ${(tx.rule_score * 100).toFixed(0)}%.` },
            { label: 'Statistical anomaly detection — Machine Learning', score: tx.ml_score, color: '#7c3aed', explain: `An Isolation Forest model trained on 3,080 transactions rated this one as ${tx.ml_score > 0.7 ? 'extremely unusual — top 5% most anomalous' : tx.ml_score > 0.5 ? 'noticeably unusual' : 'somewhat normal statistically'}. Score: ${(tx.ml_score * 100).toFixed(0)}%.` },
            { label: 'Combined fraud probability — final verdict', score: tx.risk_score, color: tx.risk_level === 'High' ? '#dc2626' : tx.risk_level === 'Medium' ? '#ea580c' : '#16a34a', explain: `Final = (60% x rules) + (40% x ML) = (0.6 x ${(tx.rule_score * 100).toFixed(0)}%) + (0.4 x ${(tx.ml_score * 100).toFixed(0)}%) = ${(tx.risk_score * 100).toFixed(0)}%. Rules carry more weight because they are auditable and based on known fraud patterns.` },
          ].map(item => (
            <div key={item.label} style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '12px 14px', border: '1px solid var(--gray-200)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-700)' }}>{item.label}</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: item.color, fontFamily: 'var(--mono)' }}>{(item.score * 100).toFixed(0)}%</span>
              </div>
              <div style={{ height: 7, background: 'var(--gray-200)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ height: '100%', width: `${item.score * 100}%`, background: item.color, borderRadius: 3, transition: 'width .6s' }}/>
              </div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', lineHeight: 1.7 }}>{item.explain}</div>
            </div>
          ))}
          <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 11, color: '#166534', lineHeight: 1.7 }}>
            Important: This AI analysis is a decision-support tool — not a final verdict. A high score means investigate immediately, not definitely fraud. Always verify with the account holder and review full transaction history before freezing accounts or filing reports.
          </div>
        </div>
      </Section>

    </div>
  )
}
