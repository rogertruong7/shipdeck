import { beforeAll, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync } from 'node:fs'
import { mkdir, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { branchFiles, collectWorktree, fileDiff, findGitDirs, listWorktrees, repoRootOf, scanWorktrees } from '../src/main/scanner'

const exec = promisify(execFile)
const g = (cwd: string, ...args: string[]) => exec('git', ['-C', cwd, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args])

let root: string
let repo: string
let wt: string

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'shipdeck-scan-'))
  repo = join(root, 'projects', 'alpha')
  await mkdir(repo, { recursive: true })
  await exec('git', ['init', '-b', 'main', repo])
  await writeFile(join(repo, 'a.txt'), 'one\ntwo\n')
  await g(repo, 'add', 'a.txt')
  await g(repo, 'commit', '-m', 'init')
  // linked worktree on a prefixed branch, with a modified + an untracked file
  wt = join(root, 'workspaces', 'alpha-feature')
  await mkdir(join(root, 'workspaces'), { recursive: true })
  await g(repo, 'worktree', 'add', '-b', 'sam/eng-1-feature', wt)
  await g(wt, 'commit', '--allow-empty', '-m', 'feature work')
  await writeFile(join(wt, 'b.txt'), 'bee\n')
  await g(wt, 'add', 'b.txt')
  await g(wt, 'commit', '-m', 'add b')
  await writeFile(join(wt, 'a.txt'), 'one\nTWO\nthree\n')
  await writeFile(join(wt, 'new.md'), 'x\ny\nz\n')
  // a symlink alias of the worktree (Conductor symlink workspaces)
  await symlink(wt, join(root, 'workspaces', 'alpha-alias'))
  // noise that must be skipped
  await mkdir(join(root, 'node_modules', 'dep'), { recursive: true })
})

describe('discovery', () => {
  it('finds git dirs under the root, skipping excludes', async () => {
    const dirs = await findGitDirs(root, new Set(['node_modules']))
    expect(dirs).toContain(repo)
    expect(dirs).toContain(wt)
  })

  it('resolves a linked worktree to its primary repo root', async () => {
    expect(await repoRootOf(wt)).toBe(await repoRootOf(repo))
  })

  it('lists both worktrees with branches', async () => {
    const refs = await listWorktrees(repo)
    expect(refs.map(r => r.branch).sort()).toEqual(['main', 'sam/eng-1-feature'])
    expect(refs.find(r => r.branch === 'main')?.isPrimary).toBe(true)
  })
})

describe('collectWorktree + scanWorktrees', () => {
  it('collects diff stats including untracked line counts and commits ahead', async () => {
    const refs = await listWorktrees(repo)
    const ref = refs.find(r => r.branch === 'sam/eng-1-feature')!
    const info = await collectWorktree(ref)
    const mod = info.files.find(f => f.path === 'a.txt')!
    expect(mod.insertions).toBe(2)
    expect(mod.deletions).toBe(1)
    const untracked = info.files.find(f => f.path === 'new.md')!
    expect(untracked.untracked).toBe(true)
    expect(untracked.insertions).toBe(3)
    expect(info.commitsAhead.map(c => c.subject)).toEqual(['add b', 'feature work'])
  })

  it('scans a root end-to-end and dedupes the symlink alias', async () => {
    const infos = await scanWorktrees([root], ['node_modules'])
    expect(infos).toHaveLength(2)
    expect(infos.map(i => i.repo)).toEqual(['alpha', 'alpha'])
  })
})

describe('fileDiff', () => {
  it('returns a unified diff for tracked files and a synthetic all-additions diff for untracked', async () => {
    const tracked = await fileDiff(wt, 'a.txt', false)
    expect(tracked).toContain('+TWO')
    expect(tracked).toContain('-two')
    const untracked = await fileDiff(wt, 'new.md', true)
    expect(untracked).toContain('+++ b/new.md')
    expect(untracked.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))).toHaveLength(3)
  })
})

describe('branchFiles + defaultBranch', () => {
  it('reports tracked changes vs the default-branch merge-base, committed and uncommitted together', async () => {
    const files = await branchFiles(wt)
    expect(files.map(f => f.path)).toEqual(['a.txt', 'b.txt'])
    const a = files.find(f => f.path === 'a.txt')!
    expect(a.insertions).toBe(2)
    expect(a.deletions).toBe(1)
    const b = files.find(f => f.path === 'b.txt')!
    expect(b.insertions).toBe(1)
    expect(b.deletions).toBe(0)
    expect(files.every(f => !f.untracked)).toBe(true)
  })

  it('collectWorktree exposes the repo default branch', async () => {
    const refs = await listWorktrees(repo)
    const info = await collectWorktree(refs.find(r => r.branch === 'sam/eng-1-feature')!)
    expect(info.defaultBranch).toBe('main')
  })
})

describe('fileDiff vsBranch', () => {
  it('diffs a committed file against the merge-base', async () => {
    const diff = await fileDiff(wt, 'b.txt', false, true)
    expect(diff).toContain('+bee')
  })
})
