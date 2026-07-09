import type { BranchGroup } from '../../../shared/types'

interface Props {
  groups: BranchGroup[]
  hiddenGroups: BranchGroup[]
  selected: string | null
  onSelect: (key: string | null) => void
  filter: string
  onFilter: (f: string) => void
}

export function Sidebar({ groups, hiddenGroups, selected, onSelect, filter, onFilter }: Props) {
  return (
    <nav className="sidebar">
      <input className="search" placeholder="Filter branches…" value={filter} onChange={e => onFilter(e.target.value)} />
      <button className={`side-item ${selected === null ? 'active' : ''}`} onClick={() => onSelect(null)}>
        <span className="side-name">All changes</span>
      </button>
      {groups.map(g => {
        const files = g.worktrees.reduce((n, w) => n + w.files.length, 0)
        return (
          <button
            key={g.key}
            className={`side-item ${selected === g.key ? 'active' : ''} ${g.dirty ? '' : 'muted'}`}
            onClick={() => onSelect(g.key)}
          >
            <span className="side-name">{g.key}</span>
            {files > 0 && <span className="badge">{files}</span>}
          </button>
        )
      })}
      {hiddenGroups.length > 0 && (
        <>
          <div className="side-section">Hidden</div>
          {hiddenGroups.map(g => (
            <button
              key={`hidden-${g.key}`}
              className={`side-item muted ${selected === g.key ? 'active' : ''}`}
              onClick={() => onSelect(g.key)}
            >
              <span className="side-name">{g.key}</span>
            </button>
          ))}
        </>
      )}
    </nav>
  )
}
