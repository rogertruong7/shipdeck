const SECTION_HEADINGS = new Set(['TODAY', 'What I finished', 'What I did', "What I'll do next", 'Pending PRs'])

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inline(s: string): string {
  // Note: this replace runs on already-escaped text, so `url` below has already
  // been through escapeHtml (quotes are `&quot;`/`&#39;`, making it attribute-safe).
  // The scheme check is unaffected by escaping since `:` and `/` are never escaped.
  return escapeHtml(s).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, text: string, url: string) =>
    /^https?:\/\//i.test(url) ? `<a href="${url}">${text}</a>` : text
  )
}

export function markdownToSlackHtml(md: string): string {
  const out: string[] = []
  let listOpen = false
  const closeList = () => {
    if (listOpen) {
      out.push('</ul>')
      listOpen = false
    }
  }
  for (const raw of md.split('\n')) {
    const trimmed = raw.trim()
    const bullet = trimmed.match(/^- (.*)$/)
    if (bullet) {
      if (!listOpen) {
        out.push('<ul>')
        listOpen = true
      }
      out.push(`<li>${inline(bullet[1])}</li>`)
      continue
    }
    closeList()
    if (trimmed === '') {
      out.push('<br>')
      continue
    }
    const h3 = trimmed.match(/^###\s+(.*)$/)
    if (h3) {
      out.push(`<div><b>${inline(h3[1])}</b></div>`)
      continue
    }
    if (SECTION_HEADINGS.has(trimmed)) {
      out.push(`<div><b>${escapeHtml(trimmed)}</b></div>`)
      continue
    }
    out.push(`<div>${inline(trimmed)}</div>`)
  }
  closeList()
  return out.join('')
}
