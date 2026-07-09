import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { expandTilde } from '../shared/paths'
import { parsePorcelainV2 } from '../shared/porcelain'
import type { CommitInfo, FileDiffStat, WorktreeInfo, WorktreeRef } from '../shared/types'

const exec = promisify(execFile)

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 })
  return stdout
}

export async function findGitDirs(root: string, excludes: Set<string>, depth = 3): Promise<string[]> {
  let entries: string[]
  try {
    entries = await readdir(root)
  } catch {
    return []
  }
  if (entries.includes('.git')) return [root]
  if (depth === 0) return []
  const found: string[] = []
  for (const name of entries) {
    if (name.startsWith('.') || excludes.has(name)) continue
    const p = join(root, name)
    try {
      if ((await stat(p)).isDirectory()) found.push(...(await findGitDirs(p, excludes, depth - 1)))
    } catch {
      // unreadable entry
    }
  }
  return found
}

export async function repoRootOf(gitWorkdir: string): Promise<string | null> {
  try {
    const common = (await git(gitWorkdir, ['rev-parse', '--git-common-dir'])).trim()
    const abs = isAbsolute(common) ? common : join(gitWorkdir, common)
    return await realpath(dirname(abs))
  } catch {
    return null
  }
}

export async function listWorktrees(repoRoot: string): Promise<WorktreeRef[]> {
  const out = await git(repoRoot, ['worktree', 'list', '--porcelain'])
  const canonical = await realpath(repoRoot)
  const refs: WorktreeRef[] = []
  let path: string | null = null
  let branch: string | null = null
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      path = line.slice('worktree '.length)
      branch = null
    } else if (line.startsWith('branch refs/heads/')) {
      branch = line.slice('branch refs/heads/'.length)
    } else if (line === '') {
      if (path) refs.push({ repoRoot, repo: basename(repoRoot), path, branch, isPrimary: path === canonical })
      path = null
    }
  }
  return refs
}

const defaultBranchCache = new Map<string, string>()

export async function detectDefaultBranch(repoRoot: string): Promise<string> {
  const cached = defaultBranchCache.get(repoRoot)
  if (cached) return cached
  let branch = 'main'
  try {
    const ref = (await git(repoRoot, ['symbolic-ref', 'refs/remotes/origin/HEAD'])).trim()
    branch = ref.replace('refs/remotes/', '')
  } catch {
    try {
      await git(repoRoot, ['rev-parse', '--verify', 'main'])
      branch = 'main'
    } catch {
      branch = 'master'
    }
  }
  defaultBranchCache.set(repoRoot, branch)
  return branch
}

function parseNumstat(out: string): FileDiffStat[] {
  const files: FileDiffStat[] = []
  for (const line of out.split('\n')) {
    if (!line.trim()) continue
    const [ins, del, ...rest] = line.split('\t')
    files.push({ path: rest.join('\t'), insertions: ins === '-' ? 0 : Number(ins), deletions: del === '-' ? 0 : Number(del), binary: ins === '-', untracked: false })
  }
  return files
}

async function lastActivityOf(wtPath: string, files: FileDiffStat[]): Promise<string> {
  let max = 0
  try {
    const t = Date.parse((await git(wtPath, ['log', '-1', '--format=%cI'])).trim())
    if (!Number.isNaN(t)) max = t
  } catch {
    // no commits yet
  }
  for (const f of files.slice(0, 50)) {
    try {
      max = Math.max(max, (await stat(join(wtPath, f.path))).mtimeMs)
    } catch {
      // file was deleted
    }
  }
  return new Date(max).toISOString()
}

export async function collectWorktree(ref: WorktreeRef): Promise<WorktreeInfo> {
  try {
    const st = parsePorcelainV2(await git(ref.path, ['status', '--porcelain=v2', '--branch']))
    const files = parseNumstat(await git(ref.path, ['diff', 'HEAD', '--numstat']))
    for (const p of st.untracked) {
      let lines = 0
      let binary = false
      try {
        const buf = await readFile(join(ref.path, p))
        if (buf.includes(0)) binary = true
        else lines = buf.length === 0 ? 0 : buf.toString('utf8').replace(/\n$/, '').split('\n').length
      } catch {
        binary = true
      }
      files.push({ path: p, insertions: lines, deletions: 0, binary, untracked: true })
    }
    const defaultBranch = await detectDefaultBranch(ref.repoRoot)
    let commitsAhead: CommitInfo[] = []
    try {
      const log = await git(ref.path, ['log', '--format=%h%x09%s', `${defaultBranch}..HEAD`, '--max-count=50'])
      commitsAhead = log.split('\n').filter(Boolean).map(l => {
        const [hash, ...s] = l.split('\t')
        return { hash, subject: s.join('\t') }
      })
    } catch {
      // default branch may not exist locally
    }
    const lastActivity = await lastActivityOf(ref.path, files)
    return { ...ref, ahead: st.ahead, behind: st.behind, files, commitsAhead, lastActivity, defaultBranch }
  } catch (e) {
    return { ...ref, ahead: 0, behind: 0, files: [], commitsAhead: [], lastActivity: new Date(0).toISOString(), error: String(e), defaultBranch: 'main' }
  }
}

export async function scanWorktrees(scanRoots: string[], excludeDirs: string[]): Promise<WorktreeInfo[]> {
  const excludes = new Set(excludeDirs)
  const gitDirs = (await Promise.all(scanRoots.map(r => findGitDirs(expandTilde(r), excludes)))).flat()
  const repoRoots = new Set<string>()
  for (const d of gitDirs) {
    const root = await repoRootOf(d)
    if (root) repoRoots.add(root)
  }
  const seen = new Set<string>()
  const refs: WorktreeRef[] = []
  for (const root of repoRoots) {
    let worktrees: WorktreeRef[] = []
    try {
      worktrees = await listWorktrees(root)
    } catch {
      continue
    }
    for (const ref of worktrees) {
      let canonical: string
      try {
        canonical = await realpath(ref.path)
      } catch {
        continue // prunable worktree whose directory is gone
      }
      if (seen.has(canonical)) continue
      seen.add(canonical)
      refs.push({ ...ref, path: canonical, isPrimary: canonical === root })
    }
  }
  return Promise.all(refs.map(collectWorktree))
}

async function mergeBaseWithDefault(wtPath: string): Promise<string> {
  const def = await detectDefaultBranch(wtPath)
  return (await git(wtPath, ['merge-base', def, 'HEAD'])).trim()
}

export async function branchFiles(wtPath: string): Promise<FileDiffStat[]> {
  const base = await mergeBaseWithDefault(wtPath)
  return parseNumstat(await git(wtPath, ['diff', base, '--numstat']))
}

export async function fileDiff(wtPath: string, file: string, untracked: boolean, vsBranch = false): Promise<string> {
  if (untracked) {
    let content = ''
    try {
      content = await readFile(join(wtPath, file), 'utf8')
    } catch {
      return ''
    }
    const lines = content.split('\n')
    if (lines.at(-1) === '') lines.pop()
    return [`diff --git a/${file} b/${file}`, 'new file', '--- /dev/null', `+++ b/${file}`, `@@ -0,0 +1,${lines.length} @@`, ...lines.map(l => `+${l}`)].join('\n')
  }
  if (vsBranch) {
    const base = await mergeBaseWithDefault(wtPath)
    return git(wtPath, ['diff', base, '--', file])
  }
  return git(wtPath, ['diff', 'HEAD', '--', file])
}
