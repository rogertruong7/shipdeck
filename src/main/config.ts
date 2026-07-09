import { execFile } from 'node:child_process'
import { homedir, userInfo } from 'node:os'
import { CONFIG_FILE } from '../shared/paths'
import { readJson, writeJsonAtomic } from '../shared/state-files'
import { DEFAULT_CONFIG, type ShipdeckConfig } from '../shared/types'

export function loadConfig(): ShipdeckConfig {
  return { ...DEFAULT_CONFIG, ...readJson<Partial<ShipdeckConfig>>(CONFIG_FILE, {}) }
}

export function saveConfig(c: ShipdeckConfig): void {
  writeJsonAtomic(CONFIG_FILE, c)
}

// A stale npm copy of claude-code in some project's node_modules must never win
// over the real CLI — headless runs against it hang with no output.
export function pickClaudeBinary(candidates: string[]): string {
  const clean = candidates.map(c => c.trim()).filter(c => c.startsWith('/') && !c.includes('/node_modules/'))
  return clean[0] ?? ''
}

// Clean env: the app may have been launched from an npm script, whose PATH
// (node_modules/.bin first) would otherwise leak through the login shell.
function cleanShellEnv(): NodeJS.ProcessEnv {
  return { HOME: homedir(), USER: userInfo().username, SHELL: '/bin/zsh', TERM: 'dumb', LANG: 'en_US.UTF-8' }
}

function zshCaptureLines(cmd: string): Promise<string[]> {
  return new Promise(resolve => {
    execFile('/bin/zsh', ['-lic', cmd], { timeout: 15000, env: cleanShellEnv() }, (_err, stdout) => {
      resolve((stdout ?? '').trim().split('\n'))
    })
  })
}

const PATH_MARK = 'SHIPDECK_PATH='

export async function ensureResolvedToolPaths(): Promise<ShipdeckConfig> {
  const c = loadConfig()
  if (c.shellPath && c.claudePath !== 'auto') return c
  const pathLines = await zshCaptureLines(`print -r -- "${PATH_MARK}$PATH"`)
  const marked = pathLines.find(l => l.startsWith(PATH_MARK))
  const shellPath = c.shellPath || (marked ? marked.slice(PATH_MARK.length) : '')
  const claudePath = c.claudePath !== 'auto' ? c.claudePath : pickClaudeBinary(await zshCaptureLines('which -a claude')) || 'auto'
  const next = { ...c, shellPath, claudePath }
  saveConfig(next)
  return next
}
