// Translates one line of `claude --output-format stream-json --verbose` into a
// human-readable log line for the run log, or null to skip it.

const MAX_DETAIL = 200

interface ContentBlock {
  type: string
  text?: string
  name?: string
  input?: Record<string, unknown>
}

function truncate(s: string): string {
  return s.length > MAX_DETAIL ? `${s.slice(0, MAX_DETAIL)}…` : s
}

function toolDetail(input: Record<string, unknown> | undefined): string {
  if (!input) return ''
  const interesting = input.command ?? input.file_path ?? input.pattern ?? input.url ?? input.prompt
  return typeof interesting === 'string' && interesting ? `: ${truncate(interesting.replace(/\n/g, ' '))}` : ''
}

export function formatStreamEvent(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  let event: { type?: string; message?: { content?: ContentBlock[] }; result?: string }
  try {
    event = JSON.parse(trimmed)
  } catch {
    return trimmed // plain output (older CLI, shims) passes through untouched
  }
  if (event.type === 'result') return typeof event.result === 'string' && event.result ? event.result : null
  if (event.type !== 'assistant') return null
  const parts: string[] = []
  for (const block of event.message?.content ?? []) {
    if (block.type === 'text' && block.text?.trim()) parts.push(block.text.trim())
    else if (block.type === 'tool_use') parts.push(`[tool] ${block.name ?? 'unknown'}${toolDetail(block.input)}`)
  }
  return parts.length > 0 ? parts.join('\n') : null
}
