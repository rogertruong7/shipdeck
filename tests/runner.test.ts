import { beforeAll, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { chmodSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { escapeAppleScript, executeSchedule } from '../src/agent/runner'
import { DEFAULT_CONFIG, type Schedule, type ShipdeckConfig } from '../src/shared/types'

const exec = promisify(execFile)
const g = (cwd: string, ...args: string[]) => exec('git', ['-C', cwd, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args])

let root: string
let dirtyWt: string
let cleanWt: string
let runsDir: string

async function makeShim(dir: string, name: string, script: string): Promise<string> {
  const p = join(dir, name)
  await writeFile(p, `#!/bin/bash\n${script}\n`)
  chmodSync(p, 0o755)
  return p
}

function cfg(claudePath: string): ShipdeckConfig {
  return { ...DEFAULT_CONFIG, claudePath, shellPath: process.env.PATH ?? '' }
}

function sch(worktreePath: string, over: Partial<Schedule> = {}): Schedule {
  return {
    id: `sch_${Math.random().toString(16).slice(2, 8)}`, worktreePath, repo: 'alpha', branch: 'sam/x',
    fireAt: new Date(Date.now() - 60000).toISOString(), args: 'v,d', status: 'armed', createdAt: new Date().toISOString(),
    ...over,
  }
}

beforeAll(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'shipdeck-run-')))
  runsDir = join(root, 'runs')
  await mkdir(runsDir, { recursive: true })
  process.env.SHIPDECK_NO_NOTIFY = '1'
  for (const name of ['dirty', 'clean']) {
    const repo = join(root, name)
    await mkdir(repo)
    await exec('git', ['init', '-b', 'main', repo])
    await writeFile(join(repo, 'a.txt'), 'x\n')
    await g(repo, 'add', 'a.txt')
    await g(repo, 'commit', '-m', 'init')
  }
  dirtyWt = join(root, 'dirty')
  cleanWt = join(root, 'clean')
  await writeFile(join(dirtyWt, 'a.txt'), 'changed\n')
})

describe('executeSchedule', () => {
  it('marks done and extracts the PR URL, passing args and cwd to claude', async () => {
    const shimPath = await makeShim(root, 'claude-ok', 'echo "cwd=$PWD args=$*"; echo "https://github.com/acme/alpha/pull/42"')
    const s = sch(dirtyWt)
    const rec = await executeSchedule(s, { runsDir, config: cfg(shimPath), now: () => new Date() })
    expect(rec.status).toBe('done')
    expect(rec.prUrl).toBe('https://github.com/acme/alpha/pull/42')
    expect(rec.exitCode).toBe(0)
    const log = readFileSync(join(runsDir, `${s.id}.log`), 'utf8')
    expect(log).toContain(`cwd=${dirtyWt}`)
    expect(log).toContain('args=-p /split-commit-pr v,d --dangerously-skip-permissions')
  })

  it('marks needs_attention when claude exits 0 with no PR URL', async () => {
    const shimPath = await makeShim(root, 'claude-blocked', 'echo "Secret scan found AKIA... stopping."')
    const rec = await executeSchedule(sch(dirtyWt), { runsDir, config: cfg(shimPath), now: () => new Date() })
    expect(rec.status).toBe('needs_attention')
  })

  it('marks failed on nonzero exit', async () => {
    const shimPath = await makeShim(root, 'claude-fail', 'echo boom >&2; exit 3')
    const rec = await executeSchedule(sch(dirtyWt), { runsDir, config: cfg(shimPath), now: () => new Date() })
    expect(rec.status).toBe('failed')
    expect(rec.exitCode).toBe(3)
  })

  it('skips clean worktrees without invoking claude', async () => {
    const shimPath = await makeShim(root, 'claude-never', 'echo "should not run"; exit 1')
    const rec = await executeSchedule(sch(cleanWt), { runsDir, config: cfg(shimPath), now: () => new Date() })
    expect(rec.status).toBe('skipped_clean')
    expect(rec.exitCode).toBeNull()
  })

  it('records lateBySeconds from fireAt', async () => {
    const shimPath = await makeShim(root, 'claude-late', 'echo "https://github.com/x/y/pull/1"')
    const s = sch(dirtyWt, { fireAt: new Date(Date.now() - 10 * 60000).toISOString() })
    const rec = await executeSchedule(s, { runsDir, config: cfg(shimPath), now: () => new Date() })
    expect(rec.lateBySeconds).toBeGreaterThanOrEqual(599)
  })

  it('writes the spawn error into the run log when claudePath points at a nonexistent binary', async () => {
    const s = sch(dirtyWt)
    const rec = await executeSchedule(s, { runsDir, config: cfg(join(root, 'no-such-claude-binary')), now: () => new Date() })
    expect(rec.status).toBe('failed')
    expect(rec.exitCode).toBeNull()
    const log = readFileSync(join(runsDir, `${s.id}.log`), 'utf8')
    expect(log).toContain('spawn error:')
  })
})

describe('escapeAppleScript', () => {
  it('escapes backslashes', () => {
    expect(escapeAppleScript('a\\b')).toBe('a\\\\b')
  })

  it('escapes double quotes', () => {
    expect(escapeAppleScript('say "hi"')).toBe('say \\"hi\\"')
  })

  it('escapes a backslash followed by a quote without letting the quote break out', () => {
    expect(escapeAppleScript('x\\"')).toBe('x\\\\\\"')
  })

  it('replaces newlines with spaces', () => {
    expect(escapeAppleScript('line1\nline2')).toBe('line1 line2')
  })
})

describe('stdin handling', () => {
  it('does not hang when the CLI reads stdin to EOF', async () => {
    const shimPath = await makeShim(root, 'claude-stdin', 'cat > /dev/null; echo "https://github.com/acme/alpha/pull/5"')
    const rec = await executeSchedule(sch(dirtyWt), { runsDir, config: cfg(shimPath), now: () => new Date() })
    expect(rec.status).toBe('done')
  }, 10000)
})
