import { execFile, spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { lateBySeconds } from '../shared/schedule-logic'
import { formatStreamEvent } from '../shared/stream-format'
import type { RunRecord, Schedule, ShipdeckConfig } from '../shared/types'

const PR_URL_RE = /https:\/\/github\.com\/[^\s)]+\/pull\/\d+/
const RUN_TIMEOUT_MS = 30 * 60 * 1000

export interface RunnerCtx {
  runsDir: string
  config: ShipdeckConfig
  now(): Date
}

function isClean(wtPath: string): Promise<boolean> {
  return new Promise(resolve => {
    execFile('git', ['status', '--porcelain'], { cwd: wtPath }, (err, stdout) => resolve(!err && stdout.trim() === ''))
  })
}

function runClaude(s: Schedule, ctx: RunnerCtx, logPath: string): Promise<{ exitCode: number | null; output: string }> {
  return new Promise(resolve => {
    const bin = ctx.config.claudePath === 'auto' ? 'claude' : ctx.config.claudePath
    const prompt = s.args ? `/split-commit-pr ${s.args}` : '/split-commit-pr'
    // stream-json makes progress visible live in the run log; plain -p prints
    // nothing until the very end, which reads as a hang in the Runs drawer
    const child = spawn(bin, ['-p', prompt, '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose'], {
      cwd: s.worktreePath,
      env: { ...process.env, PATH: ctx.config.shellPath || (process.env.PATH ?? '') },
      detached: true,
      // claude -p reads piped stdin until EOF; an open pipe hangs it forever
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const log = createWriteStream(logPath)
    let output = ''
    let pending = ''
    const emitLine = (line: string) => {
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
      const caffeinate = spawn('caffeinate', ['-i', '-w', String(child.pid)], { stdio: 'ignore' })
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
      log.end(() => resolve({ exitCode: null, output: `${output}\nspawn error: ${err.message}` }))
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      if (pending) emitLine(pending)
      log.end(() => resolve({ exitCode: code, output }))
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
  if (await isClean(s.worktreePath)) {
    return { ...base, finishedAt: ctx.now().toISOString(), exitCode: null, status: 'skipped_clean' }
  }
  const { exitCode, output } = await runClaude(s, ctx, join(ctx.runsDir, `${s.id}.log`))
  const prUrl = output.match(PR_URL_RE)?.[0]
  const status = exitCode === 0 ? (prUrl ? 'done' : 'needs_attention') : 'failed'
  return { ...base, finishedAt: ctx.now().toISOString(), exitCode, status, ...(prUrl ? { prUrl } : {}) }
}

export function escapeAppleScript(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')
}

export function notify(title: string, body: string): void {
  if (process.env.SHIPDECK_NO_NOTIFY) return
  const script = `display notification "${escapeAppleScript(body)}" with title "${escapeAppleScript(title)}"`
  execFile('osascript', ['-e', script], () => {})
}
