import { describe, expect, it } from 'vitest'
import { groupWorktrees, normalizeBranch } from '../src/shared/grouping'
import type { WorktreeInfo } from '../src/shared/types'

function wt(over: Partial<WorktreeInfo>): WorktreeInfo {
  return {
    repoRoot: '/r/repo-a', repo: 'repo-a', path: '/w/x', branch: 'main', isPrimary: false,
    ahead: 0, behind: 0, files: [], commitsAhead: [], lastActivity: '2026-07-08T01:00:00.000Z', defaultBranch: 'main',
    ...over,
  }
}

describe('normalizeBranch', () => {
  it('strips the owner prefix', () => {
    expect(normalizeBranch('sam/eng-101-search', 'repo-a')).toBe('eng-101-search')
    expect(normalizeBranch('bob42/eng-102-tooltip', 'repo-a')).toBe('eng-102-tooltip')
  })
  it('keeps unprefixed branches as-is', () => {
    expect(normalizeBranch('eng-100-filters', 'app-ui')).toBe('eng-100-filters')
  })
  it('groups main/master under the repo name and detached under repo (detached)', () => {
    expect(normalizeBranch('main', 'infra')).toBe('infra')
    expect(normalizeBranch('master', 'legacy')).toBe('legacy')
    expect(normalizeBranch(null, 'repo-a')).toBe('repo-a (detached)')
  })
})

describe('groupWorktrees', () => {
  it('groups the same ticket across repos and sorts worktrees by repo', () => {
    const groups = groupWorktrees([
      wt({ repo: 'repo-a', path: '/w/a', branch: 'sam/eng-100-filters' }),
      wt({ repo: 'app-ui', path: '/w/b', branch: 'eng-100-filters' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('eng-100-filters')
    expect(groups[0].worktrees.map(w => w.repo)).toEqual(['app-ui', 'repo-a'])
  })

  it('sorts dirty groups first, then by last activity descending', () => {
    const groups = groupWorktrees([
      wt({ path: '/w/clean-new', branch: 'x/new-clean', lastActivity: '2026-07-08T09:00:00.000Z' }),
      wt({ path: '/w/dirty-old', branch: 'x/old-dirty', lastActivity: '2026-07-07T09:00:00.000Z', files: [{ path: 'a', insertions: 1, deletions: 0, binary: false, untracked: false }] }),
      wt({ path: '/w/dirty-new', branch: 'x/new-dirty', lastActivity: '2026-07-08T10:00:00.000Z', files: [{ path: 'a', insertions: 1, deletions: 0, binary: false, untracked: false }] }),
    ])
    expect(groups.map(g => g.key)).toEqual(['new-dirty', 'old-dirty', 'new-clean'])
    expect(groups[0].dirty).toBe(true)
    expect(groups[2].dirty).toBe(false)
  })
})
