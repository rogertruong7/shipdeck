import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const stateDir = mkdtempSync(join(tmpdir(), 'shipdeck-inst-'))
process.env.SHIPDECK_STATE_DIR = stateDir

const { plistContent, dirMirrored, copyDirRecursive } = await import('../src/main/agent-installer')

describe('plistContent', () => {
  it('embeds the electron binary, agent path, label, interval, and RUN_AS_NODE', () => {
    const plist = plistContent('/Applications/Shipdeck.app/Contents/MacOS/Shipdeck', '/Users/roger/.shipdeck/agent/agent.js', '/Users/roger/.shipdeck/agent.stdout.log')
    expect(plist).toContain('<string>com.roger.shipdeck.agent</string>')
    expect(plist).toContain('<string>/Applications/Shipdeck.app/Contents/MacOS/Shipdeck</string>')
    expect(plist).toContain('<string>/Users/roger/.shipdeck/agent/agent.js</string>')
    expect(plist).toContain('<key>ELECTRON_RUN_AS_NODE</key><string>1</string>')
    expect(plist).toContain('<key>StartInterval</key><integer>60</integer>')
    expect(plist).toContain('<key>RunAtLoad</key><true/>')
    expect(plist).toContain('<key>StandardErrorPath</key><string>/Users/roger/.shipdeck/agent.stdout.log</string>')
  })
})

function freshDirs(): { src: string; dest: string } {
  const root = mkdtempSync(join(tmpdir(), 'shipdeck-mirror-'))
  const src = join(root, 'src')
  const dest = join(root, 'dest')
  mkdirSync(src, { recursive: true })
  mkdirSync(dest, { recursive: true })
  return { src, dest }
}

describe('copyDirRecursive', () => {
  it('mirrors nested files and subdirectories byte-for-byte without relying on fs.cpSync', () => {
    const { src, dest } = freshDirs()
    mkdirSync(join(src, 'chunks'), { recursive: true })
    writeFileSync(join(src, 'agent.js'), 'agent-content')
    writeFileSync(join(src, 'chunks', 'types-abc.js'), 'chunk-content')

    copyDirRecursive(src, dest)

    expect(dirMirrored(src, dest)).toBe(true)
  })

  it('creates the destination directory when it does not yet exist', () => {
    const root = mkdtempSync(join(tmpdir(), 'shipdeck-mirror-'))
    const src = join(root, 'src')
    const dest = join(root, 'nested', 'dest')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, 'agent.js'), 'agent-content')

    copyDirRecursive(src, dest)

    expect(dirMirrored(src, dest)).toBe(true)
  })
})

describe('dirMirrored', () => {
  it('returns true when dest recursively contains identical bytes for every file in src', () => {
    const { src, dest } = freshDirs()
    mkdirSync(join(src, 'chunks'), { recursive: true })
    writeFileSync(join(src, 'agent.js'), 'agent-content')
    writeFileSync(join(src, 'chunks', 'types-abc.js'), 'chunk-content')
    mkdirSync(join(dest, 'chunks'), { recursive: true })
    writeFileSync(join(dest, 'agent.js'), 'agent-content')
    writeFileSync(join(dest, 'chunks', 'types-abc.js'), 'chunk-content')

    expect(dirMirrored(src, dest)).toBe(true)
  })

  it('returns false when a file present in src is missing from dest', () => {
    const { src, dest } = freshDirs()
    mkdirSync(join(src, 'chunks'), { recursive: true })
    writeFileSync(join(src, 'agent.js'), 'agent-content')
    writeFileSync(join(src, 'chunks', 'types-abc.js'), 'chunk-content')
    writeFileSync(join(dest, 'agent.js'), 'agent-content')
    // chunks/types-abc.js intentionally absent from dest

    expect(dirMirrored(src, dest)).toBe(false)
  })

  it('returns false when a file exists in both but bytes differ', () => {
    const { src, dest } = freshDirs()
    writeFileSync(join(src, 'agent.js'), 'agent-content-v2')
    writeFileSync(join(dest, 'agent.js'), 'agent-content-v1')

    expect(dirMirrored(src, dest)).toBe(false)
  })

  it('returns true when dest has extra files not present in src', () => {
    const { src, dest } = freshDirs()
    writeFileSync(join(src, 'agent.js'), 'agent-content')
    writeFileSync(join(dest, 'agent.js'), 'agent-content')
    writeFileSync(join(dest, 'index.js'), 'unrelated-extra-file')

    expect(dirMirrored(src, dest)).toBe(true)
  })
})
