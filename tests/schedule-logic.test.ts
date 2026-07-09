import { describe, expect, it } from 'vitest'
import { armReplacing, classifyInterrupted, lateBySeconds, selectDue, staleRunning } from '../src/shared/schedule-logic'
import type { Schedule } from '../src/shared/types'

function sch(over: Partial<Schedule>): Schedule {
  return {
    id: 'sch_1', worktreePath: '/w/a', repo: 'repo-a', branch: 'sam/x',
    fireAt: '2026-07-08T17:30:00.000Z', args: '', status: 'armed', createdAt: '2026-07-08T10:00:00.000Z',
    ...over,
  }
}

describe('selectDue', () => {
  it('returns only armed schedules whose fireAt has passed, oldest first', () => {
    const now = new Date('2026-07-08T17:31:00.000Z')
    const due = selectDue([
      sch({ id: 'a', fireAt: '2026-07-08T17:30:00.000Z' }),
      sch({ id: 'b', fireAt: '2026-07-08T18:00:00.000Z' }),
      sch({ id: 'c', fireAt: '2026-07-08T16:00:00.000Z' }),
      sch({ id: 'd', fireAt: '2026-07-08T16:00:00.000Z', status: 'running' }),
    ], now)
    expect(due.map(s => s.id)).toEqual(['c', 'a'])
  })
})

describe('armReplacing', () => {
  it('replaces an armed schedule for the same worktree, leaves others alone', () => {
    const next = sch({ id: 'new', worktreePath: '/w/a' })
    const out = armReplacing([
      sch({ id: 'old', worktreePath: '/w/a' }),
      sch({ id: 'other', worktreePath: '/w/b' }),
      sch({ id: 'busy', worktreePath: '/w/a', status: 'running' }),
    ], next)
    expect(out.map(s => s.id).sort()).toEqual(['busy', 'new', 'other'])
  })
})

describe('lateBySeconds', () => {
  it('is 0 when on time and positive when late', () => {
    expect(lateBySeconds('2026-07-08T17:30:00.000Z', new Date('2026-07-08T17:30:20.000Z'))).toBe(20)
    expect(lateBySeconds('2026-07-08T17:30:00.000Z', new Date('2026-07-08T17:29:00.000Z'))).toBe(0)
  })
})

describe('classifyInterrupted', () => {
  it('is done with the URL when the log contains a PR link', () => {
    expect(classifyInterrupted('pushed\nhttps://github.com/a/b/pull/12\ndone')).toEqual({
      status: 'done',
      prUrl: 'https://github.com/a/b/pull/12',
    })
  })

  it('is needs_attention when no PR link appears', () => {
    expect(classifyInterrupted('working on it…')).toEqual({ status: 'needs_attention' })
    expect(classifyInterrupted('')).toEqual({ status: 'needs_attention' })
  })
})

describe('staleRunning', () => {
  it('flags running schedules older than 2 hours', () => {
    const now = new Date('2026-07-08T12:00:00.000Z')
    const out = staleRunning([
      sch({ id: 'fresh', status: 'running', startedAt: '2026-07-08T11:30:00.000Z' }),
      sch({ id: 'stale', status: 'running', startedAt: '2026-07-08T09:30:00.000Z' }),
      sch({ id: 'armed', status: 'armed' }),
    ], now)
    expect(out.map(s => s.id)).toEqual(['stale'])
  })
})
