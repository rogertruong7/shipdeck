import { beforeAll, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Schedule } from '../src/shared/types'

const stateDir = mkdtempSync(join(tmpdir(), 'shipdeck-agent-'))
process.env.SHIPDECK_STATE_DIR = stateDir
process.env.SHIPDECK_NO_NOTIFY = '1'

const exec = promisify(execFile)
const g = (cwd: string, ...args: string[]) => exec('git', ['-C', cwd, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args])

let wt: string
let shimPath: string

let sleepShimPath: string

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'shipdeck-agent-wt-'))
  wt = join(root, 'repo')
  await mkdir(wt)
  await exec('git', ['init', '-b', 'main', wt])
  await writeFile(join(wt, 'a.txt'), 'x\n')
  await g(wt, 'add', 'a.txt')
  await g(wt, 'commit', '-m', 'init')
  await writeFile(join(wt, 'a.txt'), 'dirty\n')
  shimPath = join(root, 'claude')
  await writeFile(shimPath, '#!/bin/bash\necho "https://github.com/acme/alpha/pull/7"\n')
  chmodSync(shimPath, 0o755)
  sleepShimPath = join(root, 'claude-sleep')
  await writeFile(sleepShimPath, '#!/bin/bash\nsleep 2\necho "https://github.com/x/y/pull/9"\n')
  chmodSync(sleepShimPath, 0o755)
})

function seed(schedules: Schedule[], claudePath = shimPath): void {
  writeFileSync(join(stateDir, 'config.json'), JSON.stringify({ claudePath, shellPath: process.env.PATH }))
  writeFileSync(join(stateDir, 'schedules.json'), JSON.stringify(schedules))
}

function sch(over: Partial<Schedule>): Schedule {
  return {
    id: 'sch_tick1', worktreePath: wt, repo: 'alpha', branch: 'sam/x',
    fireAt: new Date(Date.now() - 60000).toISOString(), args: '', status: 'armed', createdAt: new Date().toISOString(),
    ...over,
  }
}

describe('tick', () => {
  it('fires due schedules, writes the run record, clears the schedule, heartbeats', async () => {
    seed([sch({}), sch({ id: 'sch_future', worktreePath: '/nonexistent', fireAt: new Date(Date.now() + 3600000).toISOString() })])
    const { tick } = await import('../src/agent/agent')
    await tick(new Date())
    const rec = JSON.parse(readFileSync(join(stateDir, 'runs', 'sch_tick1.json'), 'utf8'))
    expect(rec.status).toBe('done')
    expect(rec.prUrl).toContain('/pull/7')
    const left = JSON.parse(readFileSync(join(stateDir, 'schedules.json'), 'utf8'))
    expect(left.map((s: Schedule) => s.id)).toEqual(['sch_future'])
    const log = readFileSync(join(stateDir, 'agent.log'), 'utf8')
    expect(log).toContain('run start sch_tick1')
    expect(log).toContain('run end sch_tick1 done')
  })

  it('marks stale running schedules failed and drops them', async () => {
    seed([sch({ id: 'sch_stale', status: 'running', startedAt: new Date(Date.now() - 3 * 3600000).toISOString() })])
    const { tick } = await import('../src/agent/agent')
    await tick(new Date())
    const rec = JSON.parse(readFileSync(join(stateDir, 'runs', 'sch_stale.json'), 'utf8'))
    expect(rec.status).toBe('failed')
    expect(JSON.parse(readFileSync(join(stateDir, 'schedules.json'), 'utf8'))).toEqual([])
  })

  it('runAgent exits early when a live-pid lock exists, and replaces a dead-pid lock', async () => {
    const { runAgent } = await import('../src/agent/agent')
    seed([sch({ id: 'sch_locked' })])
    writeFileSync(join(stateDir, 'agent.lock'), String(process.pid))
    await runAgent()
    expect(existsSync(join(stateDir, 'runs', 'sch_locked.json'))).toBe(false)
    writeFileSync(join(stateDir, 'agent.lock'), '999999')
    await runAgent()
    expect(existsSync(join(stateDir, 'runs', 'sch_locked.json'))).toBe(true)
    expect(existsSync(join(stateDir, 'agent.lock'))).toBe(false)
  })

  it('runAgent bootstraps a missing state dir instead of silently no-oping', async () => {
    const { runAgent } = await import('../src/agent/agent')
    rmSync(stateDir, { recursive: true, force: true })
    await runAgent()
    expect(existsSync(join(stateDir, 'agent.log'))).toBe(true)
  })

  it('does not clobber a schedule armed mid-run, and still records the in-flight run as done', async () => {
    seed([sch({ id: 'sch_race1' })], sleepShimPath)
    const { tick } = await import('../src/agent/agent')
    const p = tick(new Date())
    await new Promise(resolve => setTimeout(resolve, 500))
    const midRun = JSON.parse(readFileSync(join(stateDir, 'schedules.json'), 'utf8')) as Schedule[]
    const armedDuringRun = sch({ id: 'sch_armed_during', fireAt: new Date(Date.now() + 3600000).toISOString() })
    writeFileSync(join(stateDir, 'schedules.json'), JSON.stringify([...midRun, armedDuringRun]))
    await p
    const after = JSON.parse(readFileSync(join(stateDir, 'schedules.json'), 'utf8')) as Schedule[]
    expect(after.map(s => s.id)).toContain('sch_armed_during')
    expect(after.map(s => s.id)).not.toContain('sch_race1')
    const rec = JSON.parse(readFileSync(join(stateDir, 'runs', 'sch_race1.json'), 'utf8'))
    expect(rec.status).toBe('done')
    expect(rec.prUrl).toContain('/pull/9')
  }, 10000)

  it('reconciles an orphaned running schedule from its log instead of waiting for the stale sweep', async () => {
    const orphan = sch({
      id: 'sch_orphan', status: 'running', startedAt: new Date().toISOString(),
      pid: 999999, sessionId: 'ses-orphan-1',
    })
    seed([orphan])
    mkdirSync(join(stateDir, 'runs'), { recursive: true })
    writeFileSync(join(stateDir, 'runs', 'sch_orphan.log'), 'pushed\nhttps://github.com/a/b/pull/3\n')
    const { tick } = await import('../src/agent/agent')
    await tick(new Date())
    const rec = JSON.parse(readFileSync(join(stateDir, 'runs', 'sch_orphan.json'), 'utf8'))
    expect(rec.status).toBe('done')
    expect(rec.prUrl).toContain('/pull/3')
    expect(rec.sessionId).toBe('ses-orphan-1')
    const left = JSON.parse(readFileSync(join(stateDir, 'schedules.json'), 'utf8')) as Schedule[]
    expect(left.find(s => s.id === 'sch_orphan')).toBeUndefined()
  })
})
