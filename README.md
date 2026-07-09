# Shipdeck

Local macOS dashboard for git worktrees. Shows every worktree across `~/coding` and
`~/conductor/workspaces` grouped by branch name (one ticket's work across repos sits
together), with inline diffs. Each dirty worktree can be armed with a one-shot timer
that runs `/split-commit-pr` headlessly via the claude CLI — the timer lives in a
launchd agent, so it fires even with the app closed and the lid shut. A "Get daily
summary" button runs `/daily-summary` and copies it Slack-ready.

A few more things it does:

- **Skills editor**: the "Skills" button in the top bar edits
  `~/.claude/skills/split-commit-pr/SKILL.md` and `~/.claude/skills/daily-summary/SKILL.md`
  in place — the next run uses the edited skill immediately.
- **Diff modes**: each card with commits ahead has an Uncommitted / vs `<default branch>`
  toggle; branch mode shows everything the branch changes relative to the default
  branch's merge-base, including uncommitted and untracked work.
- **Split diffs**: the diff viewer has a Unified/Split toggle, and the preference is
  remembered.

## Run

- Dev: `npm run dev`
- Package: `npm run package`, then copy `dist/mac-arm64/Shipdeck.app` to /Applications
  and launch it once (this points the scheduler agent at the packaged app).

## How scheduling works

- Arming a card writes `~/.shipdeck/schedules.json`. A launchd agent
  (`com.roger.shipdeck.agent`, every 60s) runs due entries with
  `claude -p "/split-commit-pr <reviewers>" --dangerously-skip-permissions` in the
  worktree, wrapped in `caffeinate` so the Mac stays awake during the push.
- If the run creates a PR you get a notification with the URL. If the skill's secret
  scan blocks the commit, the run shows "Needs attention" in the Runs drawer with the
  full log. Clean worktrees are skipped.
- Sleep: on AC power, "Enable exact wake-ups" (one admin prompt, writes
  /etc/sudoers.d/shipdeck) lets the app schedule a `pmset` wake 2 minutes before each
  timer. On battery with the lid closed, macOS may suppress the wake — the run then
  fires the moment the Mac next wakes, marked "ran N min late". A schedule is never
  lost. Plug in before closing the lid for exact timing.

## State

Everything lives in `~/.shipdeck/`: `config.json` (scan roots, claude path),
`schedules.json`, `runs/` (records + logs), `agent.log`. Delete the directory and
relaunch to reset. To fully uninstall: unload the agent with
`launchctl bootout gui/$UID/com.roger.shipdeck.agent && rm ~/Library/LaunchAgents/com.roger.shipdeck.agent.plist`,
remove the sudoers rule with `sudo rm /etc/sudoers.d/shipdeck`, cancel any pending wakes
with `sudo pmset schedule cancelall`, and delete state with `rm -rf ~/.shipdeck`.
