import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AGENT_LOCK, AGENT_LOG, CONFIG_FILE, RUNS_DIR, SCHEDULES_FILE, STATE_DIR } from '../shared/paths'
import { appendLog, readJson, writeJsonAtomic } from '../shared/state-files'
import { selectDue, staleRunning } from '../shared/schedule-logic'
import { DEFAULT_CONFIG, type Schedule, type ShipdeckConfig } from '../shared/types'
import { executeSchedule, notify } from './runner'

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function acquireLock(): boolean {
  try {
    mkdirSync(STATE_DIR, { recursive: true })
    if (existsSync(AGENT_LOCK)) {
      const pid = Number(readFileSync(AGENT_LOCK, 'utf8'))
      if (pid && pidAlive(pid)) return false
      unlinkSync(AGENT_LOCK)
    }
    writeFileSync(AGENT_LOCK, String(process.pid), { flag: 'wx' })
    return true
  } catch {
    return false
  }
}

function mutateSchedules(fn: (s: Schedule[]) => Schedule[]): Schedule[] {
  const next = fn(readJson<Schedule[]>(SCHEDULES_FILE, []))
  writeJsonAtomic(SCHEDULES_FILE, next)
  return next
}

function writeFailedRecordIfMissing(s: Schedule, now: Date): void {
  const recordPath = join(RUNS_DIR, `${s.id}.json`)
  if (existsSync(recordPath)) return
  writeJsonAtomic(recordPath, {
    scheduleId: s.id, worktreePath: s.worktreePath, repo: s.repo, branch: s.branch, args: s.args,
    scheduledFor: s.fireAt, startedAt: s.startedAt ?? s.fireAt, finishedAt: now.toISOString(),
    exitCode: null, status: 'failed', lateBySeconds: 0,
  })
}

export async function tick(now = new Date()): Promise<void> {
  mkdirSync(RUNS_DIR, { recursive: true })
  appendLog(AGENT_LOG, 'tick')
  const config: ShipdeckConfig = { ...DEFAULT_CONFIG, ...readJson<Partial<ShipdeckConfig>>(CONFIG_FILE, {}) }

  const stale = staleRunning(readJson<Schedule[]>(SCHEDULES_FILE, []), now)
  if (stale.length > 0) {
    const staleIds = new Set(stale.map(s => s.id))
    for (const s of stale) {
      writeFailedRecordIfMissing(s, now)
      appendLog(AGENT_LOG, `stale running schedule ${s.id} marked failed`)
    }
    mutateSchedules(s => s.filter(x => !staleIds.has(x.id)))
  }

  for (const due of selectDue(readJson<Schedule[]>(SCHEDULES_FILE, []), now)) {
    try {
      const afterMark = mutateSchedules(s =>
        s.map(x => (x.id === due.id && x.status === 'armed' ? { ...x, status: 'running' as const, startedAt: new Date().toISOString() } : x)),
      )
      const running = afterMark.find(x => x.id === due.id)
      if (!running || running.status !== 'running') {
        appendLog(AGENT_LOG, `skip ${due.id}: cancelled before start`)
        continue
      }
      appendLog(AGENT_LOG, `run start ${due.id} ${due.repo}@${due.branch}`)
      const record = await executeSchedule(running, {
        runsDir: RUNS_DIR,
        config,
        now: () => new Date(),
        // persist the claude pid so the app's force-stop can kill the process group
        onSpawn: pid => mutateSchedules(s => s.map(x => (x.id === due.id ? { ...x, pid } : x))),
      })
      writeJsonAtomic(join(RUNS_DIR, `${due.id}.json`), record)
      mutateSchedules(s => s.filter(x => x.id !== due.id))
      appendLog(AGENT_LOG, `run end ${due.id} ${record.status}`)
      const title = record.status === 'done' ? 'Shipdeck: PR created' : `Shipdeck: ${record.status.replace('_', ' ')}`
      notify(title, `${due.repo} @ ${due.branch}${record.prUrl ? ` → ${record.prUrl}` : ''}`)
    } catch (e) {
      appendLog(AGENT_LOG, `run error ${due.id}: ${String(e)}`)
      mutateSchedules(s => s.filter(x => x.id !== due.id))
      writeFailedRecordIfMissing(due, new Date())
    }
  }
}

export async function runAgent(): Promise<void> {
  if (!acquireLock()) return
  try {
    await tick()
  } catch (e) {
    appendLog(AGENT_LOG, `error: ${String(e)}`)
  } finally {
    try {
      unlinkSync(AGENT_LOCK)
    } catch {
      // already gone
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('agent.js')) {
  void runAgent()
}
