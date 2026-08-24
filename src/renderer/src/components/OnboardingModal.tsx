import { useMemo, useState } from 'react'
import type { ShipdeckConfig } from '../../../shared/types'
import { renderDailySummarySkill, renderSplitCommitPrSkill } from '../../../shared/skill-templates'
import { WIZARD_STEPS, canAdvance, clampStep, isLastStep } from '../onboarding-wizard'
import { api } from '../api'
import { FolderList } from './FolderList'
import { SlackSetup } from './SlackSetup'

interface Props {
  config: ShipdeckConfig
  missing: string[]
  onDone: () => void
}

const STEP_TITLES: Record<(typeof WIZARD_STEPS)[number], string> = {
  welcome: 'Welcome to Shipdeck',
  folders: 'Folders to scan',
  reviewers: 'Reviewers & skills',
  slack: 'Slack (optional)',
}

export function OnboardingModal({ config, missing, onDone }: Props) {
  const [stepIndex, setStepIndex] = useState(0)
  const [folders, setFolders] = useState<string[]>(config.scanRoots)
  const [reviewersText, setReviewersText] = useState(config.reviewers.join(', '))
  const [install, setInstall] = useState<Record<string, boolean>>(Object.fromEntries(missing.map(m => [m, true])))
  // Once a preview is hand-edited it stops tracking the form fields.
  const [edited, setEdited] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const step = WIZARD_STEPS[stepIndex]
  const canNext = canAdvance(step, { folderCount: folders.length })

  const reviewers = useMemo(
    () => [...new Set(reviewersText.split(',').map(s => s.trim()).filter(Boolean))],
    [reviewersText],
  )
  const preview = (name: string): string =>
    edited[name] ?? (name === 'split-commit-pr' ? renderSplitCommitPrSkill(reviewers) : renderDailySummarySkill(folders))

  const goNext = () => setStepIndex(i => clampStep(i + 1))
  const goBack = () => setStepIndex(i => clampStep(i - 1))

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
        <div className="wizard-head">
          <div className="wizard-dots">
            {WIZARD_STEPS.map((s, i) => (
              <span
                key={s}
                className={`wizard-dot${i === stepIndex ? ' active' : ''}${i < stepIndex ? ' done' : ''}`}
              />
            ))}
          </div>
          <span className="wizard-count">
            Step {stepIndex + 1} of {WIZARD_STEPS.length}
          </span>
        </div>
        <h3>{STEP_TITLES[step]}</h3>

        <div className="wizard-body">
          {step === 'welcome' && (
            <p className="hint">
              Shipdeck watches your git worktrees and runs two Claude Code skills for you: <code>/split-commit-pr</code>{' '}
              (scheduled, headless) and <code>/daily-summary</code>. The next few steps make both work out of the box —
              everything can be changed later.
            </p>
          )}

          {step === 'folders' && (
            <>
              <label className="sched-label">Folders to scan for repos</label>
              <FolderList folders={folders} onChange={setFolders} />
              {!canNext && <p className="hint">Add at least one folder to continue, or skip for now.</p>}
            </>
          )}

          {step === 'reviewers' && (
            <>
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
            </>
          )}

          {step === 'slack' && (
            <>
              <label className="sched-label">Slack (optional) — schedule messages to post later</label>
              <ol className="hint slack-steps">
                <li>
                  Create an app at <code>api.slack.com/apps</code> → "From scratch".
                </li>
                <li>
                  OAuth &amp; Permissions → add bot scopes <code>chat:write</code>, <code>channels:read</code>,{' '}
                  <code>groups:read</code>.
                </li>
                <li>Install to your workspace and copy the Bot User OAuth Token (xoxb-…).</li>
                <li>
                  In Slack, <code>/invite</code> the bot to channels you want to post to.
                </li>
              </ol>
              <SlackSetup />
              <p className="hint">
                Everything here can be changed later — folders and reviewers in Settings (⚙), skills via the Skills
                button.
              </p>
            </>
          )}
        </div>

        {error && <div className="dialog-error">{error}</div>}

        <div className="wizard-footer">
          <div className="wizard-footer-left">
            {stepIndex > 0 && (
              <button disabled={busy} onClick={goBack}>
                ← Back
              </button>
            )}
          </div>
          <div className="wizard-footer-right">
            <button disabled={busy} onClick={() => void finish(true)}>
              Skip for now
            </button>
            {isLastStep(stepIndex) ? (
              <button className="primary" disabled={busy} onClick={() => void finish(false)}>
                {busy ? 'Setting up…' : 'Finish setup'}
              </button>
            ) : (
              <button className="primary" disabled={busy || !canNext} onClick={goNext}>
                Next →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
