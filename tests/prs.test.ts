import { beforeAll, describe, expect, it } from 'vitest'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { annotatePrUrls, clearPrCache, openPrsByBranch } from '../src/main/prs'

let shimDir: string
let countFile: string

// A fake `gh` that logs each invocation and prints two open PRs.
beforeAll(() => {
  shimDir = mkdtempSync(join(tmpdir(), 'shipdeck-prs-'))
  countFile = join(shimDir, 'count')
  writeFileSync(countFile, '')
  const gh = join(shimDir, 'gh')
  writeFileSync(
    gh,
    `#!/bin/bash\necho x >> ${countFile}\necho '[{"headRefName":"sam/eng-1-a","url":"https://github.com/acme/r/pull/1"},{"headRefName":"main-fix","url":"https://github.com/acme/r/pull/2"}]'\n`,
  )
  chmodSync(gh, 0o755)
})

const calls = () => readFileSync(countFile, 'utf8').split('\n').filter(Boolean).length

describe('openPrsByBranch', () => {
  it('maps head branches to PR urls and caches per repo', async () => {
    clearPrCache()
    const root = mkdtempSync(join(tmpdir(), 'repo-'))
    const map = await openPrsByBranch(root, shimDir)
    expect(map.get('sam/eng-1-a')).toBe('https://github.com/acme/r/pull/1')
    const before = calls()
    await openPrsByBranch(root, shimDir)
    expect(calls()).toBe(before) // served from cache, no second gh call
  })

  it('caches an empty map when gh fails', async () => {
    clearPrCache()
    const root = mkdtempSync(join(tmpdir(), 'repo-'))
    const map = await openPrsByBranch(root, mkdtempSync(join(tmpdir(), 'empty-path-'))) // no gh on PATH
    expect(map.size).toBe(0)
  })
})

describe('annotatePrUrls', () => {
  it('sets prUrl on worktrees whose branch has an open PR, one gh call per repo root', async () => {
    clearPrCache()
    const root = mkdtempSync(join(tmpdir(), 'repo-'))
    const before = calls()
    const wts = await annotatePrUrls(
      [
        { repoRoot: root, branch: 'sam/eng-1-a', prUrl: undefined as string | undefined },
        { repoRoot: root, branch: 'no-pr-branch', prUrl: undefined as string | undefined },
        { repoRoot: root, branch: null, prUrl: undefined as string | undefined },
      ],
      shimDir,
    )
    expect(wts[0].prUrl).toBe('https://github.com/acme/r/pull/1')
    expect(wts[1].prUrl).toBeUndefined()
    expect(wts[2].prUrl).toBeUndefined()
    expect(calls()).toBe(before + 1)
  })
})
