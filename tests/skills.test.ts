import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readSkill, skillPath, writeSkill } from '../src/main/skills'

const base = () => mkdtempSync(join(tmpdir(), 'shipdeck-skills-'))

describe('skillPath', () => {
  it('resolves the two editable skills and rejects everything else', () => {
    expect(skillPath('split-commit-pr', '/b')).toBe('/b/split-commit-pr/SKILL.md')
    expect(skillPath('daily-summary', '/b')).toBe('/b/daily-summary/SKILL.md')
    expect(() => skillPath('other-skill', '/b')).toThrow()
    expect(() => skillPath('../../../etc/passwd', '/b')).toThrow()
  })
})

describe('readSkill / writeSkill', () => {
  it('returns empty string for a missing skill file', async () => {
    expect(await readSkill('daily-summary', base())).toBe('')
  })

  it('round-trips content', async () => {
    const b = base()
    await mkdir(join(b, 'split-commit-pr'), { recursive: true })
    await writeFile(join(b, 'split-commit-pr', 'SKILL.md'), 'original')
    expect(await readSkill('split-commit-pr', b)).toBe('original')
    writeSkill('split-commit-pr', 'edited', b)
    expect(await readSkill('split-commit-pr', b)).toBe('edited')
  })
})
