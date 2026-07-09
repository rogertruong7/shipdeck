import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { writeTextAtomic } from '../shared/state-files'

const EDITABLE_SKILLS = ['split-commit-pr', 'daily-summary'] as const
const DEFAULT_BASE = join(homedir(), '.claude', 'skills')

export function skillPath(name: string, base = DEFAULT_BASE): string {
  if (!(EDITABLE_SKILLS as readonly string[]).includes(name)) throw new Error(`not an editable skill: ${name}`)
  return join(base, name, 'SKILL.md')
}

export function skillExists(name: string, base?: string): boolean {
  return existsSync(skillPath(name, base))
}

export async function readSkill(name: string, base?: string): Promise<string> {
  try {
    return await readFile(skillPath(name, base), 'utf8')
  } catch {
    return ''
  }
}

export function writeSkill(name: string, content: string, base?: string): void {
  writeTextAtomic(skillPath(name, base), content)
}
