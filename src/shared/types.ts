export interface ShipdeckConfig {
  scanRoots: string[]
  excludeDirs: string[]
  claudePath: string
  // Claude model passed as --model on every run; 'default' omits the flag
  // so runs use whatever the user's Claude Code setup picks.
  model: string
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
  model: 'default',
  summaryDir: '~/coding',
  reviewers: [],
  wakeArmingEnabled: false,
  shellPath: '',
  onboardingDone: false,
  hiddenRepos: [],
  hiddenWorktrees: [],
}

export const MODEL_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'default', label: 'Default (Claude Code setting)' },
  { value: 'claude-opus-4-8', label: 'Opus 4.8' },
  { value: 'claude-opus-4-5', label: 'Opus 4.5' },
  { value: 'claude-sonnet-5', label: 'Sonnet 5' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5' },
]

export function modelArgs(model: string | undefined): string[] {
  return model && model !== 'default' ? ['--model', model] : []
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
  pid?: number
  sessionId?: string
  // set mid-run as soon as the PR URL shows up in claude's output
  prUrl?: string
  // set on schedules created by "Resume run": claude restarts from this session
  resumeSessionId?: string
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
  sessionId?: string
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
  prUrl?: string
  error?: string
}

export interface BranchGroup {
  key: string
  worktrees: WorktreeInfo[]
  dirty: boolean
  lastActivity: string
}

export type AgentHealth = 'ok' | 'stale' | 'not_installed'
