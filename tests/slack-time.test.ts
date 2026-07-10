import { describe, expect, it } from 'vitest'
import { toPostAt, validatePostAt } from '../src/shared/slack-time'

const now = new Date('2026-07-10T12:00:00Z')

describe('validatePostAt', () => {
  it('accepts a time a few minutes out', () => {
    expect(validatePostAt(new Date('2026-07-10T12:30:00Z'), now)).toBeNull()
  })

  it('rejects past times and exactly-now', () => {
    expect(validatePostAt(new Date('2026-07-10T11:59:00Z'), now)).toContain('past')
    expect(validatePostAt(now, now)).toContain('past')
  })

  it('rejects more than 120 days ahead', () => {
    expect(validatePostAt(new Date('2026-11-10T12:00:00Z'), now)).toContain('120 days')
  })

  it('accepts just under 120 days ahead', () => {
    expect(validatePostAt(new Date('2026-11-06T12:00:00Z'), now)).toBeNull()
  })

  it('rejects invalid dates', () => {
    expect(validatePostAt(new Date('nope'), now)).toContain('valid')
  })
})

describe('toPostAt', () => {
  it('converts to unix seconds, flooring sub-second precision', () => {
    expect(toPostAt(new Date(1780000000500))).toBe(1780000000)
  })
})
