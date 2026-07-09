import { contextBridge, ipcRenderer } from 'electron'

const api = {
  scan: () => ipcRenderer.invoke('scan'),
  getFileDiff: (worktreePath: string, file: string, untracked: boolean, vsBranch = false) => ipcRenderer.invoke('diff', worktreePath, file, untracked, vsBranch),
  branchFiles: (worktreePath: string) => ipcRenderer.invoke('branch-files', worktreePath),
  listSchedules: () => ipcRenderer.invoke('schedules:list'),
  armSchedule: (input: unknown) => ipcRenderer.invoke('schedules:arm', input),
  cancelSchedule: (id: string) => ipcRenderer.invoke('schedules:cancel', id),
  runNow: (input: unknown) => ipcRenderer.invoke('schedules:runNow', input),
  listRuns: () => ipcRenderer.invoke('runs:list'),
  readRunLog: (id: string) => ipcRenderer.invoke('runs:log', id),
  agentHealth: () => ipcRenderer.invoke('agent:health'),
  repairAgent: () => ipcRenderer.invoke('agent:repair'),
  enableWakeArming: () => ipcRenderer.invoke('wake:enable'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  runDailySummary: () => ipcRenderer.invoke('summary:run'),
  onSummaryChunk: (cb: (chunk: string) => void) => {
    const h = (_: unknown, c: string) => cb(c)
    ipcRenderer.on('summary:chunk', h)
    return () => ipcRenderer.off('summary:chunk', h)
  },
  onSummaryLog: (cb: (line: string) => void) => {
    const h = (_: unknown, l: string) => cb(l)
    ipcRenderer.on('summary:log', h)
    return () => ipcRenderer.off('summary:log', h)
  },
  onSummaryDone: (cb: (r: { ok: boolean; text: string; error?: string }) => void) => {
    const h = (_: unknown, r: { ok: boolean; text: string; error?: string }) => cb(r)
    ipcRenderer.on('summary:done', h)
    return () => ipcRenderer.off('summary:done', h)
  },
  copyForSlack: (md: string) => ipcRenderer.invoke('clipboard:slack', md),
  copyPlain: (text: string) => ipcRenderer.invoke('clipboard:plain', text),
  readSkill: (name: string) => ipcRenderer.invoke('skill:read', name),
  writeSkill: (name: string, content: string) => ipcRenderer.invoke('skill:write', name, content),
}

contextBridge.exposeInMainWorld('shipdeck', api)
