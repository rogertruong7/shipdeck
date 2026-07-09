import { describe, expect, it } from 'vitest'
import { renderDailySummarySkill, renderSplitCommitPrSkill, reviewerShortcuts } from '../src/shared/skill-templates'

describe('reviewerShortcuts', () => {
  it('uses the first character when free', () => {
    expect(reviewerShortcuts(['alice', 'bob'])).toEqual([
      { key: 'a', name: 'alice' },
      { key: 'b', name: 'bob' },
    ])
  })

  it('walks to the next unused character on collision', () => {
    expect(reviewerShortcuts(['alice', 'albert'])).toEqual([
      { key: 'a', name: 'alice' },
      { key: 'l', name: 'albert' },
    ])
  })

  it('skips non-alphanumeric characters', () => {
    expect(reviewerShortcuts(['alice', 'a-lice'])).toEqual([
      { key: 'a', name: 'alice' },
      { key: 'l', name: 'a-lice' },
    ])
  })

  it('falls back to the full name when every character is taken', () => {
    expect(reviewerShortcuts(['ab', 'ba', 'ab'])).toEqual([
      { key: 'a', name: 'ab' },
      { key: 'b', name: 'ba' },
      { key: 'ab', name: 'ab' },
    ])
  })
})

describe('renderSplitCommitPrSkill', () => {
  it('starts with frontmatter and includes the blocking secret scan', () => {
    const md = renderSplitCommitPrSkill([])
    expect(md.startsWith('---\nname: split-commit-pr\n')).toBe(true)
    expect(md).toContain('Secret scan (REQUIRED — blocking)')
    expect(md).toContain('gh pr create')
  })

  it('renders a shortcuts table and examples from the reviewer list', () => {
    const md = renderSplitCommitPrSkill(['alice', 'bob'])
    expect(md).toContain('| `a` | alice |')
    expect(md).toContain('| `b` | bob |')
    expect(md).toContain('/split-commit-pr a,b')
    expect(md).toContain('--reviewer')
  })

  it('omits the shortcuts section when there are no reviewers', () => {
    const md = renderSplitCommitPrSkill([])
    expect(md).not.toContain('Reviewer Shortcuts')
    expect(md).not.toContain('--reviewer')
  })
})

describe('renderDailySummarySkill', () => {
  it('embeds each scan folder', () => {
    const md = renderDailySummarySkill(['~/coding', '/work/repos'])
    expect(md.startsWith('---\nname: daily-summary\n')).toBe(true)
    expect(md).toContain('- `~/coding`')
    expect(md).toContain('- `/work/repos`')
  })

  it('falls back to ~/coding with no folders and keeps the output contract', () => {
    const md = renderDailySummarySkill([])
    expect(md).toContain('- `~/coding`')
    expect(md).toContain('**What I did**')
    expect(md).toContain('Output ONLY the finished summary')
  })
})
