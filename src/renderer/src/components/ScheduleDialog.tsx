import { useEffect, useMemo, useState } from 'react'
import type { Schedule, WorktreeInfo } from '../../../shared/types'
import { api } from '../api'

function fmt(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function ScheduleDialog({ wt, onClose, onArmed }: { wt: WorktreeInfo; onClose: () => void; onArmed: (s: Schedule[]) => void }) {
  const [reviewers, setReviewers] = useState<string[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [extra, setExtra] = useState('')
  const [custom, setCustom] = useState('')
  const [error, setError] = useState('')
  const [wakeEnabled, setWakeEnabled] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let stale = false
    void api
      .getConfig()
      .then(c => {
        if (stale) return
        setWakeEnabled(c.wakeArmingEnabled)
        setReviewers(c.reviewers ?? [])
      })
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [])

  const argString = useMemo(() => {
    const parts = [...picked, ...extra.split(',').map(s => s.trim()).filter(Boolean)]
    return [...new Set(parts)].join(',')
  }, [picked, extra])

  const now = new Date()
  const in30 = new Date(now.getTime() + 30 * 60000)
  const in60 = new Date(now.getTime() + 60 * 60000)
  const eod = new Date(now)
  eod.setHours(17, 30, 0, 0)
  const presets = [
    { label: 'In 30 min', at: in30 },
    { label: 'In 1 hour', at: in60 },
    ...(eod > now ? [{ label: 'End of day', at: eod }] : []),
  ]

  const toggle = (key: string) =>
    setPicked(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const arm = async (date: Date) => {
    if (!wt.branch) {
      setError('Detached worktree — check out a branch first')
      return
    }
    if (date.getTime() <= Date.now()) {
      setError('That time is in the past')
      return
    }
    setError('')
    setBusy(true)
    try {
      onArmed(await api.armSchedule({ worktreePath: wt.path, repo: wt.repo, branch: wt.branch, fireAt: date.toISOString(), args: argString }))
    } catch (e) {
      setError(`Failed to arm schedule: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const armCustom = () => {
    const [h, m] = custom.split(':').map(Number)
    if (Number.isNaN(h) || Number.isNaN(m)) {
      setError('Pick a time first')
      return
    }
    const d = new Date()
    d.setHours(h, m, 0, 0)
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1)
    void arm(d)
  }

  const fileCount = wt.files.length

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog sched" onClick={e => e.stopPropagation()}>
        <header className="sched-head">
          <h3>Schedule PR</h3>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="sched-target">
          <span className="repo-chip">{wt.repo}</span>
          <span className="branch">{wt.branch}</span>
          <span className="sched-files">
            {fileCount} file{fileCount === 1 ? '' : 's'} changed
          </span>
        </div>

        <label className="sched-label">Reviewers</label>
        <div className="reviewer-chips">
          {reviewers.map(r => (
            <button key={r} className={`chip ${picked.has(r) ? 'on' : ''}`} onClick={() => toggle(r)}>
              {r}
            </button>
          ))}
          <input className="chip-input" value={extra} onChange={e => setExtra(e.target.value)} placeholder="+ other, comma-sep" />
        </div>

        <label className="sched-label">When</label>
        <div className="time-presets">
          {presets.map(p => (
            <button key={p.label} className="time-card" disabled={busy} onClick={() => void arm(p.at)}>
              <span className="time-card-when">{p.label}</span>
              <span className="time-card-at">{fmt(p.at)}</span>
            </button>
          ))}
        </div>
        <div className="custom">
          <input type="time" value={custom} onChange={e => setCustom(e.target.value)} />
          <button className="primary" disabled={busy || !custom} onClick={armCustom}>
            Arm{custom ? ` for ${custom}` : ''}
          </button>
        </div>

        {error && <div className="dialog-error">{error}</div>}
        <p className="hint">
          Runs <code>/split-commit-pr{argString ? ` ${argString}` : ''}</code> headless, then clears.{' '}
          {wakeEnabled ? 'Exact on power; on-next-wake on battery.' : 'Fires on next wake unless exact wake-ups are enabled.'}
        </p>
        {!wakeEnabled && (
          <button className="link" disabled={busy} onClick={() => void api.enableWakeArming().then(setWakeEnabled).catch(() => setError('Could not enable wake-ups'))}>
            Enable exact wake-ups (admin password, once)
          </button>
        )}
      </div>
    </div>
  )
}
