import { api } from '../api'

export function FolderList({ folders, onChange }: { folders: string[]; onChange: (folders: string[]) => void }) {
  const add = async () => {
    const picked = await api.pickFolder()
    if (picked && !folders.includes(picked)) onChange([...folders, picked])
  }
  return (
    <div className="folder-list">
      {folders.map(f => (
        <div key={f} className="folder-row">
          <code>{f}</code>
          <button className="x" title="Remove folder" onClick={() => onChange(folders.filter(x => x !== f))}>
            ✕
          </button>
        </div>
      ))}
      <button className="folder-add" onClick={() => void add()}>
        + Add folder…
      </button>
    </div>
  )
}
