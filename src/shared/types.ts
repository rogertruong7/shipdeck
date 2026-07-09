export interface ShipdeckConfig {
  scanRoots: string[]
  excludeDirs: string[]
  claudePath: string
  summaryDir: string
  reviewers: string[]
  wakeArmingEnabled: boolean
  shellPath: string
  onboardingDone: boolean
  hiddenRepos: string[]
  hiddenWorktrees: string[]
}

export const DEFAULT_CONFIG: ShipdeckConfig = {
  scanRoots: ['~/coding', '~/conductor/workspaces'],
  excludeDirs: ['node_modules', '.Trash', 'archived-contexts', 'Library'],
  claudePath: 'auto',
  summaryDir: '~/coding',
  reviewers: [],
  wakeArmingEnabled: false,
  shellPath: '',
  onboardingDone: false,
  hiddenRepos: [],
  hiddenWorktrees: [],
}

export type ScheduleStatus = 'armed' | 'running'

export interface Schedule {
  id: string
  worktreePath: string
  repo: string
  branch: string
  fireAt: string
  args: string
  status: ScheduleStatus
  createdAt: string
  startedAt?: string
}

export type RunStatus = 'done' | 'failed' | 'needs_attention' | 'skipped_clean'

export interface RunRecord {
  scheduleId: string
  worktreePath: string
  repo: string
  branch: string
  args: string
  scheduledFor: string
  startedAt: string
  finishedAt: string
  exitCode: number | null
  status: RunStatus
  lateBySeconds: number
  prUrl?: string
}

export interface FileDiffStat {
  path: string
  insertions: number
  deletions: number
  binary: boolean
  untracked: boolean
}

export interface CommitInfo {
  hash: string
  subject: string
}

export interface WorktreeRef {
  repoRoot: string
  repo: string
  path: string
  branch: string | null
  isPrimary: boolean
}

export interface WorktreeInfo extends WorktreeRef {
  ahead: number
  behind: number
  files: FileDiffStat[]
  commitsAhead: CommitInfo[]
  lastActivity: string
  defaultBranch: string
  error?: string
}

export interface BranchGroup {
  key: string
  worktrees: WorktreeInfo[]
  dirty: boolean
  lastActivity: string
}

export type AgentHealth = 'ok' | 'stale' | 'not_installed'
