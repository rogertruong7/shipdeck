import { homedir } from 'node:os'
import { join } from 'node:path'

export const STATE_DIR = process.env.SHIPDECK_STATE_DIR ?? join(homedir(), '.shipdeck')
export const CONFIG_FILE = join(STATE_DIR, 'config.json')
export const SCHEDULES_FILE = join(STATE_DIR, 'schedules.json')
export const RUNS_DIR = join(STATE_DIR, 'runs')
export const AGENT_DIR = join(STATE_DIR, 'agent')
export const AGENT_JS = join(AGENT_DIR, 'agent.js')
export const AGENT_LOG = join(STATE_DIR, 'agent.log')
export const AGENT_LOCK = join(STATE_DIR, 'agent.lock')
export const LAUNCH_AGENT_LABEL = 'com.roger.shipdeck.agent'
export const LAUNCH_AGENT_PLIST = join(homedir(), 'Library', 'LaunchAgents', `${LAUNCH_AGENT_LABEL}.plist`)

export function expandTilde(p: string): string {
  return p === '~' || p.startsWith('~/') ? join(homedir(), p.slice(1)) : p
}
