export interface PorcelainStatus {
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  staged: string[]
  unstaged: string[]
  untracked: string[]
}

export function parsePorcelainV2(out: string): PorcelainStatus {
  const st: PorcelainStatus = { branch: null, upstream: null, ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [] }
  for (const line of out.split('\n')) {
    if (line.startsWith('# branch.head ')) {
      const head = line.slice('# branch.head '.length)
      st.branch = head === '(detached)' ? null : head
    } else if (line.startsWith('# branch.upstream ')) {
      st.upstream = line.slice('# branch.upstream '.length)
    } else if (line.startsWith('# branch.ab ')) {
      const m = line.match(/\+(\d+) -(\d+)/)
      if (m) {
        st.ahead = Number(m[1])
        st.behind = Number(m[2])
      }
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const parts = line.split(' ')
      const xy = parts[1]
      // type-1 lines have 8 fields before the path, type-2 (rename/copy) have 9;
      // rename paths are "<newPath>\t<origPath>" — keep the new path
      const fieldCount = line.startsWith('1 ') ? 8 : 9
      const path = parts.slice(fieldCount).join(' ').split('\t')[0]
      if (xy[0] !== '.') st.staged.push(path)
      if (xy[1] !== '.') st.unstaged.push(path)
    } else if (line.startsWith('? ')) {
      st.untracked.push(line.slice(2))
    }
  }
  return st
}
