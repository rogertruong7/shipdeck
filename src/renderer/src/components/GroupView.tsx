import type { BranchGroup, Schedule } from '../../../shared/types'
import type { HiddenLists } from '../../../shared/hidden'
import { WorktreeCard } from './WorktreeCard'

interface Props {
  group: BranchGroup
  schedules: Schedule[]
  onSchedulesChange: (s: Schedule[]) => void
  hidden: HiddenLists
  onToggleHide: (kind: 'repo' | 'worktree', value: string, hide: boolean) => void
}

export function GroupView({ group, schedules, onSchedulesChange, hidden, onToggleHide }: Props) {
  return (
    <section className="group">
      <h2 className="group-title">
        {group.key}
        <span className="group-meta">
          {group.worktrees.length} worktree{group.worktrees.length === 1 ? '' : 's'}
        </span>
      </h2>
      {group.worktrees.map(w => (
        <WorktreeCard
          key={w.path}
          wt={w}
          schedule={schedules.find(s => s.worktreePath === w.path && s.status === 'armed') ?? schedules.find(s => s.worktreePath === w.path)}
          onSchedulesChange={onSchedulesChange}
          hidden={hidden}
          onToggleHide={onToggleHide}
        />
      ))}
    </section>
  )
}
