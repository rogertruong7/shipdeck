import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AgentHealth, BranchGroup, RunRecord, Schedule, ShipdeckConfig } from '../../shared/types'
import { groupWorktrees } from '../../shared/grouping'
import { partitionWorktrees, type HiddenLists } from '../../shared/hidden'
import { api } from './api'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { GroupView } from './components/GroupView'
import { RunsDrawer } from './components/RunsDrawer'
import { SummaryDock } from './components/SummaryDock'
import { SkillsModal } from './components/SkillsModal'
import { OnboardingModal } from './components/OnboardingModal'
import { SettingsModal } from './components/SettingsModal'

const MANAGED_SKILLS = ['split-commit-pr', 'daily-summary']

export default function App() {
  const [groups, setGroups] = useState<BranchGroup[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [health, setHealth] = useState<AgentHealth>('not_installed')
  const [filter, setFilter] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [runsOpen, setRunsOpen] = useState(false)
  const [summarySignal, setSummarySignal] = useState(0)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [claudeMissing, setClaudeMissing] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [onboarding, setOnboarding] = useState<{ config: ShipdeckConfig; missing: string[] } | null>(null)
  const [hidden, setHidden] = useState<HiddenLists>({ repos: [], worktrees: [] })

  useEffect(() => {
    void (async () => {
      try {
        const c = await api.getConfig()
        setClaudeMissing(c.claudePath === 'auto')
        setHidden({ repos: c.hiddenRepos, worktrees: c.hiddenWorktrees })
        if (c.onboardingDone) return
        const missing = (await Promise.all(MANAGED_SKILLS.map(async s => ((await api.skillExists(s)) ? null : s)))).filter(
          (s): s is string => s !== null,
        )
        // A user who already has both skills was never the onboarding audience —
        // mark it done silently so we don't re-check every launch.
        if (missing.length > 0) setOnboarding({ config: c, missing })
        else await api.setConfig({ onboardingDone: true })
      } catch (e) {
        console.error(e)
      }
    })()
  }, [])

  const refresh = useCallback(async () => {
    setScanning(true)
    try {
      const [g, s, r, h] = await Promise.all([api.scan(), api.listSchedules(), api.listRuns(), api.agentHealth()])
      setGroups(g)
      setSchedules(s)
      setRuns(r)
      setHealth(h)
    } catch (e) {
      console.error(e)
    } finally {
      setScanning(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const t = setInterval(() => {
      if (!document.hidden) void refresh()
    }, 30000)
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  const toggleHide = useCallback(async (kind: 'repo' | 'worktree', value: string, hide: boolean) => {
    const c = await api.getConfig()
    const set = new Set(kind === 'repo' ? c.hiddenRepos : c.hiddenWorktrees)
    if (hide) set.add(value)
    else set.delete(value)
    const next = await api.setConfig(kind === 'repo' ? { hiddenRepos: [...set] } : { hiddenWorktrees: [...set] })
    setHidden({ repos: next.hiddenRepos, worktrees: next.hiddenWorktrees })
  }, [])

  const { visibleGroups, hiddenGroups } = useMemo(() => {
    const parts = partitionWorktrees(
      groups.flatMap(g => g.worktrees),
      hidden,
    )
    return { visibleGroups: groupWorktrees(parts.visible), hiddenGroups: groupWorktrees(parts.hidden) }
  }, [groups, hidden])

  const matches = useCallback(
    (g: BranchGroup) => {
      const f = filter.trim().toLowerCase()
      return !f || g.key.toLowerCase().includes(f) || g.worktrees.some(w => w.repo.toLowerCase().includes(f))
    },
    [filter],
  )

  const visible = useMemo(() => visibleGroups.filter(matches), [visibleGroups, matches])
  const hiddenVisible = useMemo(() => hiddenGroups.filter(matches), [hiddenGroups, matches])

  const dirty = visible.filter(g => g.dirty)
  const clean = visible.filter(g => !g.dirty)
  // A selected group may have both visible and hidden worktrees — show them
  // together so hidden ones can be unhidden in place.
  const selectedParts = selectedKey ? [...visible, ...hiddenVisible].filter(g => g.key === selectedKey) : null
  const shown =
    selectedParts === null
      ? dirty
      : selectedParts.length <= 1
        ? selectedParts
        : [{ ...selectedParts[0], worktrees: selectedParts.flatMap(p => p.worktrees), dirty: selectedParts.some(p => p.dirty) }]

  return (
    <div className="app">
      <TopBar
        scanning={scanning}
        health={health}
        onRefresh={() => void refresh()}
        onRuns={() => setRunsOpen(true)}
        onSummary={() => setSummarySignal(n => n + 1)}
        onRepair={() => void api.repairAgent().then(setHealth)}
        onSkills={() => setSkillsOpen(true)}
        onSettings={() => setSettingsOpen(true)}
      />
      {claudeMissing && (
        <div className="banner">
          claude CLI not found on your shell PATH — scheduled runs and summaries will fail. Install Claude Code or set
          "claudePath" in ~/.shipdeck/config.json, then relaunch.
        </div>
      )}
      <div className="body">
        <Sidebar groups={visible} hiddenGroups={hiddenVisible} selected={selectedKey} onSelect={setSelectedKey} filter={filter} onFilter={setFilter} />
        <main className="main">
          {shown.map(g => (
            <GroupView key={g.key} group={g} schedules={schedules} onSchedulesChange={setSchedules} hidden={hidden} onToggleHide={toggleHide} />
          ))}
          {!selectedKey && clean.length > 0 && (
            <details className="clean-section">
              <summary>
                {clean.length} clean branch{clean.length === 1 ? '' : 'es'}
              </summary>
              {clean.map(g => (
                <GroupView key={g.key} group={g} schedules={schedules} onSchedulesChange={setSchedules} hidden={hidden} onToggleHide={toggleHide} />
              ))}
            </details>
          )}
          {shown.length === 0 && clean.length === 0 && <div className="empty">No worktrees found. Choose which folders to scan in Settings (⚙).</div>}
        </main>
      </div>
      {runsOpen && <RunsDrawer runs={runs} schedules={schedules} onClose={() => setRunsOpen(false)} onSchedulesChange={setSchedules} />}
      <SummaryDock startSignal={summarySignal} onOpenRuns={() => setRunsOpen(true)} onDone={refresh} />
      {skillsOpen && <SkillsModal onClose={() => setSkillsOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} onSaved={() => void refresh()} />}
      {onboarding && (
        <OnboardingModal
          config={onboarding.config}
          missing={onboarding.missing}
          onDone={() => {
            setOnboarding(null)
            void refresh()
          }}
        />
      )}
    </div>
  )
}
