import { describe, expect, it } from 'vitest'
import { markdownToSlackHtml } from '../src/shared/slack-format'

describe('markdownToSlackHtml', () => {
  it('bolds known section headings and ### headings', () => {
    const html = markdownToSlackHtml('TODAY\n\nWhat I finished\n  - Fixed the map bug\n\nPending PRs\n\n### ENG-412 - Linked cases map view')
    expect(html).toContain('<div><b>TODAY</b></div>')
    expect(html).toContain('<div><b>What I finished</b></div>')
    expect(html).toContain('<div><b>ENG-412 - Linked cases map view</b></div>')
  })

  it('converts bullets to list items and markdown links to anchors', () => {
    const html = markdownToSlackHtml('- [app-ui#200](https://github.com/acme/app-ui/pull/200)\n- plain item')
    expect(html).toBe('<ul><li><a href="https://github.com/acme/app-ui/pull/200">app-ui#200</a></li><li>plain item</li></ul>')
  })

  it('escapes HTML in content', () => {
    expect(markdownToSlackHtml('use <Component> & friends')).toBe('<div>use &lt;Component&gt; &amp; friends</div>')
  })

  it('closes an open list when a non-bullet line follows', () => {
    const html = markdownToSlackHtml('- one\nafter')
    expect(html).toBe('<ul><li>one</li></ul><div>after</div>')
  })

  it('escapes quotes in link URLs so they cannot break out of the href attribute', () => {
    const html = markdownToSlackHtml('[click](https://evil.com/"onmouseover="alert(1))')
    expect(html).toContain('&quot;')
    expect(html).toContain('<a href="https://evil.com/&quot;onmouseover=&quot;alert(1">click</a>')
    expect(html).not.toMatch(/href="[^"]*"[^>]*"/) // href value must not contain a bare, unescaped quote
  })

  it('does not linkify javascript: URLs', () => {
    const html = markdownToSlackHtml('[click](javascript:alert(1))')
    expect(html).not.toContain('<a')
    expect(html).toContain('click')
  })

  it('still linkifies normal https URLs', () => {
    const html = markdownToSlackHtml('[docs](https://example.com/path)')
    expect(html).toBe('<div><a href="https://example.com/path">docs</a></div>')
  })
})
