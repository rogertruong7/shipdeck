import { describe, expect, it } from 'vitest'
import { isWorktreeHidden, partitionWorktrees } from '../src/shared/hidden'
import type { WorktreeInfo } from '../src/shared/types'

function wt(repo: string, path: string): WorktreeInfo {
  return {
    repoRoot: `/r/${repo}`, repo, path, branch: 'main', isPrimary: false,
    ahead: 0, behind: 0, files: [], commitsAhead: [], lastActivity: '2026-07-09T01:00:00.000Z', defaultBranch: 'main',
  }
}

describe('isWorktreeHidden', () => {
  it('hides by repo name or worktree path', () => {
    const lists = { repos: ['repo-a'], worktrees: ['/w/b'] }
    expect(isWorktreeHidden(wt('repo-a', '/w/a'), lists)).toBe(true)
    expect(isWorktreeHidden(wt('repo-b', '/w/b'), lists)).toBe(true)
    expect(isWorktreeHidden(wt('repo-b', '/w/c'), lists)).toBe(false)
  })
})

describe('partitionWorktrees', () => {
  it('splits worktrees into visible and hidden preserving order', () => {
    const a = wt('repo-a', '/w/a')
    const b = wt('repo-b', '/w/b')
    const c = wt('repo-b', '/w/c')
    const { visible, hidden } = partitionWorktrees([a, b, c], { repos: [], worktrees: ['/w/b'] })
    expect(visible).toEqual([a, c])
    expect(hidden).toEqual([b])
  })

  it('hides every worktree of a hidden repo', () => {
    const { visible, hidden } = partitionWorktrees([wt('repo-a', '/w/a'), wt('repo-a', '/w/b'), wt('repo-b', '/w/c')], {
      repos: ['repo-a'],
      worktrees: [],
    })
    expect(visible.map(w => w.path)).toEqual(['/w/c'])
    expect(hidden.map(w => w.path)).toEqual(['/w/a', '/w/b'])
  })

  it('hides nothing with empty lists', () => {
    const { visible, hidden } = partitionWorktrees([wt('repo-a', '/w/a')], { repos: [], worktrees: [] })
    expect(visible).toHaveLength(1)
    expect(hidden).toHaveLength(0)
  })
})
