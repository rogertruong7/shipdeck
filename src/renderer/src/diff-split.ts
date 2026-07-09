export type LineKind = 'hunk' | 'meta' | 'add' | 'del' | 'ctx'

export function classifyLine(line: string): LineKind {
  if (line.startsWith('@@')) return 'hunk'
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('new file')) return 'meta'
  if (line.startsWith('+')) return 'add'
  if (line.startsWith('-')) return 'del'
  return 'ctx'
}

export interface SplitCell {
  text: string
  kind: 'add' | 'del' | 'ctx'
}

export type SplitRow = { header: string; kind: 'hunk' | 'meta' } | { left: SplitCell | null; right: SplitCell | null }

export function toSplitRows(lines: string[]): SplitRow[] {
  const rows: SplitRow[] = []
  let dels: string[] = []
  let adds: string[] = []
  const flush = () => {
    const n = Math.max(dels.length, adds.length)
    for (let i = 0; i < n; i++) {
      rows.push({
        left: i < dels.length ? { text: dels[i], kind: 'del' } : null,
        right: i < adds.length ? { text: adds[i], kind: 'add' } : null,
      })
    }
    dels = []
    adds = []
  }
  for (const line of lines) {
    const kind = classifyLine(line)
    if (kind === 'del') {
      dels.push(line.slice(1))
      continue
    }
    if (kind === 'add') {
      adds.push(line.slice(1))
      continue
    }
    flush()
    if (kind === 'hunk' || kind === 'meta') rows.push({ header: line, kind })
    else rows.push({ left: { text: line.slice(1), kind: 'ctx' }, right: { text: line.slice(1), kind: 'ctx' } })
  }
  flush()
  return rows
}
