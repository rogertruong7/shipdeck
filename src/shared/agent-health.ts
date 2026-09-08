import type { AgentHealth } from './types'

export const AGENT_STALE_MS = 3 * 60 * 1000
export const POKE_COOLDOWN_MS = 5 * 60 * 1000

/**
 * Whether the launchd agent has stopped ticking, measured against *awake* time.
 *
 * launchd holds StartInterval spawns while the Mac sleeps, so the raw gap between
 * ticks says nothing on its own — agent.log carries 230 gaps over an hour and a
 * 16h maximum, all of them ordinary overnight sleep. Comparing against the later of
 * (last tick, last wake) asks the question that actually matters: has the agent
 * failed to tick while the machine was up to run it?
 */
export function agentStale(lastTickMs: number, lastWakeMs: number, nowMs: number, staleMs = AGENT_STALE_MS): boolean {
  return nowMs - Math.max(lastTickMs, lastWakeMs) > staleMs
}

export interface PokeInput {
  health: AgentHealth
  runInProgress: boolean
  lastPokeMs: number
  nowMs: number
  cooldownMs?: number
}

/**
 * Whether to kickstart the agent to get it ticking again.
 *
 * launchd can keep a job loaded and enabled while quietly refusing every non-demand
 * spawn (`pended nondemand spawn` in `launchctl print`) — RunAtLoad and StartInterval
 * both stop firing, and even bootout/bootstrap doesn't clear it. An explicit
 * kickstart still runs, so that's what we reach for; reinstalling would not help.
 */
export function shouldPokeAgent({ health, runInProgress, lastPokeMs, nowMs, cooldownMs = POKE_COOLDOWN_MS }: PokeInput): boolean {
  if (health !== 'stale') return false
  if (runInProgress) return false
  return nowMs - lastPokeMs >= cooldownMs
}
