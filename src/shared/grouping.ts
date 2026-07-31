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

export interface SidebarSection {
  // ENG-<number> ticket header, or null for a standalone branch
  ticket: string | null
  groups: BranchGroup[]
}

function ticketOf(key: string): string | null {
  const m = key.match(/^(eng-\d+)(?:-|$)/i)
  return m ? m[1].toUpperCase() : null
}

export interface SidebarLayout {
  changed: SidebarSection[]
  unchanged: SidebarSection[]
}

export function sidebarLayout(groups: BranchGroup[]): SidebarLayout {
  return {
    changed: sidebarSections(groups.filter(g => g.dirty)),
    unchanged: sidebarSections(groups.filter(g => !g.dirty)),
  }
}

export function sidebarSections(groups: BranchGroup[]): SidebarSection[] {
  const sorted = [...groups].sort((a, b) => a.key.toLowerCase().localeCompare(b.key.toLowerCase()))
  const sections: SidebarSection[] = []
  for (const g of sorted) {
    const ticket = ticketOf(g.key)
    const last = sections.at(-1)
    if (ticket && last && last.ticket === ticket) last.groups.push(g)
    else sections.push({ ticket, groups: [g] })
  }
  return sections
}
