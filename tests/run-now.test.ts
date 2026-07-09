import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const stateDir = mkdtempSync(join(tmpdir(), 'shipdeck-runnow-'))
process.env.SHIPDECK_STATE_DIR = stateDir

const { resumeRun, runNow } = await import('../src/main/schedules')
import type { Schedule } from '../src/shared/types'

describe('runNow', () => {
  it('arms a schedule with fireAt in the past so the agent fires it immediately', async () => {
    const before = Date.now()
    const out = await runNow({ worktreePath: '/w/a', repo: 'repo-a', branch: 'sam/x', args: '' })
    expect(out).toHaveLength(1)
    expect(out[0].status).toBe('armed')
    expect(out[0].id).toMatch(/^sch_[0-9a-f]{8}$/)
    expect(Date.parse(out[0].fireAt)).toBeLessThanOrEqual(before + 1000)
    const onDisk = JSON.parse(readFileSync(join(stateDir, 'schedules.json'), 'utf8')) as Schedule[]
    expect(onDisk).toHaveLength(1)
  })

  it('replaces an existing armed schedule for the same worktree', async () => {
    await runNow({ worktreePath: '/w/a', repo: 'repo-a', branch: 'sam/x', args: '' })
    const out = await runNow({ worktreePath: '/w/a', repo: 'repo-a', branch: 'sam/x', args: 'v' })
    expect(out.filter(s => s.worktreePath === '/w/a')).toHaveLength(1)
    expect(out.find(s => s.worktreePath === '/w/a')?.args).toBe('v')
  })
})

describe('resumeRun', () => {
  it('arms an immediate schedule carrying the session to resume', async () => {
    const out = await resumeRun({ worktreePath: '/w/r', repo: 'repo-a', branch: 'sam/x', args: '', sessionId: 'ses-1' })
    const entry = out.find(s => s.worktreePath === '/w/r')
    expect(entry?.status).toBe('armed')
    expect(entry?.resumeSessionId).toBe('ses-1')
    expect(Date.parse(entry!.fireAt)).toBeLessThanOrEqual(Date.now())
  })
})
