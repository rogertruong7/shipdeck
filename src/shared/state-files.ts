import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes } from 'node:crypto'

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

export function writeTextAtomic(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`
  writeFileSync(tmp, text)
  renameSync(tmp, file)
}

export function writeJsonAtomic(file: string, value: unknown): void {
  writeTextAtomic(file, JSON.stringify(value, null, 2))
}

const MAX_LOG_BYTES = 5 * 1024 * 1024

export function appendLog(file: string, line: string): void {
  mkdirSync(dirname(file), { recursive: true })
  try {
    if (existsSync(file) && statSync(file).size > MAX_LOG_BYTES) renameSync(file, `${file}.1`)
  } catch {
    // rotation is best-effort
  }
  appendFileSync(file, `${new Date().toISOString()} ${line}\n`)
}
