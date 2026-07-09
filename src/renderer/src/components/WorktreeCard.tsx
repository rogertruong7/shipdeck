import { useEffect, useState, type MouseEvent } from 'react'
import type { FileDiffStat, Schedule, WorktreeInfo } from '../../../shared/types'
import type { HiddenLists } from '../../../shared/hidden'
import { api } from '../api'
import { DiffView } from './DiffView'
import { ScheduleDialog } from './ScheduleDialog'

interface Props {
  wt: WorktreeInfo
  schedule?: Schedule
  onSchedulesChange: (s: Schedule[]) => void
  hidden: HiddenLists
  onToggleHide: (kind: 'repo' | 'worktree', value: string, hide: boolean) => void
  prUrl?: string
}

export function WorktreeCard({ wt, schedule, onSchedulesChange, hidden, onToggleHide, prUrl }: Props) {
  const [openFile, setOpenFile] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [running, setRunning] = useState(false)
  const [diffMode, setDiffMode] = useState<'uncommitted' | 'branch'>('uncommitted')
  const [branchList, setBranchList] = useState<FileDiffStat[] | null>(null)

  const runNow = async () => {
    if (!wt.branch) return
    setRunning(true)
    try {
      onSchedulesChange(await api.runNow({ worktreePath: wt.path, repo: wt.repo, branch: wt.branch, args: '' }))
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => {
    setBranchList(null)
  }, [wt.lastActivity])

  useEffect(() => {
    if (diffMode !== 'branch' || branchList !== null) return
    let stale = false
    void api.branchFiles(wt.path).then(f => {
      if (!stale) setBranchList(f)
    })
    return () => {
      stale = true
    }
  }, [diffMode, branchList, wt.path])

  const untrackedFiles = wt.files.filter(f => f.untracked)
  const shownFiles = diffMode === 'uncommitted' ? wt.files : branchList === null ? null : [...branchList, ...untrackedFiles]
  const ins = (shownFiles ?? wt.files).reduce((n, f) => n + f.insertions, 0)
  const del = (shownFiles ?? wt.files).reduce((n, f) => n + f.deletions, 0)

  // mid-run URL from the live schedule beats the (cached) scan annotation
  const livePrUrl = schedule?.prUrl ?? prUrl
  const prButtons = livePrUrl ? (
    <>
      <button className="sched-chip" title={livePrUrl} onClick={() => window.open(livePrUrl)}>
        ↗ View PR
      </button>
      <button
        className="sched-chip"
        onClick={() => {
          void api.copyPlain(livePrUrl)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? '✓ Copied' : '⧉ Copy PR link'}
      </button>
    </>
  ) : null

  return (
    <article className="card">
      <header className="card-head">
        <span className="repo-chip">{wt.repo}</span>
        <span className="branch">{wt.branch ?? '(detached)'}</span>
        <span className="path" title={wt.path}>
          {wt.path.replace(/^\/Users\/[^/]+/, '~')}
        </span>
        <span className="stats">
          <em className="add">+{ins}</em> <em className="del">−{del}</em> · {(shownFiles ?? wt.files).length} files
          {wt.ahead > 0 ? ` · ↑${wt.ahead}` : ''}
          {wt.behind > 0 ? ` · ↓${wt.behind}` : ''}
        </span>
        <details className="card-menu">
          <summary title="More actions">⋯</summary>
          <div className="card-menu-items">
            {(() => {
              const pathHidden = hidden.worktrees.includes(wt.path)
              const repoHidden = hidden.repos.includes(wt.repo)
              const pick = (kind: 'repo' | 'worktree', value: string, hide: boolean) => (e: MouseEvent) => {
                ;(e.target as HTMLElement).closest('details')?.removeAttribute('open')
                onToggleHide(kind, value, hide)
              }
              return (
                <>
                  <button onClick={pick('worktree', wt.path, !pathHidden)}>{pathHidden ? 'Unhide worktree' : 'Hide worktree'}</button>
                  <button onClick={pick('repo', wt.repo, !repoHidden)}>
                    {repoHidden ? `Unhide all of ${wt.repo}` : `Hide all of ${wt.repo}`}
                  </button>
                </>
              )
            })()}
          </div>
        </details>
      </header>
      {wt.error && <div className="card-error">{wt.error}</div>}
      {wt.commitsAhead.length > 0 && (
        <details className="commits">
          <summary>
            {wt.commitsAhead.length} commit{wt.commitsAhead.length === 1 ? '' : 's'} ahead of default
          </summary>
          <ul>
            {wt.commitsAhead.map(c => (
              <li key={c.hash}>
                <code>{c.hash}</code> {c.subject}
              </li>
            ))}
          </ul>
        </details>
      )}
      {wt.commitsAhead.length > 0 && (
        <div className="diff-mode">
          <button className={`seg ${diffMode === 'uncommitted' ? 'active' : ''}`} onClick={() => setDiffMode('uncommitted')}>
            Uncommitted
          </button>
          <button className={`seg ${diffMode === 'branch' ? 'active' : ''}`} onClick={() => setDiffMode('branch')}>
            vs {wt.defaultBranch}
          </button>
        </div>
      )}
      <ul className="files">
        {diffMode === 'branch' && shownFiles === null ? (
          <li className="empty">loading branch diff…</li>
        ) : (
          (shownFiles ?? []).map(f => (
            <li key={f.path}>
              <button className={`file-row ${openFile === f.path ? 'open' : ''}`} onClick={() => setOpenFile(openFile === f.path ? null : f.path)}>
                <span className="file-path">{f.path}</span>
                {f.untracked && <span className="tag">new</span>}
                {f.binary ? (
                  <span className="tag">binary</span>
                ) : (
                  <span className="file-stats">
                    <em className="add">+{f.insertions}</em> <em className="del">−{f.deletions}</em>
                  </span>
                )}
              </button>
              {openFile === f.path && !f.binary && <DiffView worktreePath={wt.path} file={f.path} untracked={f.untracked} vsBranch={diffMode === 'branch' && !f.untracked} />}
            </li>
          ))
        )}
      </ul>
      <footer className="card-foot">
        {schedule ? (
          <div className="foot-actions">
          <span className="sched-chip armed">
            ⏱ {new Date(schedule.fireAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} → PR
            {schedule.args ? ` (reviewers: ${schedule.args})` : ''}
            {schedule.status === 'running' ? (
              <>
                <em className="running">{schedule.prUrl ? 'PR up — watching checks…' : 'running…'}</em>
                <button className="x" title="Force stop this run" onClick={() => void api.forceStopSchedule(schedule.id).then(onSchedulesChange)}>
                  ✕
                </button>
              </>
            ) : (
              <button className="x" onClick={() => void api.cancelSchedule(schedule.id).then(onSchedulesChange)}>
                ✕
              </button>
            )}
          </span>
          {prButtons}
          </div>
        ) : (
          <div className="foot-actions">
            <button className="sched-chip primary-ghost" disabled={wt.files.length === 0 || running} onClick={() => void runNow()}>
              {running ? 'Starting…' : '▶ Run PR now'}
            </button>
            <button className="sched-chip" disabled={wt.files.length === 0} onClick={() => setDialogOpen(true)}>
              ⏱ Schedule…
            </button>
            {prButtons}
          </div>
        )}
      </footer>
      {dialogOpen && (
        <ScheduleDialog
          wt={wt}
          onClose={() => setDialogOpen(false)}
          onArmed={s => {
            onSchedulesChange(s)
            setDialogOpen(false)
          }}
        />
      )}
    </article>
  )
}
