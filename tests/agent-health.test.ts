import { describe, expect, it } from 'vitest'
import { AGENT_STALE_MS, agentStale, shouldPokeAgent } from '../src/shared/agent-health'

const MIN = 60_000

describe('agentStale', () => {
  const now = Date.parse('2026-09-07T07:30:00Z')

  it('is healthy while ticks keep landing', () => {
    expect(agentStale(now - 1 * MIN, now - 8 * 60 * MIN, now)).toBe(false)
  })

  it('does not flag a gap shorter than the window', () => {
    expect(agentStale(now - 2 * MIN, now - 60 * MIN, now)).toBe(false)
  })

  it('flags a gap just past the window', () => {
    expect(agentStale(now - (AGENT_STALE_MS + 1000), now - 60 * MIN, now)).toBe(true)
  })

  // launchd holds StartInterval spawns while the Mac sleeps, so a 16h gap across a
  // night is normal — measuring from the wake instead of the tick keeps the morning
  // quiet. agent.log has 230 gaps over an hour, all of them sleep.
  it('stays healthy when a long gap is explained by sleep', () => {
    expect(agentStale(now - 16 * 60 * MIN, now - 1 * MIN, now)).toBe(false)
  })

  it('goes stale once the Mac has been awake past the window with no tick', () => {
    // the real failure: last tick 16h ago, but awake for the last 8.5h
    expect(agentStale(now - 16 * 60 * MIN, now - 510 * MIN, now)).toBe(true)
  })

  it('treats a missing tick timestamp as no tick at all', () => {
    expect(agentStale(0, now - 60 * MIN, now)).toBe(true)
  })
})

describe('shouldPokeAgent', () => {
  const nowMs = Date.parse('2026-09-07T07:30:00Z')
  const base = { health: 'stale' as const, runInProgress: false, lastPokeMs: 0, nowMs }

  it('pokes a stale agent', () => {
    expect(shouldPokeAgent(base)).toBe(true)
  })

  it('leaves a healthy agent alone', () => {
    expect(shouldPokeAgent({ ...base, health: 'ok' })).toBe(false)
  })

  // A run holds one tick open for up to 30 minutes, so silence is expected — poking
  // would bootstrap a second agent against an in-flight commit.
  it('leaves the agent alone while a run is in progress', () => {
    expect(shouldPokeAgent({ ...base, runInProgress: true })).toBe(false)
  })

  it('waits out the cooldown between pokes', () => {
    expect(shouldPokeAgent({ ...base, lastPokeMs: nowMs - 30_000 })).toBe(false)
  })

  it('pokes again once the cooldown has elapsed', () => {
    expect(shouldPokeAgent({ ...base, lastPokeMs: nowMs - 10 * MIN })).toBe(true)
  })

  // An agent that was never installed needs installAgent(), not a kickstart.
  it('does not poke an agent that is not installed', () => {
    expect(shouldPokeAgent({ ...base, health: 'not_installed' })).toBe(false)
  })
})
