import { describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Schedule } from '../src/shared/types'

const stateDir = mkdtempSync(join(tmpdir(), 'shipdeck-fstop-'))
process.env.SHIPDECK_STATE_DIR = stateDir

const { forceStopSchedule } = await import('../src/main/schedules')

const schedulesFile = join(stateDir, 'schedules.json')
const runsDir = join(stateDir, 'runs')
mkdirSync(runsDir, { recursive: true })

function seed(over: Partial<Schedule> = {}): Schedule {
  const s: Schedule = {
    id: 'sch_00000000', worktreePath: '/w/a', repo: 'repo-a', branch: 'sam/x', args: '',
    fireAt: '2026-07-09T08:00:00.000Z', status: 'running', createdAt: '2026-07-09T08:00:00.000Z',
    startedAt: '2026-07-09T08:00:05.000Z',
    ...over,
  }
  writeFileSync(schedulesFile, JSON.stringify([s]))
  return s
}

async function waitForExit(pid: number): Promise<boolean> {
  for (let i = 0; i < 40; i++) {
    try {
      process.kill(pid, 0)
    } catch {
      return true
    }
    await new Promise(r => setTimeout(r, 50))
  }
  return false
}

describe('forceStopSchedule', () => {
  it('clears the schedule and records needs_attention when the log has no PR URL', () => {
    const s = seed({ id: 'sch_aaaaaaaa' })
    writeFileSync(join(runsDir, `${s.id}.log`), 'working…\n')
    const out = forceStopSchedule(s.id, new Date('2026-07-09T09:00:00.000Z'))
    expect(out).toEqual([])
    const record = JSON.parse(readFileSync(join(runsDir, `${s.id}.json`), 'utf8'))
    expect(record.status).toBe('needs_attention')
    expect(record.exitCode).toBeNull()
    expect(record.prUrl).toBeUndefined()
    expect(readFileSync(join(runsDir, `${s.id}.log`), 'utf8')).toContain('force-stopped from the app')
  })

  it('classifies done with the PR URL when the log already contains one', () => {
    const s = seed({ id: 'sch_bbbbbbbb', sessionId: 'ses-fs-1' })
    writeFileSync(join(runsDir, `${s.id}.log`), 'pushed\nhttps://github.com/acme/repo-a/pull/12\n')
    forceStopSchedule(s.id)
    const record = JSON.parse(readFileSync(join(runsDir, `${s.id}.json`), 'utf8'))
    expect(record.status).toBe('done')
    expect(record.prUrl).toBe('https://github.com/acme/repo-a/pull/12')
    expect(record.sessionId).toBe('ses-fs-1')
  })

  it('kills the recorded detached process group', async () => {
    const child = spawn('sleep', ['60'], { detached: true, stdio: 'ignore' })
    child.unref()
    const s = seed({ id: 'sch_cccccccc', pid: child.pid })
    forceStopSchedule(s.id)
    expect(await waitForExit(child.pid!)).toBe(true)
  })

  it('classifies done from the schedule prUrl when the log lacks the link', () => {
    const s = seed({ id: 'sch_99999999', prUrl: 'https://github.com/acme/repo-a/pull/44' })
    forceStopSchedule(s.id)
    const record = JSON.parse(readFileSync(join(runsDir, `${s.id}.json`), 'utf8'))
    expect(record.status).toBe('done')
    expect(record.prUrl).toBe('https://github.com/acme/repo-a/pull/44')
  })

  it('survives a pid that is already dead', () => {
    const s = seed({ id: 'sch_dddddddd', pid: 999999 })
    expect(() => forceStopSchedule(s.id)).not.toThrow()
    expect(JSON.parse(readFileSync(schedulesFile, 'utf8'))).toEqual([])
  })

  it('ignores armed schedules and unknown ids', () => {
    const s = seed({ id: 'sch_eeeeeeee', status: 'armed' })
    expect(forceStopSchedule(s.id)).toHaveLength(1)
    expect(forceStopSchedule('sch_nope')).toHaveLength(1)
    expect(existsSync(join(runsDir, `${s.id}.json`))).toBe(false)
  })

  it('does not overwrite an existing run record', () => {
    const s = seed({ id: 'sch_ffffffff' })
    writeFileSync(join(runsDir, `${s.id}.json`), JSON.stringify({ scheduleId: s.id, status: 'done', prUrl: 'https://github.com/a/b/pull/1' }))
    forceStopSchedule(s.id)
    const record = JSON.parse(readFileSync(join(runsDir, `${s.id}.json`), 'utf8'))
    expect(record.status).toBe('done')
    expect(JSON.parse(readFileSync(schedulesFile, 'utf8'))).toEqual([])
  })
})
