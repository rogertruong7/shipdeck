// Slack rejects chat.scheduleMessage more than 120 days out (time_too_far);
// we validate client-side so the user gets feedback before the API call.
export const SLACK_MAX_DAYS_AHEAD = 120

export function validatePostAt(at: Date, now: Date): string | null {
  const ms = at.getTime()
  if (Number.isNaN(ms)) return 'Pick a valid date and time.'
  if (ms <= now.getTime()) return 'That time is in the past.'
  if (ms > now.getTime() + SLACK_MAX_DAYS_AHEAD * 86_400_000) return 'Slack only allows scheduling up to 120 days ahead.'
  return null
}

export function toPostAt(at: Date): number {
  return Math.floor(at.getTime() / 1000)
}
