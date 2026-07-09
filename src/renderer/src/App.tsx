import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AgentHealth, BranchGroup, RunRecord, Schedule } from '../../shared/types'
import { api } from './api'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { GroupView } from './components/GroupView'
import { RunsDrawer } from './components/RunsDrawer'
import { SummaryDock } from './components/SummaryDock'
import { SkillsModal } from './components/SkillsModal'

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

  useEffect(() => {
    void api.getConfig().then(c => setClaudeMissing(c.claudePath === 'auto'))
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

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase()
    if (!f) return groups
    return groups.filter(g => g.key.toLowerCase().includes(f) || g.worktrees.some(w => w.repo.toLowerCase().includes(f)))
  }, [groups, filter])

  const dirty = visible.filter(g => g.dirty)
  const clean = visible.filter(g => !g.dirty)
  const shown = selectedKey ? visible.filter(g => g.key === selectedKey) : dirty

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
      />
      {claudeMissing && (
        <div className="banner">
          claude CLI not found on your shell PATH — scheduled runs and summaries will fail. Install Claude Code or set
          "claudePath" in ~/.shipdeck/config.json, then relaunch.
        </div>
      )}
      <div className="body">
        <Sidebar groups={visible} selected={selectedKey} onSelect={setSelectedKey} filter={filter} onFilter={setFilter} />
        <main className="main">
          {shown.map(g => (
            <GroupView key={g.key} group={g} schedules={schedules} onSchedulesChange={setSchedules} />
          ))}
          {!selectedKey && clean.length > 0 && (
            <details className="clean-section">
              <summary>
                {clean.length} clean branch{clean.length === 1 ? '' : 'es'}
              </summary>
              {clean.map(g => (
                <GroupView key={g.key} group={g} schedules={schedules} onSchedulesChange={setSchedules} />
              ))}
            </details>
          )}
          {shown.length === 0 && clean.length === 0 && <div className="empty">No worktrees found. Check scan roots in ~/.shipdeck/config.json.</div>}
        </main>
      </div>
      {runsOpen && <RunsDrawer runs={runs} schedules={schedules} onClose={() => setRunsOpen(false)} onSchedulesChange={setSchedules} />}
      <SummaryDock startSignal={summarySignal} onOpenRuns={() => setRunsOpen(true)} onDone={refresh} />
      {skillsOpen && <SkillsModal onClose={() => setSkillsOpen(false)} />}
    </div>
  )
}
