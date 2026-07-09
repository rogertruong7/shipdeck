import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { AGENT_DIR, AGENT_JS, AGENT_LOG, LAUNCH_AGENT_LABEL, LAUNCH_AGENT_PLIST, RUNS_DIR, STATE_DIR } from '../shared/paths'
import type { AgentHealth } from '../shared/types'

export function plistContent(execPath: string, agentJs: string, stdioLog: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${execPath}</string>
    <string>${agentJs}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>ELECTRON_RUN_AS_NODE</key><string>1</string>
  </dict>
  <key>StartInterval</key><integer>60</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${stdioLog}</string>
  <key>StandardErrorPath</key><string>${stdioLog}</string>
</dict>
</plist>
`
}

function launchctl(args: string[]): Promise<void> {
  return new Promise(resolve => execFile('launchctl', args, () => resolve()))
}

function bundledAgentJs(): string {
  return join(__dirname, 'agent.js')
}

function listFilesRecursive(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFilesRecursive(full))
    else out.push(full)
  }
  return out
}

/**
 * Recursively copies srcDir into destDir using readdirSync/readFileSync/writeFileSync
 * rather than fs.cpSync. cpSync's native binding can't read directories packed inside
 * an asar archive (throws ENOENT), whereas Electron patches readdirSync/readFileSync
 * to transparently see into the archive — so this is the asar-safe way to pull the
 * agent bundle out onto disk for launchd.
 */
export function copyDirRecursive(srcDir: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true })
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = join(srcDir, entry.name)
    const destPath = join(destDir, entry.name)
    if (entry.isDirectory()) copyDirRecursive(srcPath, destPath)
    else writeFileSync(destPath, readFileSync(srcPath))
  }
}

/**
 * Returns true only if every file under srcDir (recursive) exists under destDir
 * at the same relative path with identical bytes. Extra files in destDir are allowed.
 */
export function dirMirrored(srcDir: string, destDir: string): boolean {
  if (!existsSync(srcDir) || !existsSync(destDir)) return false
  for (const srcFile of listFilesRecursive(srcDir)) {
    const rel = srcFile.slice(srcDir.length)
    const destFile = join(destDir, rel)
    if (!existsSync(destFile)) return false
    if (!readFileSync(srcFile).equals(readFileSync(destFile))) return false
  }
  return true
}

export async function installAgent(): Promise<void> {
  mkdirSync(RUNS_DIR, { recursive: true })
  mkdirSync(dirname(LAUNCH_AGENT_PLIST), { recursive: true })
  rmSync(AGENT_DIR, { recursive: true, force: true })
  copyDirRecursive(dirname(bundledAgentJs()), AGENT_DIR)
  writeFileSync(LAUNCH_AGENT_PLIST, plistContent(process.execPath, AGENT_JS, join(STATE_DIR, 'agent.stdout.log')))
  const uid = process.getuid?.() ?? 501
  await launchctl(['bootout', `gui/${uid}/${LAUNCH_AGENT_LABEL}`])
  await launchctl(['bootstrap', `gui/${uid}`, LAUNCH_AGENT_PLIST])
}

export async function installAgentIfNeeded(): Promise<void> {
  const desired = plistContent(process.execPath, AGENT_JS, join(STATE_DIR, 'agent.stdout.log'))
  const current = existsSync(LAUNCH_AGENT_PLIST) ? readFileSync(LAUNCH_AGENT_PLIST, 'utf8') : ''
  const bundleMirrored = dirMirrored(dirname(bundledAgentJs()), AGENT_DIR)
  if (current === desired && bundleMirrored) return
  await installAgent()
}

export function agentHealth(now = new Date()): AgentHealth {
  if (!existsSync(LAUNCH_AGENT_PLIST) || !existsSync(AGENT_JS)) return 'not_installed'
  try {
    const m = statSync(AGENT_LOG).mtimeMs
    return now.getTime() - m < 3 * 60 * 1000 ? 'ok' : 'stale'
  } catch {
    return 'stale'
  }
}
