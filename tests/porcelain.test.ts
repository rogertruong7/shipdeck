import { describe, expect, it } from 'vitest'
import { parsePorcelainV2 } from '../src/shared/porcelain'

const SAMPLE = [
  '# branch.oid ada199ae0000000000000000000000000000dead',
  '# branch.head sam/eng-101-added-search',
  '# branch.upstream origin/sam/eng-101-added-search',
  '# branch.ab +3 -1',
  '1 .M N... 100644 100644 100644 abc def src/components/Remarks.tsx',
  '1 M. N... 100644 100644 100644 abc def src/api/client.ts',
  '1 MM N... 100644 100644 100644 abc def src/App with space.tsx',
  '2 R. N... 100644 100644 100644 abc def R100 src/new-name.ts\tsrc/old-name.ts',
  '? notes.md',
  '',
].join('\n')

describe('parsePorcelainV2', () => {
  it('parses branch, upstream, and ahead/behind', () => {
    const st = parsePorcelainV2(SAMPLE)
    expect(st.branch).toBe('sam/eng-101-added-search')
    expect(st.upstream).toBe('origin/sam/eng-101-added-search')
    expect(st.ahead).toBe(3)
    expect(st.behind).toBe(1)
  })

  it('splits staged vs unstaged, keeps paths with spaces, uses new path for renames', () => {
    const st = parsePorcelainV2(SAMPLE)
    expect(st.unstaged).toEqual(['src/components/Remarks.tsx', 'src/App with space.tsx'])
    expect(st.staged).toEqual(['src/api/client.ts', 'src/App with space.tsx', 'src/new-name.ts'])
    expect(st.untracked).toEqual(['notes.md'])
  })

  it('handles detached HEAD and no upstream', () => {
    const st = parsePorcelainV2('# branch.oid abc\n# branch.head (detached)\n')
    expect(st.branch).toBeNull()
    expect(st.upstream).toBeNull()
    expect(st.ahead).toBe(0)
    expect(st.behind).toBe(0)
  })
})
