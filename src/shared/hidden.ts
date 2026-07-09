import type { WorktreeInfo } from './types'

export interface HiddenLists {
  repos: string[]
  worktrees: string[]
}

export function isWorktreeHidden(wt: { repo: string; path: string }, lists: HiddenLists): boolean {
  return lists.repos.includes(wt.repo) || lists.worktrees.includes(wt.path)
}

// Hidden worktrees don't disappear — they regroup under the sidebar's
// "Hidden" section, out of All changes.
export function partitionWorktrees(wts: WorktreeInfo[], lists: HiddenLists): { visible: WorktreeInfo[]; hidden: WorktreeInfo[] } {
  const visible: WorktreeInfo[] = []
  const hidden: WorktreeInfo[] = []
  for (const wt of wts) (isWorktreeHidden(wt, lists) ? hidden : visible).push(wt)
  return { visible, hidden }
}
