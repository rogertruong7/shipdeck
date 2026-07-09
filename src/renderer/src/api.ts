import type { AgentHealth, BranchGroup, FileDiffStat, RunRecord, Schedule, ShipdeckConfig } from '../../shared/types'

export interface SummaryResult {
  ok: boolean
  text: string
  error?: string
}

export interface ArmInput {
  worktreePath: string
  repo: string
  branch: string
  fireAt: string
  args: string
}

export interface RunNowInput {
  worktreePath: string
  repo: string
  branch: string
  args: string
}

export interface ShipdeckApi {
  scan(): Promise<BranchGroup[]>
  getFileDiff(worktreePath: string, file: string, untracked: boolean, vsBranch?: boolean): Promise<string>
  branchFiles(worktreePath: string): Promise<FileDiffStat[]>
  listSchedules(): Promise<Schedule[]>
  armSchedule(input: ArmInput): Promise<Schedule[]>
  cancelSchedule(id: string): Promise<Schedule[]>
  runNow(input: RunNowInput): Promise<Schedule[]>
  forceStopSchedule(id: string): Promise<Schedule[]>
  resumeRun(input: RunNowInput & { sessionId: string }): Promise<Schedule[]>
  openRunTerminal(worktreePath: string, sessionId: string): Promise<void>
  listRuns(): Promise<RunRecord[]>
  readRunLog(id: string): Promise<string>
  agentHealth(): Promise<AgentHealth>
  repairAgent(): Promise<AgentHealth>
  enableWakeArming(): Promise<boolean>
  getConfig(): Promise<ShipdeckConfig>
  setConfig(patch: Partial<ShipdeckConfig>): Promise<ShipdeckConfig>
  pickFolder(): Promise<string | null>
  runDailySummary(): Promise<void>
  onSummaryChunk(cb: (chunk: string) => void): () => void
  onSummaryLog(cb: (line: string) => void): () => void
  onSummaryDone(cb: (r: SummaryResult) => void): () => void
  copyForSlack(md: string): Promise<void>
  copyPlain(text: string): Promise<void>
  skillExists(name: string): Promise<boolean>
  readSkill(name: string): Promise<string>
  writeSkill(name: string, content: string): Promise<void>
}

export const api = (window as unknown as { shipdeck: ShipdeckApi }).shipdeck
