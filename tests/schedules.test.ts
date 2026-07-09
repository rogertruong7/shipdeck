import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const stateDir = mkdtempSync(join(tmpdir(), 'shipdeck-sched-'))
process.env.SHIPDECK_STATE_DIR = stateDir

const { armSchedule, cancelSchedule, pmsetDate } = await import('../src/main/schedules')
const { DEFAULT_CONFIG } = await import('../src/shared/types')

const noWake = { ...DEFAULT_CONFIG, wakeArmingEnabled: false }
const input = { worktreePath: '/w/a', repo: 'repo-a', branch: 'sam/x', fireAt: new Date(Date.now() + 3600000).toISOString(), args: 'v' }

describe('pmsetDate', () => {
  it('formats MM/dd/yy HH:mm:ss in local time', () => {
    const d = new Date(2026, 6, 8, 17, 28, 0)
    expect(pmsetDate(d)).toBe('07/08/26 17:28:00')
  })
})

describe('armSchedule / cancelSchedule', () => {
  it('persists an armed schedule with a generated id', async () => {
    const out = await armSchedule(input, noWake)
    expect(out).toHaveLength(1)
    expect(out[0].id).toMatch(/^sch_[0-9a-f]{8}$/)
    expect(out[0].status).toBe('armed')
    expect(JSON.parse(readFileSync(join(stateDir, 'schedules.json'), 'utf8'))).toHaveLength(1)
  })

  it('replaces the armed schedule for the same worktree', async () => {
    const out = await armSchedule({ ...input, args: 'd,p' }, noWake)
    expect(out).toHaveLength(1)
    expect(out[0].args).toBe('d,p')
  })

  it('cancel removes by id', async () => {
    const [only] = await armSchedule(input, noWake)
    const out = await cancelSchedule(only.id, noWake)
    expect(out).toEqual([])
  })
})
