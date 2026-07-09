import type { Schedule } from './types'

export function selectDue(schedules: Schedule[], now: Date): Schedule[] {
  return schedules
    .filter(s => s.status === 'armed' && Date.parse(s.fireAt) <= now.getTime())
    .sort((a, b) => Date.parse(a.fireAt) - Date.parse(b.fireAt))
}

export function armReplacing(schedules: Schedule[], next: Schedule): Schedule[] {
  return [...schedules.filter(s => !(s.worktreePath === next.worktreePath && s.status === 'armed')), next]
}

export function lateBySeconds(scheduledFor: string, startedAt: Date): number {
  return Math.max(0, Math.round((startedAt.getTime() - Date.parse(scheduledFor)) / 1000))
}

const STALE_MS = 2 * 60 * 60 * 1000

export function staleRunning(schedules: Schedule[], now: Date): Schedule[] {
  return schedules.filter(s => s.status === 'running' && s.startedAt !== undefined && now.getTime() - Date.parse(s.startedAt) > STALE_MS)
}
