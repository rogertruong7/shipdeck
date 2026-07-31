import { sidebarLayout, type SidebarSection } from '../../../shared/grouping'
import type { BranchGroup } from '../../../shared/types'

interface Props {
  groups: BranchGroup[]
  hiddenGroups: BranchGroup[]
  selected: string | null
  onSelect: (key: string | null) => void
  filter: string
  onFilter: (f: string) => void
}

function SectionList({ sections, selected, onSelect }: { sections: SidebarSection[]; selected: string | null; onSelect: (key: string) => void }) {
  return (
    <>
      {sections.map(section => (
        <div key={section.ticket ?? section.groups[0].key}>
          {section.ticket && <div className="side-ticket">{section.ticket}</div>}
          {section.groups.map(g => {
            const files = g.worktrees.reduce((n, w) => n + w.files.length, 0)
            return (
              <button
                key={g.key}
                className={`side-item ${section.ticket ? 'in-ticket' : ''} ${selected === g.key ? 'active' : ''} ${g.dirty ? '' : 'muted'}`}
                onClick={() => onSelect(g.key)}
              >
                <span className="side-name">{g.key}</span>
                {files > 0 && <span className="badge">{files}</span>}
              </button>
            )
          })}
        </div>
      ))}
    </>
  )
}

export function Sidebar({ groups, hiddenGroups, selected, onSelect, filter, onFilter }: Props) {
  const sortedHidden = [...hiddenGroups].sort((a, b) => a.key.toLowerCase().localeCompare(b.key.toLowerCase()))
  const { changed, unchanged } = sidebarLayout(groups)
  return (
    <nav className="sidebar">
      <input className="search" placeholder="Filter branches…" value={filter} onChange={e => onFilter(e.target.value)} />
      <button className={`side-item ${selected === null ? 'active' : ''}`} onClick={() => onSelect(null)}>
        <span className="side-name">All changes</span>
      </button>
      {changed.length > 0 && (
        <>
          <div className="side-section">Changes</div>
          <SectionList sections={changed} selected={selected} onSelect={onSelect} />
        </>
      )}
      {unchanged.length > 0 && (
        <>
          <div className="side-section">No changes</div>
          <SectionList sections={unchanged} selected={selected} onSelect={onSelect} />
        </>
      )}
      {hiddenGroups.length > 0 && (
        <details className="side-hidden">
          <summary className="side-section">Hidden ({hiddenGroups.length})</summary>
          {sortedHidden.map(g => (
            <button
              key={`hidden-${g.key}`}
              className={`side-item muted ${selected === g.key ? 'active' : ''}`}
              onClick={() => onSelect(g.key)}
            >
              <span className="side-name">{g.key}</span>
            </button>
          ))}
        </details>
      )}
    </nav>
  )
}
