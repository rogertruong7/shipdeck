# Shipdeck E2E checklist

Run after packaging or major changes.

1. Scratch worktree run
   - In a throwaway repo with a GitHub remote, create a worktree with a small change.
   - Arm a schedule 2 minutes out with no reviewers. Quit Shipdeck entirely.
   - Within ~3 minutes: macOS notification with a PR URL; PR exists on GitHub;
     `~/.shipdeck/runs/<id>.json` says done; schedule gone from schedules.json.
2. Catch-up after sleep
   - Arm 5 minutes out, close the lid (on battery) past the fire time, reopen.
   - Run fires within ~60s of wake; Runs drawer shows "ran N min late".
3. Exact wake on AC
   - Enable exact wake-ups; arm 5 minutes out; plug in; close the lid.
   - Mac wakes ~2 min before and the PR notification arrives on time.
   - `pmset -g sched` shows the wake event before; empty after.
4. Needs-attention path
   - Add a fake `AWS_SECRET_ACCESS_KEY=...` line to a scratch worktree, arm 1 min out.
   - Run ends "Needs attention", nothing committed, log shows the secret-scan stop.
5. Daily summary
   - "Get daily summary" → output matches /daily-summary format; "Copy for Slack" →
     paste into Slack shows bold headings + clickable links; plain copy pastes raw.
6. App-closed guarantee
   - `launchctl print gui/$(id -u)/com.roger.shipdeck.agent | grep state` with the
     app closed → still loaded; agent.log ticks every ~60s.
7. New-feature spot checks
   - Skills button → edit + save a skill file, confirm the file on disk changed (revert after).
   - A card with commits ahead → toggle "vs main", file list grows to include committed changes.
   - Any diff → Split view shows old/new side by side; preference survives app restart.
