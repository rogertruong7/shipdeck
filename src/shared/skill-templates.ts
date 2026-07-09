// Generic SKILL.md templates written during onboarding for users who don't
// already have the split-commit-pr / daily-summary skills. Personalization
// (reviewers, scan folders) comes from the onboarding form — nothing here may
// reference a specific user or org.

export interface ReviewerShortcut {
  key: string
  name: string
}

// One unique single-character shorthand per reviewer: the first character of
// their username not already taken. Falls back to the full name when every
// character is used (only plausible with pathological lists).
export function reviewerShortcuts(reviewers: string[]): ReviewerShortcut[] {
  const used = new Set<string>()
  return reviewers.map(name => {
    let key = name.toLowerCase()
    for (const ch of name.toLowerCase()) {
      if (/[a-z0-9]/.test(ch) && !used.has(ch)) {
        key = ch
        break
      }
    }
    used.add(key)
    return { key, name }
  })
}

export function renderSplitCommitPrSkill(reviewers: string[]): string {
  const shortcuts = reviewerShortcuts(reviewers)
  const shortcutSection = shortcuts.length
    ? `
### Reviewer Shortcuts

| Shorthand | GitHub Username |
|-----------|-----------------|
${shortcuts.map(s => `| \`${s.key}\` | ${s.name} |`).join('\n')}

Examples: \`/split-commit-pr ${shortcuts.map(s => s.key).join(',')}\` or \`/split-commit-pr ${shortcuts[0].name}\`
`
    : ''
  return `---
name: split-commit-pr
description: Split uncommitted changes into logical commits and create a PR with reviewers
user_invocable: true
---

# Split Commits & Create PR

Split the current working directory's staged/unstaged changes into logical,
well-organized commits and open a pull request.

## Usage

\`\`\`
/split-commit-pr [reviewers] [notes]
\`\`\`

- \`reviewers\` — optional shorthand or comma-separated GitHub usernames
- \`notes\` — optional instructions (e.g. "don't commit src/scratch.ts")
${shortcutSection}
## Workflow

### 1. Analyze changes

Run \`git status --short\` and \`git diff HEAD\`, plus \`git ls-files --others --exclude-standard\`
for untracked files. Read the diffs carefully and understand what belongs together.

### 2. Secret scan (REQUIRED — blocking)

Before any \`git add\`, scan every added line and every untracked file you plan to
commit. Do NOT commit if any of these appear:

- Secret-bearing files: \`.env\` and variants (anything other than \`.env.example\`),
  \`*.pem\`, \`*.key\`, \`*.p12\`, \`id_rsa\`, \`credentials.json\`, \`*.tfvars\`
- Key/token patterns: \`AKIA[0-9A-Z]{16}\` (AWS), \`sk-[A-Za-z0-9]{20,}\`,
  \`xox[abpr]-\` (Slack), \`ghp_\` / \`github_pat_\` (GitHub), \`AIza[0-9A-Za-z_-]{35}\`
  (Google), \`eyJ...\` JWTs, \`BEGIN ... PRIVATE KEY\`
- Generic: \`(api[_-]?key|secret|password|token|bearer)\s*[:=]\` followed by a real-looking
  value (placeholders like \`your-key-here\` or \`process.env.FOO\` are fine)

If anything matches: STOP. Commit nothing, and report exactly what was found and
where. (When run headlessly by Shipdeck, stopping here shows the run as
"Needs attention" with your report in the log.)

### 3. Split into logical commits

Group the changes by concern — one feature/fix/refactor per commit, tests with the
code they cover. Each commit message: conventional prefix (\`feat:\`, \`fix:\`,
\`chore:\`, ...) plus a specific subject line. Stage precisely (\`git add <paths>\`,
patch-level if needed) — never \`git add -A\` blindly.

### 4. Push and open the PR

If you're on the default branch, create a descriptive branch first. Then
\`git push -u origin HEAD\` and:

\`\`\`
gh pr create --title "<concise title>" --body "<summary of the commits>"${shortcuts.length ? ' --reviewer <resolved reviewers>' : ''}
\`\`\`

Resolve any reviewer shorthands to full usernames before passing them.

### 5. Report

End by printing the PR URL on its own line — Shipdeck detects
\`github.com/<org>/<repo>/pull/<n>\` in the output to mark the run done.
`
}

export function renderDailySummarySkill(scanRoots: string[]): string {
  const roots = scanRoots.length ? scanRoots : ['~/coding']
  return `---
name: daily-summary
description: Use when the user asks for a daily summary, standup update, or end-of-day recap of work done today
user_invocable: true
---

# Daily Summary

Generate a standup-style summary of today's work across all your repos.

## Usage

\`\`\`
/daily-summary
\`\`\`

## Workflow

### 1. Find your repos

Look for git repositories under:

${roots.map(r => `- \`${r}\``).join('\n')}

\`\`\`bash
find <folder> -maxdepth 3 -type d -name .git -not -path '*/node_modules/*' 2>/dev/null
\`\`\`

### 2. Collect today's work (run per repo, in parallel)

**Commits you authored today** — exclude merge commits (\`--no-merges\`) and GitHub
squash-merges (their subjects end in \`(#NNN)\`; GitHub stamps them with merge time,
so date filtering alone can't exclude them):

\`\`\`bash
TODAY=$(date +%Y-%m-%d)
git log --all --no-merges --author="$(git config user.name)" \\
  --format="%H %ad %s" --date=short 2>/dev/null |
  awk -v d="$TODAY" '$2==d && !/\\(#[0-9]+\\)[[:space:]]*$/'
\`\`\`

For commits that need more context, read the diff with \`git show -p <hash>\`.

**Work in progress:** \`git status --short\` — uncommitted changes belong in the
summary with a note about what's left.

**PRs:** \`gh pr list --author @me --state all --limit 20\` — PRs opened today and
anything still open/in review.

### 3. Write the summary

Output ONLY the finished summary as your final message (Shipdeck copies it
Slack-ready), in this shape:

\`\`\`
**What I did**
- <repo>: <one line per meaningful unit of work; mention WIP explicitly>

**In review**
- [<repo>#<n>](<pr url>) — <title>

**Up next**
- <short bullets, only if clear from the work>
\`\`\`

Keep bullets short and concrete. Skip empty sections.
`
}
