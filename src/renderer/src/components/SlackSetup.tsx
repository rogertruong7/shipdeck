import { useEffect, useState } from 'react'
import type { SlackChannel, SlackStatus } from '../../../shared/types'
import { api } from '../api'

// Token connect + default-channel picker, shared by Settings and Onboarding.
// Saves immediately via slack:setToken / config:set instead of the host
// dialog's save flow so both hosts behave identically.
export function SlackSetup() {
  const [status, setStatus] = useState<SlackStatus | null>(null)
  const [token, setToken] = useState('')
  const [replacing, setReplacing] = useState(false)
  const [channels, setChannels] = useState<SlackChannel[]>([])
  const [defaultChannel, setDefaultChannel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const loadChannels = async () => {
    try {
      const r = await api.slackChannels()
      if (r.ok) setChannels(r.channels ?? [])
      else setError(r.error ?? 'Could not load channels')
    } catch {
      setError('Could not load channels')
    }
  }

  useEffect(() => {
    let stale = false
    void (async () => {
      try {
        const [s, c] = await Promise.all([api.slackStatus(), api.getConfig()])
        if (stale) return
        setStatus(s)
        setDefaultChannel(c.slackDefaultChannel)
        if (s.configured && !s.error) void loadChannels()
      } catch {
        if (!stale) {
          setStatus({ configured: false })
          setError('Could not load Slack status')
        }
      }
    })()
    return () => {
      stale = true
    }
  }, [])

  const connect = async () => {
    setBusy(true)
    setError('')
    try {
      const r = await api.slackSetToken(token.trim())
      if (r.error) {
        setError(r.error)
      } else {
        setStatus(r)
        setToken('')
        setReplacing(false)
        void loadChannels()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true)
    setError('')
    try {
      await api.slackSetToken('')
      setStatus({ configured: false })
      setChannels([])
      setDefaultChannel('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const pickChannel = async (id: string) => {
    setError('')
    const prev = defaultChannel
    setDefaultChannel(id)
    const name = channels.find(c => c.id === id)?.name ?? ''
    try {
      await api.setConfig({ slackDefaultChannel: id, slackDefaultChannelName: name })
    } catch {
      setDefaultChannel(prev)
      setError('Could not save default channel')
    }
  }

  if (status === null) return <p className="hint">Loading…</p>

  const connected = status.configured && !status.error
  return (
    <div className="slack-setup">
      {connected && !replacing ? (
        <>
          <p className="hint">
            Connected to <strong>{status.team}</strong> as <strong>@{status.botName}</strong>{' '}
            <button className="link" disabled={busy} onClick={() => setReplacing(true)}>
              Replace token
            </button>{' '}
            <button className="link" disabled={busy} onClick={() => void disconnect()}>
              Disconnect
            </button>
          </p>
          <label className="sched-label">Default channel</label>
          <select className="chip-input full" value={defaultChannel} onChange={e => void pickChannel(e.target.value)}>
            <option value="">— pick a channel —</option>
            {channels.map(c => (
              <option key={c.id} value={c.id}>
                #{c.name}
                {c.isPrivate ? ' (private)' : ''}
              </option>
            ))}
          </select>
        </>
      ) : (
        <>
          {status.configured && status.error && <div className="dialog-error">{status.error}</div>}
          <div className="slack-token-row">
            <input className="chip-input full" type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="xoxb-…" />
            <button className="primary" disabled={busy || !token.trim()} onClick={() => void connect()}>
              {busy ? 'Connecting…' : 'Connect'}
            </button>
            {replacing && (
              <button
                disabled={busy}
                onClick={() => {
                  setReplacing(false)
                  setToken('')
                  setError('')
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </>
      )}
      {error && <div className="dialog-error">{error}</div>}
    </div>
  )
}
