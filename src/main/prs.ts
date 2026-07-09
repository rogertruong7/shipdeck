import { execFile } from 'node:child_process'

// Open-PR lookup per repo via `gh pr list`, cached so the 30s scan loop hits
// the network at most once per repo per TTL. Failures (gh missing, offline,
// no remote) cache an empty map — a broken repo must not slow every scan.
const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number; byBranch: Map<string, string> }>()

export function clearPrCache(): void {
  cache.clear()
}

export function openPrsByBranch(repoRoot: string, shellPath?: string): Promise<Map<string, string>> {
  const hit = cache.get(repoRoot)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return Promise.resolve(hit.byBranch)
  return new Promise(resolve => {
    execFile(
      'gh',
      ['pr', 'list', '--json', 'headRefName,url', '--limit', '200'],
      { cwd: repoRoot, timeout: 15000, env: { ...process.env, PATH: shellPath || (process.env.PATH ?? '') } },
      (err, stdout) => {
        const byBranch = new Map<string, string>()
        if (!err) {
          try {
            for (const pr of JSON.parse(stdout) as { headRefName?: string; url?: string }[]) {
              if (pr.headRefName && pr.url) byBranch.set(pr.headRefName, pr.url)
            }
          } catch {
            // unexpected gh output — treat as no PRs
          }
        }
        cache.set(repoRoot, { at: Date.now(), byBranch })
        resolve(byBranch)
      },
    )
  })
}

export async function annotatePrUrls<T extends { repoRoot: string; branch: string | null; prUrl?: string }>(
  worktrees: T[],
  shellPath?: string,
): Promise<T[]> {
  const roots = [...new Set(worktrees.map(w => w.repoRoot))]
  const maps = new Map(await Promise.all(roots.map(async r => [r, await openPrsByBranch(r, shellPath)] as const)))
  for (const w of worktrees) {
    if (w.branch) {
      const url = maps.get(w.repoRoot)?.get(w.branch)
      if (url) w.prUrl = url
    }
  }
  return worktrees
}
