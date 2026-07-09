import { describe, expect, it } from 'vitest'
import { formatStreamEvent } from '../src/shared/stream-format'

describe('formatStreamEvent', () => {
  it('renders assistant text blocks as plain text', () => {
    const line = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Analyzing the diff now.' }] } })
    expect(formatStreamEvent(line)).toBe('Analyzing the diff now.')
  })

  it('renders thinking blocks with a thought marker', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'thinking', thinking: 'The diff touches two features,\nso two commits.' }] },
    })
    expect(formatStreamEvent(line)).toBe('💭 The diff touches two features,\nso two commits.')
  })

  it('renders tool_use blocks with the interesting input field', () => {
    const bash = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'git add src/a.ts src/b.ts' } }] },
    })
    expect(formatStreamEvent(bash)).toBe('[tool] Bash: git add src/a.ts src/b.ts')
    const read = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/w/src/App.tsx' } }] },
    })
    expect(formatStreamEvent(read)).toBe('[tool] Read: /w/src/App.tsx')
  })

  it('joins multiple content blocks with newlines', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Committing.' },
          { type: 'tool_use', name: 'Bash', input: { command: 'git commit -m "feat: x"' } },
        ],
      },
    })
    expect(formatStreamEvent(line)).toBe('Committing.\n[tool] Bash: git commit -m "feat: x"')
  })

  it('renders the final result text', () => {
    const line = JSON.stringify({ type: 'result', subtype: 'success', result: 'PR created: https://github.com/x/y/pull/7' })
    expect(formatStreamEvent(line)).toBe('PR created: https://github.com/x/y/pull/7')
  })

  it('skips tool-result and system noise', () => {
    expect(formatStreamEvent(JSON.stringify({ type: 'user', message: { content: [] } }))).toBeNull()
    expect(formatStreamEvent(JSON.stringify({ type: 'system', subtype: 'init' }))).toBeNull()
  })

  it('passes non-JSON lines through raw and skips empty lines', () => {
    expect(formatStreamEvent('https://github.com/acme/alpha/pull/42')).toBe('https://github.com/acme/alpha/pull/42')
    expect(formatStreamEvent('')).toBeNull()
    expect(formatStreamEvent('   ')).toBeNull()
  })

  it('truncates very long tool commands', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'x'.repeat(500) } }] },
    })
    const out = formatStreamEvent(line)!
    expect(out.length).toBeLessThan(240)
    expect(out.endsWith('…')).toBe(true)
  })
})
