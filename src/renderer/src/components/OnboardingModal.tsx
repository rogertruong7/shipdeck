import { useMemo, useState } from 'react'
import type { ShipdeckConfig } from '../../../shared/types'
import { renderDailySummarySkill, renderSplitCommitPrSkill } from '../../../shared/skill-templates'
import { api } from '../api'
import { FolderList } from './FolderList'

interface Props {
  config: ShipdeckConfig
  missing: string[]
  onDone: () => void
}

export function OnboardingModal({ config, missing, onDone }: Props) {
  const [folders, setFolders] = useState<string[]>(config.scanRoots)
  const [reviewersText, setReviewersText] = useState(config.reviewers.join(', '))
  const [install, setInstall] = useState<Record<string, boolean>>(Object.fromEntries(missing.map(m => [m, true])))
  // Once a preview is hand-edited it stops tracking the form fields.
  const [edited, setEdited] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reviewers = useMemo(
    () => [...new Set(reviewersText.split(',').map(s => s.trim()).filter(Boolean))],
    [reviewersText],
  )
  const preview = (name: string): string =>
    edited[name] ?? (name === 'split-commit-pr' ? renderSplitCommitPrSkill(reviewers) : renderDailySummarySkill(folders))

  const finish = async (skip: boolean) => {
    if (!skip && folders.length === 0) {
      setError('Add at least one folder to scan, or skip for now.')
      return
    }
    setError('')
    setBusy(true)
    try {
      if (skip) {
        await api.setConfig({ onboardingDone: true })
      } else {
        await api.setConfig({ scanRoots: folders, reviewers, onboardingDone: true })
        for (const name of missing) {
          if (install[name]) await api.writeSkill(name, preview(name))
        }
      }
      onDone()
    } catch (e) {
      setError(`Setup failed: ${e instanceof Error ? e.message : String(e)}`)
      setBusy(false)
    }
  }

  return (
    <div className="overlay">
      <div className="dialog wide onboard">
        <h3>Welcome to Shipdeck</h3>
        <p className="hint">
          Shipdeck watches your git worktrees and runs two Claude Code skills for you: <code>/split-commit-pr</code> (scheduled,
          headless) and <code>/daily-summary</code>. A minute of setup makes both work out of the box.
        </p>

        <label className="sched-label">Folders to scan for repos</label>
        <FolderList folders={folders} onChange={setFolders} />

        <label className="sched-label">Default reviewers (GitHub usernames, comma-separated)</label>
        <input
          className="chip-input full"
          value={reviewersText}
          onChange={e => setReviewersText(e.target.value)}
          placeholder="e.g. alice, bob"
        />

        {missing.map(name => (
          <div key={name} className="onboard-skill">
            <label className="onboard-skill-head">
              <input
                type="checkbox"
                checked={install[name] ?? true}
                onChange={e => setInstall(prev => ({ ...prev, [name]: e.target.checked }))}
              />
              Install <code>/{name}</code> to ~/.claude/skills
            </label>
            {(install[name] ?? true) && (
              <textarea
                className="skill-editor short"
                spellCheck={false}
                value={preview(name)}
                onChange={e => setEdited(prev => ({ ...prev, [name]: e.target.value }))}
              />
            )}
          </div>
        ))}

        {error && <div className="dialog-error">{error}</div>}
        <div className="presets">
          <button className="primary" disabled={busy} onClick={() => void finish(false)}>
            {busy ? 'Setting up…' : 'Finish setup'}
          </button>
          <button disabled={busy} onClick={() => void finish(true)}>
            Skip for now
          </button>
        </div>
        <p className="hint">Everything here can be changed later — folders and reviewers in Settings (⚙), skills via the Skills button.</p>
      </div>
    </div>
  )
}
