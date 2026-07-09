import { describe, expect, it } from 'vitest'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runDailySummary } from '../src/main/claude-runner'
import { DEFAULT_CONFIG } from '../src/shared/types'

function makeShim(script: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'shipdeck-sum-'))
  const p = join(dir, 'claude')
  writeFileSync(p, `#!/bin/bash\n${script}\n`)
  chmodSync(p, 0o755)
  return p
}

function collect(claudePath: string): Promise<{ chunks: string[]; done: { ok: boolean; text: string } }> {
  return new Promise(resolve => {
    const chunks: string[] = []
    runDailySummary(
      { ...DEFAULT_CONFIG, claudePath, shellPath: process.env.PATH ?? '' },
      (channel, payload) => {
        if (channel === 'summary:chunk') chunks.push(payload as string)
        else resolve({ chunks, done: payload as { ok: boolean; text: string } })
      },
      tmpdir(),
    )
  })
}

describe('runDailySummary', () => {
  it('streams chunks and reports ok with full text', async () => {
    const shim = makeShim('echo "TODAY"; echo ""; echo "What I finished"; echo "  - thing"')
    const { chunks, done } = await collect(shim)
    expect(done.ok).toBe(true)
    expect(done.text).toContain('What I finished')
    expect(chunks.join('')).toBe(done.text)
  })

  it('reports not-ok on nonzero exit', async () => {
    const shim = makeShim('echo partial; exit 2')
    const { done } = await collect(shim)
    expect(done.ok).toBe(false)
    expect(done.text).toContain('partial')
  })

  it('emits summary:done exactly once with the error message when spawn fails', async () => {
    const dones: Array<{ ok: boolean; text: string; error?: string }> = []
    await new Promise<void>(resolve => {
      runDailySummary(
        { ...DEFAULT_CONFIG, claudePath: '/nonexistent/claude-binary', shellPath: process.env.PATH ?? '' },
        (channel, payload) => {
          if (channel === 'summary:done') dones.push(payload as { ok: boolean; text: string; error?: string })
        },
        tmpdir(),
      )
      setTimeout(resolve, 500)
    })
    expect(dones).toHaveLength(1)
    expect(dones[0].ok).toBe(false)
    expect(dones[0].error).toBeTruthy()
  })
})
