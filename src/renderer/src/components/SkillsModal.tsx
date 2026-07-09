import { useEffect, useState } from 'react'
import { api } from '../api'

const SKILLS = ['split-commit-pr', 'daily-summary'] as const

export function SkillsModal({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState<(typeof SKILLS)[number]>('split-commit-pr')
  const [content, setContent] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState('')

  useEffect(() => {
    let stale = false
    setLoaded(false)
    setSaved('')
    void api.readSkill(active).then(text => {
      if (!stale) {
        setContent(text)
        setLoaded(true)
      }
    })
    return () => {
      stale = true
    }
  }, [active])

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog wide" onClick={e => e.stopPropagation()}>
        <h3>Edit skills</h3>
        <div className="presets">
          {SKILLS.map(s => (
            <button key={s} className={active === s ? 'primary' : ''} onClick={() => setActive(s)}>
              /{s}
            </button>
          ))}
        </div>
        <textarea
          className="skill-editor"
          value={content}
          spellCheck={false}
          disabled={!loaded}
          onChange={e => {
            setContent(e.target.value)
            setSaved('')
          }}
        />
        <div className="presets">
          <button className="primary" disabled={!loaded} onClick={() => void api.writeSkill(active, content).then(() => setSaved(`Saved to ~/.claude/skills/${active}/SKILL.md`))}>
            Save
          </button>
          <button onClick={onClose}>Close</button>
        </div>
        {saved && <div className="copied">{saved}</div>}
        <p className="hint">Edits change the real skill file — the next scheduled run or summary uses it immediately.</p>
      </div>
    </div>
  )
}
