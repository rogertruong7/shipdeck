import type { AgentHealth } from '../../../shared/types'

interface Props {
  scanning: boolean
  health: AgentHealth
  onRefresh: () => void
  onRuns: () => void
  onSummary: () => void
  onRepair: () => void
  onSkills: () => void
  onSettings: () => void
}

export function TopBar({ scanning, health, onRefresh, onRuns, onSummary, onRepair, onSkills, onSettings }: Props) {
  return (
    <header className="topbar">
      <div className="brand">⚓ Shipdeck</div>
      <div className="topbar-actions">
        <button className={`agent-dot ${health}`} title={`Scheduler agent: ${health} (click to repair)`} onClick={onRepair}>
          ●
        </button>
        <button title="Settings" onClick={onSettings}>
          ⚙
        </button>
        <button onClick={onSkills}>Skills</button>
        <button onClick={onRefresh} disabled={scanning}>
          {scanning ? 'Scanning…' : 'Refresh'}
        </button>
        <button onClick={onRuns}>Runs</button>
        <button className="primary" onClick={onSummary}>
          Get daily summary
        </button>
      </div>
    </header>
  )
}
