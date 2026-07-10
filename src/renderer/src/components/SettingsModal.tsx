import { useEffect, useState } from 'react'
import { MODEL_OPTIONS } from '../../../shared/types'
import { api } from '../api'
import { FolderList } from './FolderList'

export function SettingsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [folders, setFolders] = useState<string[] | null>(null)
  const [reviewersText, setReviewersText] = useState('')
  const [model, setModel] = useState('default')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let stale = false
    void api
      .getConfig()
      .then(c => {
        if (stale) return
        setFolders(c.scanRoots)
        setReviewersText(c.reviewers.join(', '))
        setModel(c.model)
      })
      .catch(() => setError('Could not load config'))
    return () => {
      stale = true
    }
  }, [])

  const save = async () => {
    if (!folders) return
    if (folders.length === 0) {
      setError('Add at least one folder to scan.')
      return
    }
    setError('')
    setBusy(true)
    try {
      const reviewers = [...new Set(reviewersText.split(',').map(s => s.trim()).filter(Boolean))]
      await api.setConfig({ scanRoots: folders, reviewers, model })
      onSaved()
      onClose()
    } catch (e) {
      setError(`Save failed: ${e instanceof Error ? e.message : String(e)}`)
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <h3>Settings</h3>
        <label className="sched-label">Folders to scan for repos</label>
        {folders ? <FolderList folders={folders} onChange={setFolders} /> : <p className="hint">Loading…</p>}
        <label className="sched-label">Default reviewers (GitHub usernames, comma-separated)</label>
        <input className="chip-input full" value={reviewersText} onChange={e => setReviewersText(e.target.value)} placeholder="e.g. alice, bob" />
        <label className="sched-label">Claude model for runs</label>
        <select className="chip-input full" value={model} onChange={e => setModel(e.target.value)}>
          {MODEL_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          {!MODEL_OPTIONS.some(o => o.value === model) && <option value={model}>{model}</option>}
        </select>
        {error && <div className="dialog-error">{error}</div>}
        <div className="presets">
          <button className="primary" disabled={busy || !folders} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
