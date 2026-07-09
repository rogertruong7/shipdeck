import { useEffect, useState } from 'react'
import type { RunRecord, Schedule } from '../../../shared/types'
import { api } from '../api'

const STATUS_LABEL: Record<RunRecord['status'], string> = {
  done: 'PR created',
  failed: 'Failed',
  needs_attention: 'Needs attention',
  skipped_clean: 'Skipped (clean)',
}

export function RunsDrawer({ runs, schedules, onClose, onSchedulesChange }: { runs: RunRecord[]; schedules: Schedule[]; onClose: () => void; onSchedulesChange: (s: Schedule[]) => void }) {
  const [openLog, setOpenLog] = useState<string | null>(null)
  const [log, setLog] = useState('')

  useEffect(() => {
    if (!openLog) return
    let live = true
    const load = async () => {
      const text = await api.readRunLog(openLog)
      if (live) setLog(text)
    }
    void load()
    const t = setInterval(() => void load(), 2000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [openLog])

  const attention = runs.filter(r => r.status === 'needs_attention' || r.status === 'failed')
  const rest = runs.filter(r => r.status !== 'needs_attention' && r.status !== 'failed')

  const toggleLog = (id: string) => {
    setLog('')
    setOpenLog(openLog === id ? null : id)
  }

  const renderRun = (r: RunRecord) => {
    const isSummary = r.repo === 'daily-summary'
    return (
    <li key={r.scheduleId} className={`run ${r.status}`}>
      <div className="run-head">
        <span className="run-status">{isSummary ? (r.status === 'done' ? 'Summary' : 'Summary failed') : STATUS_LABEL[r.status]}</span>
        <span>{isSummary ? 'daily summary' : `${r.repo} @ ${r.branch}`}</span>
        <span className="run-time">
          {new Date(r.startedAt).toLocaleString()}
          {r.lateBySeconds > 120 ? ` · ran ${Math.round(r.lateBySeconds / 60)} min late` : ''}
        </span>
      </div>
      {r.prUrl && (
        <a href={r.prUrl} target="_blank" rel="noreferrer">
          {r.prUrl}
        </a>
      )}
      <div>
        <button className="link" onClick={() => toggleLog(r.scheduleId)}>
          {openLog === r.scheduleId ? 'Hide log' : 'Show log'}
        </button>
      </div>
      {openLog === r.scheduleId && <pre className="runlog">{log || '(empty)'}</pre>}
    </li>
    )
  }

  return (
    <aside className="drawer">
      <header>
        <h3>Runs</h3>
        <button onClick={onClose}>✕</button>
      </header>
      {schedules.length > 0 && (
        <>
          <h4>Scheduled</h4>
          <ul>
            {schedules.map(s => (
              <li key={s.id} className="run armed">
                <div className="run-head">
                  <span className="run-status">{s.status === 'running' ? 'Running…' : 'Armed'}</span>
                  <span>
                    {s.repo} @ {s.branch}
                  </span>
                  <span className="run-time">{new Date(s.fireAt).toLocaleString()}</span>
                </div>
                {s.status === 'armed' && (
                  <button className="link" onClick={() => void api.cancelSchedule(s.id).then(onSchedulesChange)}>
                    Cancel
                  </button>
                )}
                {s.status === 'running' && (
                  <>
                    <button className="link" onClick={() => toggleLog(s.id)}>
                      {openLog === s.id ? 'Hide log' : 'Tail log'}
                    </button>
                    <button className="link" onClick={() => void api.forceStopSchedule(s.id).then(onSchedulesChange)}>
                      Force stop
                    </button>
                  </>
                )}
                {openLog === s.id && <pre className="runlog">{log || '(waiting for output…)'}</pre>}
              </li>
            ))}
          </ul>
        </>
      )}
      <h4>History</h4>
      <ul>{[...attention, ...rest].map(renderRun)}</ul>
      {runs.length === 0 && <div className="empty">No runs yet.</div>}
    </aside>
  )
}
