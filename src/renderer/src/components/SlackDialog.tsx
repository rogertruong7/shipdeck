import { useCallback, useEffect, useState } from 'react'
import type { SlackChannel, SlackPendingMessage, SlackStatus } from '../../../shared/types'
import { toPostAt, validatePostAt } from '../../../shared/slack-time'
import { api } from '../api'

function fmtAt(postAt: number): string {
  return new Date(postAt * 1000).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function dateInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function SlackDialog({ onClose, onOpenSettings }: { onClose: () => void; onOpenSettings: () => void }) {
  const [status, setStatus] = useState<SlackStatus | null>(null)
  const [channels, setChannels] = useState<SlackChannel[]>([])
  const [channelId, setChannelId] = useState('')
  const [text, setText] = useState('')
  const [date, setDate] = useState(dateInputValue(new Date()))
  const [time, setTime] = useState('')
  const [pending, setPending] = useState<SlackPendingMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refreshPending = useCallback(async () => {
    try {
      const r = await api.slackPending()
      if (r.ok) setPending(r.messages ?? [])
      else setError(r.error ?? 'Could not load pending messages')
    } catch {
      setError('Could not load pending messages')
    }
  }, [])

  useEffect(() => {
    let stale = false
    void (async () => {
      try {
        const [s, c] = await Promise.all([api.slackStatus(), api.getConfig()])
        if (stale) return
        setStatus(s)
        if (s.configured && !s.error) {
          setChannelId(c.slackDefaultChannel)
          const ch = await api.slackChannels()
          if (stale) return
          if (ch.ok) setChannels(ch.channels ?? [])
          void refreshPending()
        }
      } catch {
        if (!stale) setError('Could not reach Slack')
      }
    })()
    return () => {
      stale = true
    }
  }, [refreshPending])

  const schedule = async (at: Date) => {
    if (!channelId) {
      setError('Pick a channel')
      return
    }
    if (!text.trim()) {
      setError('Write a message first')
      return
    }
    const invalid = validatePostAt(at, new Date())
    if (invalid) {
      setError(invalid)
      return
    }
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const r = await api.slackSchedule({ channelId, text: text.trim(), postAt: toPostAt(at) })
      if (!r.ok) {
        setError(r.error ?? 'Slack error')
      } else {
        setText('')
        setNotice(`Scheduled for ${fmtAt(toPostAt(at))}`)
        void refreshPending()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const scheduleCustom = () => {
    const [h, m] = time.split(':').map(Number)
    if (!date || Number.isNaN(h) || Number.isNaN(m)) {
      setError('Pick a date and time first')
      return
    }
    const [y, mo, d] = date.split('-').map(Number)
    void schedule(new Date(y, mo - 1, d, h, m, 0, 0))
  }

  const cancel = async (m: SlackPendingMessage) => {
    setBusy(true)
    setError('')
    try {
      const r = await api.slackCancel({ channelId: m.channelId, messageId: m.id })
      if (!r.ok) setError(r.error ?? 'Slack error')
      void refreshPending()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const now = new Date()
  const tomorrow9 = new Date(now)
  tomorrow9.setDate(now.getDate() + 1)
  tomorrow9.setHours(9, 0, 0, 0)
  const presets = [
    { label: 'In 30 min', at: new Date(now.getTime() + 30 * 60000) },
    { label: 'In 1 hour', at: new Date(now.getTime() + 60 * 60000) },
    { label: 'Tomorrow 9:00', at: tomorrow9 },
  ]

  const unconfigured = status !== null && (!status.configured || !!status.error)
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog sched" onClick={e => e.stopPropagation()}>
        <header className="sched-head">
          <h3>Slack message</h3>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </header>
        {status === null && <p className="hint">Loading…</p>}
        {unconfigured && (
          <>
            {status?.error ? (
              <div className="dialog-error">{status.error}</div>
            ) : (
              <p className="hint">Connect a Slack bot to schedule messages — Slack delivers them even while this Mac is asleep.</p>
            )}
            <button className="primary" onClick={onOpenSettings}>
              Open Settings
            </button>
          </>
        )}
        {status !== null && !unconfigured && (
          <>
            <label className="sched-label">Channel</label>
            <select className="chip-input full" value={channelId} onChange={e => setChannelId(e.target.value)}>
              <option value="">— pick a channel —</option>
              {channels.map(c => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                  {c.isPrivate ? ' (private)' : ''}
                </option>
              ))}
            </select>
            <label className="sched-label">Message</label>
            <textarea className="skill-editor short" spellCheck={false} value={text} onChange={e => setText(e.target.value)} placeholder="What should the bot post?" />
            <label className="sched-label">When</label>
            <div className="time-presets">
              {presets.map(p => (
                <button key={p.label} className="time-card" disabled={busy} onClick={() => void schedule(p.at)}>
                  <span className="time-card-when">{p.label}</span>
                  <span className="time-card-at">{p.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                </button>
              ))}
            </div>
            <div className="custom">
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
              <input type="time" value={time} onChange={e => setTime(e.target.value)} />
              <button className="primary" disabled={busy || !time} onClick={scheduleCustom}>
                Schedule
              </button>
            </div>
            {notice && <p className="hint">{notice}</p>}
            {error && <div className="dialog-error">{error}</div>}
            <label className="sched-label">Pending</label>
            {pending.length === 0 ? (
              <p className="hint">No scheduled messages.</p>
            ) : (
              <div className="slack-pending">
                {pending.map(m => (
                  <div key={m.id} className="slack-pending-row">
                    <span className="repo-chip">#{m.channelName ?? m.channelId}</span>
                    <span className="slack-pending-text" title={m.text}>
                      {m.text}
                    </span>
                    <span className="slack-pending-at">{fmtAt(m.postAt)}</span>
                    <button className="x" disabled={busy} title="Cancel" onClick={() => void cancel(m)}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
