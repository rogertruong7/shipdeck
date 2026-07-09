import { clipboard, ipcMain } from 'electron'
import { readFile, readdir } from 'node:fs/promises'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { RUNS_DIR, SCHEDULES_FILE } from '../shared/paths'
import { readJson, writeJsonAtomic } from '../shared/state-files'
import { groupWorktrees } from '../shared/grouping'
import { markdownToSlackHtml } from '../shared/slack-format'
import type { RunRecord, Schedule } from '../shared/types'
import { branchFiles, fileDiff, scanWorktrees } from './scanner'
import { armSchedule, cancelSchedule, runNow, type ArmInput, type RunNowInput } from './schedules'
import { agentHealth, installAgent } from './agent-installer'
import { loadConfig, saveConfig } from './config'
import { enableWakeArming } from './wake-setup'
import { runDailySummary } from './claude-runner'
import { readSkill, writeSkill } from './skills'

interface SummaryRunState {
  id: string
  startedAt: string
  text: string
  log: string
  done: unknown | null
}

let activeSummary: SummaryRunState | null = null

export function registerIpc(): void {
  ipcMain.handle('scan', async () => {
    const c = loadConfig()
    return groupWorktrees(await scanWorktrees(c.scanRoots, c.excludeDirs))
  })
  ipcMain.handle('diff', (_e, wt: string, file: string, untracked: boolean, vsBranch: boolean) => fileDiff(wt, file, untracked, vsBranch))
  ipcMain.handle('branch-files', (_e, wt: string) => branchFiles(wt))
  ipcMain.handle('schedules:list', () => readJson<Schedule[]>(SCHEDULES_FILE, []))
  ipcMain.handle('schedules:arm', (_e, input: ArmInput) => armSchedule(input, loadConfig()))
  ipcMain.handle('schedules:cancel', (_e, id: string) => cancelSchedule(id, loadConfig()))
  ipcMain.handle('schedules:runNow', (_e, input: RunNowInput) => runNow(input))
  ipcMain.handle('runs:list', async (): Promise<RunRecord[]> => {
    let names: string[] = []
    try {
      names = (await readdir(RUNS_DIR)).filter(n => n.endsWith('.json'))
    } catch {
      return []
    }
    const runs = await Promise.all(
      names.map(async n => {
        try {
          return JSON.parse(await readFile(join(RUNS_DIR, n), 'utf8')) as RunRecord
        } catch {
          return null
        }
      }),
    )
    return runs.filter((r): r is RunRecord => r !== null).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  })
  ipcMain.handle('runs:log', async (_e, id: string) => {
    try {
      return await readFile(join(RUNS_DIR, `${id}.log`), 'utf8')
    } catch {
      return ''
    }
  })
  ipcMain.handle('agent:health', () => agentHealth())
  ipcMain.handle('agent:repair', async () => {
    await installAgent()
    return agentHealth()
  })
  ipcMain.handle('wake:enable', async () => {
    const ok = await enableWakeArming()
    if (ok) saveConfig({ ...loadConfig(), wakeArmingEnabled: true })
    return ok
  })
  ipcMain.handle('config:get', () => loadConfig())
  ipcMain.handle('summary:run', e => {
    const send = (channel: string, payload: unknown) => {
      if (!e.sender.isDestroyed()) e.sender.send(channel, payload)
    }
    // Singleton: while a run is in flight, reattach (replay accumulated log +
    // text) instead of spawning another. Once the last one is done, a new call
    // starts a fresh run.
    if (activeSummary && activeSummary.done === null) {
      if (activeSummary.log) send('summary:log', activeSummary.log)
      if (activeSummary.text) send('summary:chunk', activeSummary.text)
      return
    }
    const id = `summary_${Date.now()}`
    const startedAt = new Date().toISOString()
    const logPath = join(RUNS_DIR, `${id}.log`)
    const run: SummaryRunState = { id, startedAt, text: '', log: '', done: null }
    activeSummary = run
    mkdirSync(RUNS_DIR, { recursive: true })
    runDailySummary(loadConfig(), (channel, payload) => {
      if (channel === 'summary:chunk') run.text += String(payload)
      else if (channel === 'summary:log') {
        const line = `${String(payload)}\n`
        run.log += line
        try {
          appendFileSync(logPath, line)
        } catch {
          // log file is best-effort
        }
      } else {
        run.done = payload
        const ok = (payload as { ok?: boolean }).ok === true
        try {
          appendFileSync(logPath, `\n===== SUMMARY =====\n${run.text}\n`)
        } catch {
          // best-effort
        }
        const record: RunRecord = {
          scheduleId: id,
          worktreePath: '',
          repo: 'daily-summary',
          branch: '',
          args: '',
          scheduledFor: startedAt,
          startedAt,
          finishedAt: new Date().toISOString(),
          exitCode: ok ? 0 : 1,
          status: ok ? 'done' : 'failed',
          lateBySeconds: 0,
        }
        writeJsonAtomic(join(RUNS_DIR, `${id}.json`), record)
      }
      send(channel, payload)
    })
  })
  ipcMain.handle('clipboard:slack', (_e, md: string) => clipboard.write({ text: md, html: markdownToSlackHtml(md) }))
  ipcMain.handle('clipboard:plain', (_e, text: string) => clipboard.writeText(text))
  ipcMain.handle('skill:read', (_e, name: string) => readSkill(name))
  ipcMain.handle('skill:write', (_e, name: string, content: string) => writeSkill(name, content))
}
