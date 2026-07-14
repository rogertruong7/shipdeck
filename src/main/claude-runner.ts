import { spawn } from 'node:child_process'
import { expandTilde } from '../shared/paths'
import { formatStreamEvent } from '../shared/stream-format'
import { modelArgs, type ShipdeckConfig } from '../shared/types'

const SUMMARY_TIMEOUT_MS = 10 * 60 * 1000

export function runDailySummary(
  config: ShipdeckConfig,
  emit: (channel: 'summary:chunk' | 'summary:log' | 'summary:done', payload: unknown) => void,
  cwdOverride?: string,
): void {
  const bin = config.claudePath === 'auto' ? 'claude' : config.claudePath
  // stream-json surfaces progress live; the final result block carries the
  // actual summary text, which we accumulate for the rendered output + copy.
  const child = spawn(bin, ['-p', '/daily-summary', ...modelArgs(config.model), '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose'], {
    cwd: cwdOverride ?? expandTilde(config.summaryDir),
    env: { ...process.env, PATH: config.shellPath || (process.env.PATH ?? '') },
    // claude -p reads piped stdin until EOF; an open pipe hangs it forever
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let result = ''
  let pending = ''
  let settled = false
  const timer = setTimeout(() => child.kill('SIGKILL'), SUMMARY_TIMEOUT_MS)

  const handleLine = (line: string) => {
    // stream-json emits one JSON object per line, each starting with '{'.
    // Anything else is plain summary text (shim / older CLI) — preserve it raw,
    // indentation and blank lines intact, since the summary format depends on it.
    if (!line.startsWith('{')) {
      result += `${line}\n`
      emit('summary:chunk', `${line}\n`)
      return
    }
    try {
      const event = JSON.parse(line) as { type?: string; result?: string }
      if (event.type === 'result' && typeof event.result === 'string') {
        result = event.result // the result block is the finished summary itself
        emit('summary:chunk', event.result)
        return
      }
    } catch {
      return
    }
    const formatted = formatStreamEvent(line)
    if (formatted !== null) emit('summary:log', formatted)
  }

  child.stdout.on('data', b => {
    pending += b.toString()
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) handleLine(line)
  })
  child.stderr.on('data', b => emit('summary:log', b.toString()))
  child.on('error', e => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    emit('summary:done', { ok: false, text: result, error: e.message })
  })
  child.on('close', code => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    if (pending) handleLine(pending)
    emit('summary:done', { ok: code === 0, text: result })
  })
}
