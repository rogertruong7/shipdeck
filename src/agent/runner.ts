import { execFile, spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { lateBySeconds, PR_URL_RE } from '../shared/schedule-logic'
import { formatStreamEvent } from '../shared/stream-format'
import type { RunRecord, Schedule, ShipdeckConfig } from '../shared/types'

const RUN_TIMEOUT_MS = 30 * 60 * 1000

export interface RunnerCtx {
  runsDir: string
  config: ShipdeckConfig
  now(): Date
  // Reports the spawned claude pid so the caller can persist it for force-stop.
  onSpawn?(pid: number): void
  // Reports the claude session id (from the first stream-json event) so
  // interrupted runs can be resumed.
  onSession?(sessionId: string): void
}

function isClean(wtPath: string): Promise<boolean> {
  return new Promise(resolve => {
    execFile('git', ['status', '--porcelain'], { cwd: wtPath }, (err, stdout) => resolve(!err && stdout.trim() === ''))
  })
}

function runClaude(s: Schedule, ctx: RunnerCtx, logPath: string): Promise<{ exitCode: number | null; output: string; sessionId?: string }> {
  return new Promise(resolve => {
    const bin = ctx.config.claudePath === 'auto' ? 'claude' : ctx.config.claudePath
    const prompt = s.resumeSessionId
      ? 'Continue this interrupted run from where it stopped and finish the task, then report the PR URL.'
      : s.args
        ? `/split-commit-pr ${s.args}`
        : '/split-commit-pr'
    const resumeArgs = s.resumeSessionId ? ['--resume', s.resumeSessionId] : []
    // stream-json makes progress visible live in the run log; plain -p prints
    // nothing until the very end, which reads as a hang in the Runs drawer
    const child = spawn(bin, ['-p', prompt, ...resumeArgs, '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose'], {
      cwd: s.worktreePath,
      env: { ...process.env, PATH: ctx.config.shellPath || (process.env.PATH ?? '') },
      detached: true,
      // claude -p reads piped stdin until EOF; an open pipe hangs it forever
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const log = createWriteStream(logPath)
    let output = ''
    let pending = ''
    let sessionId: string | undefined
    const captureSession = (line: string) => {
      if (sessionId || !line.trimStart().startsWith('{')) return
      try {
        const id = (JSON.parse(line) as { session_id?: string }).session_id
        if (typeof id === 'string' && id) {
          sessionId = id
          ctx.onSession?.(id)
        }
      } catch {
        // not JSON — plain shim output
      }
    }
    const emitLine = (line: string) => {
      captureSession(line)
      const formatted = formatStreamEvent(line)
      if (formatted === null) return
      output += `${formatted}\n`
      log.write(`${formatted}\n`)
    }
    child.stdout.on('data', (buf: Buffer) => {
      pending += buf.toString()
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) emitLine(line)
    })
    child.stderr.on('data', (buf: Buffer) => {
      output += buf.toString()
      log.write(buf)
    })
    if (child.pid) {
      ctx.onSpawn?.(child.pid)
      // -s holds a PreventSystemSleep assertion so closed-lid dark wakes survive
      // the run (AC only, which matches when scheduled wakes fire at all)
      const caffeinate = spawn('caffeinate', ['-s', '-i', '-w', String(child.pid)], { stdio: 'ignore' })
      caffeinate.on('error', () => {})
    }
    const timer = setTimeout(() => {
      log.write('killed after 30 minute timeout\n')
      try {
        process.kill(-child.pid!, 'SIGKILL')
      } catch {
        child.kill('SIGKILL')
      }
    }, RUN_TIMEOUT_MS)
    let settled = false
    child.on('error', err => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      log.write(`spawn error: ${err.message}\n`)
      log.end(() => resolve({ exitCode: null, output: `${output}\nspawn error: ${err.message}`, sessionId }))
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      if (pending) emitLine(pending)
      log.end(() => resolve({ exitCode: code, output, sessionId }))
    })
  })
}

export async function executeSchedule(s: Schedule, ctx: RunnerCtx): Promise<RunRecord> {
  const startedAt = ctx.now()
  const base = {
    scheduleId: s.id,
    worktreePath: s.worktreePath,
    repo: s.repo,
    branch: s.branch,
    args: s.args,
    scheduledFor: s.fireAt,
    startedAt: startedAt.toISOString(),
    lateBySeconds: lateBySeconds(s.fireAt, startedAt),
  }
  // resumed runs skip the clean check: the interrupted session may have
  // committed everything but died before opening the PR
  if (!s.resumeSessionId && (await isClean(s.worktreePath))) {
    return { ...base, finishedAt: ctx.now().toISOString(), exitCode: null, status: 'skipped_clean' }
  }
  const { exitCode, output, sessionId } = await runClaude(s, ctx, join(ctx.runsDir, `${s.id}.log`))
  const prUrl = output.match(PR_URL_RE)?.[0]
  const status = exitCode === 0 ? (prUrl ? 'done' : 'needs_attention') : 'failed'
  return { ...base, finishedAt: ctx.now().toISOString(), exitCode, status, ...(prUrl ? { prUrl } : {}), ...(sessionId ? { sessionId } : {}) }
}

export function escapeAppleScript(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')
}

export function notify(title: string, body: string): void {
  if (process.env.SHIPDECK_NO_NOTIFY) return
  const script = `display notification "${escapeAppleScript(body)}" with title "${escapeAppleScript(title)}"`
  execFile('osascript', ['-e', script], () => {})
}
