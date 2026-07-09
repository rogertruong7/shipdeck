import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendLog, readJson, writeJsonAtomic, writeTextAtomic } from '../src/shared/state-files'

const dir = () => mkdtempSync(join(tmpdir(), 'shipdeck-test-'))

describe('state-files', () => {
  it('readJson returns fallback for missing or corrupt files', () => {
    const d = dir()
    expect(readJson(join(d, 'nope.json'), { a: 1 })).toEqual({ a: 1 })
    writeFileSync(join(d, 'bad.json'), '{oops')
    expect(readJson(join(d, 'bad.json'), [])).toEqual([])
  })

  it('writeJsonAtomic round-trips and creates parent dirs', () => {
    const d = dir()
    const file = join(d, 'nested', 'x.json')
    writeJsonAtomic(file, { hello: ['world'] })
    expect(readJson(file, null)).toEqual({ hello: ['world'] })
    expect(readFileSync(file, 'utf8')).toContain('\n')
  })

  it('appendLog appends timestamped lines and rotates past 5MB', () => {
    const d = dir()
    const log = join(d, 'agent.log')
    appendLog(log, 'tick')
    appendLog(log, 'run start')
    const content = readFileSync(log, 'utf8')
    expect(content.split('\n').filter(Boolean)).toHaveLength(2)
    expect(content).toMatch(/^\d{4}-\d{2}-\d{2}T.* tick\n/)
    writeFileSync(log, 'x'.repeat(5 * 1024 * 1024 + 1))
    appendLog(log, 'after rotate')
    expect(statSync(log).size).toBeLessThan(1024)
    expect(readFileSync(`${log}.1`, 'utf8').length).toBeGreaterThan(5 * 1024 * 1024)
  })

  it('writeTextAtomic round-trips plain text and creates parent dirs', () => {
    const d = dir()
    const file = join(d, 'nested', 'skill.md')
    writeTextAtomic(file, '# hello\nworld\n')
    expect(readFileSync(file, 'utf8')).toBe('# hello\nworld\n')
  })
})
