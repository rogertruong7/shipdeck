import { describe, expect, it } from 'vitest'
import { pickClaudeBinary } from '../src/main/config'

describe('pickClaudeBinary', () => {
  it('skips node_modules shims and picks the first real binary', () => {
    expect(
      pickClaudeBinary(['/Users/roger/coding/node_modules/.bin/claude', '/Users/roger/.local/bin/claude', '/opt/homebrew/bin/claude']),
    ).toBe('/Users/roger/.local/bin/claude')
  })

  it('returns empty string when only node_modules copies exist', () => {
    expect(pickClaudeBinary(['/a/node_modules/.bin/claude'])).toBe('')
  })

  it('ignores non-path noise lines from interactive shells', () => {
    expect(pickClaudeBinary(['claude not found', 'claude: aliased to something', '/Users/roger/.local/bin/claude'])).toBe(
      '/Users/roger/.local/bin/claude',
    )
  })

  it('returns empty string for empty input', () => {
    expect(pickClaudeBinary([])).toBe('')
  })
})
