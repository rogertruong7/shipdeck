import type { BranchGroup, WorktreeInfo } from './types'

export function normalizeBranch(branch: string | null, repo: string): string {
  if (!branch) return `${repo} (detached)`
  if (branch === 'main' || branch === 'master') return repo
  const m = branch.match(/^[^/]+\/(.+)$/)
  return m ? m[1] : branch
}

export function isDirty(wt: WorktreeInfo): boolean {
  return wt.files.length > 0
}

export function groupWorktrees(worktrees: WorktreeInfo[]): BranchGroup[] {
  const byKey = new Map<string, WorktreeInfo[]>()
  for (const wt of worktrees) {
    const key = normalizeBranch(wt.branch, wt.repo)
    const list = byKey.get(key) ?? []
    list.push(wt)
    byKey.set(key, list)
  }
  const groups: BranchGroup[] = [...byKey.entries()].map(([key, wts]) => ({
    key,
    worktrees: [...wts].sort((a, b) => a.repo.localeCompare(b.repo)),
    dirty: wts.some(isDirty),
    lastActivity: wts.map(w => w.lastActivity).sort().at(-1) ?? '',
  }))
  return groups.sort((a, b) => {
    if (a.dirty !== b.dirty) return a.dirty ? -1 : 1
    return b.lastActivity.localeCompare(a.lastActivity)
  })
}
