import { describe, expect, it } from 'vitest'
import { classifyLine, toSplitRows } from '../src/renderer/src/diff-split'

describe('classifyLine', () => {
  it('classifies hunk, meta, add, del, ctx', () => {
    expect(classifyLine('@@ -1,2 +1,3 @@')).toBe('hunk')
    expect(classifyLine('--- a/x.ts')).toBe('meta')
    expect(classifyLine('+++ b/x.ts')).toBe('meta')
    expect(classifyLine('diff --git a/x b/x')).toBe('meta')
    expect(classifyLine('index abc..def 100644')).toBe('meta')
    expect(classifyLine('new file')).toBe('meta')
    expect(classifyLine('+added')).toBe('add')
    expect(classifyLine('-removed')).toBe('del')
    expect(classifyLine(' context')).toBe('ctx')
  })
})

describe('toSplitRows', () => {
  it('pairs balanced del/add runs side by side', () => {
    const rows = toSplitRows(['-old1', '-old2', '+new1', '+new2'])
    expect(rows).toEqual([
      { left: { text: 'old1', kind: 'del' }, right: { text: 'new1', kind: 'add' } },
      { left: { text: 'old2', kind: 'del' }, right: { text: 'new2', kind: 'add' } },
    ])
  })

  it('fills unbalanced runs with null cells', () => {
    const rows = toSplitRows(['-old1', '-old2', '+new1'])
    expect(rows).toEqual([
      { left: { text: 'old1', kind: 'del' }, right: { text: 'new1', kind: 'add' } },
      { left: { text: 'old2', kind: 'del' }, right: null },
    ])
  })

  it('renders context on both sides and headers full-width, flushing pending runs first', () => {
    const rows = toSplitRows(['@@ -1 +1 @@', '-gone', ' same', '+here'])
    expect(rows).toEqual([
      { header: '@@ -1 +1 @@', kind: 'hunk' },
      { left: { text: 'gone', kind: 'del' }, right: null },
      { left: { text: 'same', kind: 'ctx' }, right: { text: 'same', kind: 'ctx' } },
      { left: null, right: { text: 'here', kind: 'add' } },
    ])
  })

  it('flushes a trailing run at end of input', () => {
    expect(toSplitRows(['+tail'])).toEqual([{ left: null, right: { text: 'tail', kind: 'add' } }])
  })
})
