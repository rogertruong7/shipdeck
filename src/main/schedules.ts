import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RUNS_DIR, SCHEDULES_FILE } from '../shared/paths'
import { readJson, writeJsonAtomic } from '../shared/state-files'
import { armReplacing, classifyInterrupted } from '../shared/schedule-logic'
import type { RunRecord, Schedule, ShipdeckConfig } from '../shared/types'

const exec = promisify(execFile)
const WAKE_LEAD_MS = 2 * 60 * 1000

export interface ArmInput {
  worktreePath: string
  repo: string
  branch: string
  fireAt: string
  args: string
}

export function pmsetDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${String(d.getFullYear()).slice(2)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

async function armWakeSafe(fireAt: Date): Promise<void> {
  try {
    await exec('sudo', ['-n', 'pmset', 'schedule', 'wake', pmsetDate(new Date(fireAt.getTime() - WAKE_LEAD_MS))])
  } catch (e) {
    console.warn('pmset wake arming failed (sudoers rule missing?):', e)
  }
}

async function cancelWakeSafe(fireAt: Date): Promise<void> {
  try {
    await exec('sudo', ['-n', 'pmset', 'schedule', 'cancel', 'wake', pmsetDate(new Date(fireAt.getTime() - WAKE_LEAD_MS))])
  } catch {
    // best-effort
  }
}

export async function armSchedule(input: ArmInput, config: ShipdeckConfig): Promise<Schedule[]> {
  const schedules = readJson<Schedule[]>(SCHEDULES_FILE, [])
  const existing = schedules.find(s => s.worktreePath === input.worktreePath && s.status === 'armed')
  const next: Schedule = {
    id: `sch_${randomBytes(4).toString('hex')}`,
    ...input,
    status: 'armed',
    createdAt: new Date().toISOString(),
  }
  const updated = armReplacing(schedules, next)
  writeJsonAtomic(SCHEDULES_FILE, updated)
  if (config.wakeArmingEnabled) {
    if (existing) await cancelWakeSafe(new Date(existing.fireAt))
    await armWakeSafe(new Date(next.fireAt))
  }
  return updated
}

export interface RunNowInput {
  worktreePath: string
  repo: string
  branch: string
  args: string
}

// Arm for "now" and kick the launchd agent so it fires this tick instead of
// waiting up to 60s. Execution still goes through the single agent path — no
// second runner, no double-commit risk.
export async function runNow(input: RunNowInput): Promise<Schedule[]> {
  const schedules = readJson<Schedule[]>(SCHEDULES_FILE, [])
  const next: Schedule = {
    id: `sch_${randomBytes(4).toString('hex')}`,
    ...input,
    fireAt: new Date().toISOString(),
    status: 'armed',
    createdAt: new Date().toISOString(),
  }
  writeJsonAtomic(SCHEDULES_FILE, armReplacing(schedules, next))
  await kickstartAgent()
  return readJson<Schedule[]>(SCHEDULES_FILE, [])
}

async function kickstartAgent(): Promise<void> {
  try {
    const uid = process.getuid?.() ?? 501
    await exec('launchctl', ['kickstart', `gui/${uid}/com.roger.shipdeck.agent`])
  } catch {
    // agent will still pick it up on its next 60s tick
  }
}

export interface ResumeInput {
  worktreePath: string
  repo: string
  branch: string
  args: string
  sessionId: string
}

// Re-run an interrupted run by resuming its claude session through the normal
// agent path. The new schedule fires immediately.
export async function resumeRun(input: ResumeInput): Promise<Schedule[]> {
  const { sessionId, ...rest } = input
  const schedules = readJson<Schedule[]>(SCHEDULES_FILE, [])
  const next: Schedule = {
    id: `sch_${randomBytes(4).toString('hex')}`,
    ...rest,
    fireAt: new Date().toISOString(),
    status: 'armed',
    createdAt: new Date().toISOString(),
    resumeSessionId: sessionId,
  }
  writeJsonAtomic(SCHEDULES_FILE, armReplacing(schedules, next))
  await kickstartAgent()
  return readJson<Schedule[]>(SCHEDULES_FILE, [])
}

// For runs stuck at "running" (agent died mid-run, orphaned process): kill the
// recorded process group if it's still alive, classify the run from whatever it
// logged (PR URL → done, otherwise needs_attention), and clear the schedule.
export function forceStopSchedule(id: string, now = new Date()): Schedule[] {
  const schedules = readJson<Schedule[]>(SCHEDULES_FILE, [])
  const target = schedules.find(s => s.id === id && s.status === 'running')
  if (!target) return schedules
  if (target.pid) {
    try {
      process.kill(-target.pid, 'SIGKILL')
    } catch {
      try {
        process.kill(target.pid, 'SIGKILL')
      } catch {
        // already gone
      }
    }
  }
  mkdirSync(RUNS_DIR, { recursive: true })
  const logPath = join(RUNS_DIR, `${id}.log`)
  let logText = ''
  try {
    logText = readFileSync(logPath, 'utf8')
  } catch {
    // no log yet
  }
  try {
    appendFileSync(logPath, '\nforce-stopped from the app\n')
  } catch {
    // best-effort
  }
  const recordPath = join(RUNS_DIR, `${id}.json`)
  if (!existsSync(recordPath)) {
    const { status, prUrl } = classifyInterrupted(logText)
    const record: RunRecord = {
      scheduleId: id,
      worktreePath: target.worktreePath,
      repo: target.repo,
      branch: target.branch,
      args: target.args,
      scheduledFor: target.fireAt,
      startedAt: target.startedAt ?? target.fireAt,
      finishedAt: now.toISOString(),
      exitCode: null,
      status,
      lateBySeconds: 0,
      ...(prUrl ? { prUrl } : {}),
      ...(target.sessionId ? { sessionId: target.sessionId } : {}),
    }
    writeJsonAtomic(recordPath, record)
  }
  const updated = schedules.filter(s => s.id !== id)
  writeJsonAtomic(SCHEDULES_FILE, updated)
  return updated
}

export async function cancelSchedule(id: string, config: ShipdeckConfig): Promise<Schedule[]> {
  const schedules = readJson<Schedule[]>(SCHEDULES_FILE, [])
  const target = schedules.find(s => s.id === id)
  const updated = schedules.filter(s => s.id !== id)
  writeJsonAtomic(SCHEDULES_FILE, updated)
  if (target && config.wakeArmingEnabled) await cancelWakeSafe(new Date(target.fireAt))
  return updated
}
