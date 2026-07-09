import { useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { api } from '../api'

type Phase = 'idle' | 'running' | 'done' | 'error'

// Non-blocking bottom-right dock. Runs the daily summary in the background so
// the rest of the app stays usable; expand to watch live activity or read the
// finished summary. Completed runs also land in the Runs drawer.
export function SummaryDock({ startSignal, onOpenRuns, onDone }: { startSignal: number; onOpenRuns: () => void; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [text, setText] = useState('')
  const [log, setLog] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState('')
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const offChunk = api.onSummaryChunk(c => setText(t => t + c))
    const offLog = api.onSummaryLog(l => setLog(p => `${p}${l}\n`))
    const offDone = api.onSummaryDone(r => {
      if (r.text) setText(r.text)
      setPhase(r.ok ? 'done' : 'error')
      onDone()
    })
    return () => {
      offChunk()
      offLog()
      offDone()
    }
  }, [onDone])

  useEffect(() => {
    if (startSignal === 0) return
    setText('')
    setLog('')
    setElapsed(0)
    setCopied('')
    setPhase('running')
    setExpanded(true)
    void api.runDailySummary()
  }, [startSignal])

  useEffect(() => {
    if (phase !== 'running') return
    const t = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [phase])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log, expanded])

  if (phase === 'idle') return null

  const lastLine = log.split('\n').filter(Boolean).at(-1) ?? 'starting…'

  return (
    <div className={`summary-dock ${expanded ? 'expanded' : ''}`}>
      <header className="dock-head" onClick={() => setExpanded(x => !x)}>
        <span className="dock-title">
          {phase === 'running' && `Daily summary… ${elapsed}s`}
          {phase === 'done' && '✅ Daily summary ready'}
          {phase === 'error' && '⚠️ Summary failed'}
        </span>
        <span className="dock-controls">
          <button className="dock-toggle" title={expanded ? 'Collapse' : 'Expand'}>
            {expanded ? '▾' : '▸'}
          </button>
          <button
            className="x"
            title="Dismiss"
            onClick={e => {
              e.stopPropagation()
              setPhase('idle')
            }}
          >
            ✕
          </button>
        </span>
      </header>

      {!expanded && phase === 'running' && <div className="dock-mini">{lastLine}</div>}

      {expanded && (
        <div className="dock-body">
          {phase === 'running' && (
            <pre className="runlog" ref={logRef}>
              {log || 'waiting for first activity…'}
            </pre>
          )}
          {phase === 'done' && (
            <>
              <div className="summary-body" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(String(marked.parse(text))) }} />
              <div className="dock-actions">
                <button className="primary" onClick={() => void api.copyForSlack(text).then(() => setCopied('Copied — paste into Slack'))}>
                  Copy for Slack
                </button>
                <button onClick={() => void api.copyPlain(text).then(() => setCopied('Copied as plain text'))}>Copy text</button>
                <button onClick={onOpenRuns}>Show in Runs</button>
              </div>
              {copied && <div className="copied">{copied}</div>}
            </>
          )}
          {phase === 'error' && <pre className="runlog">{text || log || 'claude exited with an error.'}</pre>}
        </div>
      )}
    </div>
  )
}
