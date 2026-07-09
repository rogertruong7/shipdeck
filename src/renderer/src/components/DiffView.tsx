import { useEffect, useState } from 'react'
import hljs from 'highlight.js'
import { api } from '../api'
import { classifyLine, toSplitRows } from '../diff-split'

const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', swift: 'swift',
  css: 'css', scss: 'scss', html: 'xml', json: 'json', yml: 'yaml', yaml: 'yaml',
  md: 'markdown', sh: 'bash', zsh: 'bash', tf: 'ini', sql: 'sql', toml: 'ini',
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function highlightLine(code: string, lang?: string): string {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
    } catch {
      // fall through to escaped plain text
    }
  }
  return escapeHtml(code)
}

type ViewMode = 'unified' | 'split'

interface Props {
  worktreePath: string
  file: string
  untracked: boolean
  vsBranch?: boolean
}

export function DiffView({ worktreePath, file, untracked, vsBranch = false }: Props) {
  const [diff, setDiff] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>(() => (localStorage.getItem('shipdeck.diffView') === 'split' ? 'split' : 'unified'))

  useEffect(() => {
    let stale = false
    setDiff(null)
    void api.getFileDiff(worktreePath, file, untracked, vsBranch).then(d => {
      if (!stale) setDiff(d)
    })
    return () => {
      stale = true
    }
  }, [worktreePath, file, untracked, vsBranch])

  const setViewPersist = (v: ViewMode) => {
    localStorage.setItem('shipdeck.diffView', v)
    setView(v)
  }

  if (diff === null) return <pre className="diff">loading…</pre>
  if (diff.trim() === '') return <pre className="diff">no diff (file may be staged-only or empty)</pre>
  const lang = EXT_LANG[file.split('.').pop() ?? '']
  const lines = diff.split('\n')

  return (
    <div className="diff">
      <div className="diff-toolbar">
        <button className={`seg ${view === 'unified' ? 'active' : ''}`} onClick={() => setViewPersist('unified')}>
          Unified
        </button>
        <button className={`seg ${view === 'split' ? 'active' : ''}`} onClick={() => setViewPersist('split')}>
          Split
        </button>
      </div>
      {view === 'unified' ? (
        <pre className="diff-body">
          {lines.map((line, i) => {
            const kind = classifyLine(line)
            const isCode = kind === 'add' || kind === 'del' || kind === 'ctx'
            const body = isCode ? line.slice(1) : line
            const marker = kind === 'add' ? '+' : kind === 'del' ? '−' : ' '
            return (
              <div key={i} className={`dl ${kind}`}>
                <span className="marker">{marker}</span>
                <span dangerouslySetInnerHTML={{ __html: isCode ? highlightLine(body, lang) : escapeHtml(line) }} />
              </div>
            )
          })}
        </pre>
      ) : (
        <pre className="diff-body">
          {toSplitRows(lines).map((row, i) =>
            'header' in row ? (
              <div key={i} className={`dl ${row.kind}`}>
                <span className="marker"> </span>
                <span dangerouslySetInnerHTML={{ __html: escapeHtml(row.header) }} />
              </div>
            ) : (
              <div key={i} className="split-row">
                <span
                  className={`split-cell ${row.left ? row.left.kind : 'blank'}`}
                  dangerouslySetInnerHTML={{ __html: row.left ? highlightLine(row.left.text, lang) : '&nbsp;' }}
                />
                <span
                  className={`split-cell ${row.right ? row.right.kind : 'blank'}`}
                  dangerouslySetInnerHTML={{ __html: row.right ? highlightLine(row.right.text, lang) : '&nbsp;' }}
                />
              </div>
            ),
          )}
        </pre>
      )}
    </div>
  )
}
