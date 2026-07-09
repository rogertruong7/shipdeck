import { useEffect, useState } from 'react'
import type { FileDiffStat, Schedule, WorktreeInfo } from '../../../shared/types'
import { api } from '../api'
import { DiffView } from './DiffView'
import { ScheduleDialog } from './ScheduleDialog'

interface Props {
  wt: WorktreeInfo
  schedule?: Schedule
  onSchedulesChange: (s: Schedule[]) => void
}

export function WorktreeCard({ wt, schedule, onSchedulesChange }: Props) {
  const [openFile, setOpenFile] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
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
          <span className="sched-chip armed">
            ⏱ {new Date(schedule.fireAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} → PR
            {schedule.args ? ` (reviewers: ${schedule.args})` : ''}
            {schedule.status === 'running' ? (
              <em className="running">running…</em>
            ) : (
              <button className="x" onClick={() => void api.cancelSchedule(schedule.id).then(onSchedulesChange)}>
                ✕
              </button>
            )}
          </span>
        ) : (
          <div className="foot-actions">
            <button className="sched-chip primary-ghost" disabled={wt.files.length === 0 || running} onClick={() => void runNow()}>
              {running ? 'Starting…' : '▶ Run PR now'}
            </button>
            <button className="sched-chip" disabled={wt.files.length === 0} onClick={() => setDialogOpen(true)}>
              ⏱ Schedule…
            </button>
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
