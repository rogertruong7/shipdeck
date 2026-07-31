import { describe, expect, it } from 'vitest'
import { groupWorktrees, normalizeBranch, sidebarLayout, sidebarSections } from '../src/shared/grouping'
import type { BranchGroup, WorktreeInfo } from '../src/shared/types'

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

function bg(key: string): BranchGroup {
  return { key, worktrees: [], dirty: false, lastActivity: '' }
}

describe('sidebarSections', () => {
  it('sorts groups alphabetically, case-insensitively', () => {
    const sections = sidebarSections([bg('zeta'), bg('Alpha'), bg('beta')])
    expect(sections.map(s => s.groups.map(g => g.key))).toEqual([['Alpha'], ['beta'], ['zeta']])
    expect(sections.every(s => s.ticket === null)).toBe(true)
  })

  it('clusters eng-<number> branches under an uppercase ticket header', () => {
    const sections = sidebarSections([
      bg('model-setting'),
      bg('eng-725-victim-prefill'),
      bg('casex'),
      bg('eng-725-fix-tests'),
    ])
    expect(sections.map(s => s.ticket)).toEqual([null, 'ENG-725', null])
    expect(sections[1].groups.map(g => g.key)).toEqual(['eng-725-fix-tests', 'eng-725-victim-prefill'])
    expect(sections.map(s => s.groups[0].key)).toEqual(['casex', 'eng-725-fix-tests', 'model-setting'])
  })

  it('gives a single-branch ticket its own header', () => {
    const sections = sidebarSections([bg('eng-731-report-graph')])
    expect(sections).toEqual([{ ticket: 'ENG-731', groups: [bg('eng-731-report-graph')] }])
  })

  it('does not treat eng-prefixed words without a number as tickets', () => {
    const sections = sidebarSections([bg('english-notes'), bg('eng-fixup')])
    expect(sections.map(s => s.ticket)).toEqual([null, null])
  })
})

describe('sidebarLayout', () => {
  const dirty = (key: string): BranchGroup => ({ ...bg(key), dirty: true })

  it('splits groups into changed and unchanged, each alphabetical with ticket headers', () => {
    const layout = sidebarLayout([
      bg('zeta'),
      dirty('eng-725-victim-prefill'),
      dirty('alpha'),
      bg('eng-725-fix-tests'),
    ])
    expect(layout.changed.map(s => s.groups.map(g => g.key))).toEqual([['alpha'], ['eng-725-victim-prefill']])
    expect(layout.changed[1].ticket).toBe('ENG-725')
    expect(layout.unchanged.map(s => s.groups.map(g => g.key))).toEqual([['eng-725-fix-tests'], ['zeta']])
    expect(layout.unchanged[0].ticket).toBe('ENG-725')
  })

  it('returns empty partitions when there are no groups', () => {
    expect(sidebarLayout([])).toEqual({ changed: [], unchanged: [] })
  })
})
