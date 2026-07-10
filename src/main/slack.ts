// Pure Slack Web API client. The token is always passed in and nothing here
// touches Electron or config, so this module runs under plain node in tests.
import type { SlackChannel, SlackPendingMessage } from '../shared/types'

const FRIENDLY: Record<string, string> = {
  invalid_auth: 'Slack token is invalid or revoked — update it in Settings.',
  token_revoked: 'Slack token is invalid or revoked — update it in Settings.',
  account_inactive: 'Slack token is invalid or revoked — update it in Settings.',
  missing_scope: 'Slack app is missing a scope — add chat:write, channels:read, groups:read under OAuth & Permissions, then reinstall the app.',
  not_in_channel: "The bot isn't in that channel — run /invite @<bot> there first.",
  channel_not_found: "The bot isn't in that channel — run /invite @<bot> there first.",
  time_in_past: 'That time is in the past.',
  time_too_far: 'Slack only allows scheduling up to 120 days ahead.',
  msg_too_long: 'Message is too long for Slack.',
  ratelimited: 'Slack rate limit hit — try again in a minute.',
  network: "Couldn't reach Slack — check your connection.",
}

function friendly(code: string): string {
  return FRIENDLY[code] ?? `Slack error: ${code}`
}

// Form encoding, not JSON: every Web API method accepts it, including the
// read methods (conversations.list) that reject JSON bodies.
async function call(token: string, method: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    })
    return (await res.json()) as Record<string, unknown>
  } catch {
    return { ok: false, error: 'network' }
  }
}

function nextCursor(r: Record<string, unknown>): string {
  return String((r.response_metadata as { next_cursor?: string } | undefined)?.next_cursor ?? '')
}

export async function slackTest(token: string): Promise<{ ok: boolean; team?: string; botName?: string; error?: string }> {
  const r = await call(token, 'auth.test')
  if (r.ok !== true) return { ok: false, error: friendly(String(r.error)) }
  return { ok: true, team: String(r.team ?? ''), botName: String(r.user ?? '') }
}

export async function slackChannels(token: string): Promise<{ ok: boolean; channels?: SlackChannel[]; error?: string }> {
  const channels: SlackChannel[] = []
  let cursor = ''
  do {
    const r = await call(token, 'conversations.list', {
      types: 'public_channel,private_channel',
      exclude_archived: 'true',
      limit: '200',
      ...(cursor ? { cursor } : {}),
    })
    if (r.ok !== true) return { ok: false, error: friendly(String(r.error)) }
    for (const c of (r.channels as Array<{ id: string; name: string; is_private?: boolean }> | undefined) ?? []) {
      channels.push({ id: c.id, name: c.name, isPrivate: c.is_private === true })
    }
    cursor = nextCursor(r)
  } while (cursor)
  channels.sort((a, b) => a.name.localeCompare(b.name))
  return { ok: true, channels }
}

export async function slackSchedule(token: string, channelId: string, text: string, postAt: number): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const r = await call(token, 'chat.scheduleMessage', { channel: channelId, text, post_at: String(postAt) })
  if (r.ok !== true) return { ok: false, error: friendly(String(r.error)) }
  return { ok: true, messageId: String(r.scheduled_message_id ?? '') }
}

export async function slackPending(token: string): Promise<{ ok: boolean; messages?: SlackPendingMessage[]; error?: string }> {
  const messages: SlackPendingMessage[] = []
  let cursor = ''
  do {
    const r = await call(token, 'chat.scheduledMessages.list', { limit: '100', ...(cursor ? { cursor } : {}) })
    if (r.ok !== true) return { ok: false, error: friendly(String(r.error)) }
    for (const m of (r.scheduled_messages as Array<{ id: string; channel_id: string; text?: string; post_at: number }> | undefined) ?? []) {
      messages.push({ id: m.id, channelId: m.channel_id, text: m.text ?? '', postAt: m.post_at })
    }
    cursor = nextCursor(r)
  } while (cursor)
  messages.sort((a, b) => a.postAt - b.postAt)
  return { ok: true, messages }
}

export async function slackCancel(token: string, channelId: string, messageId: string): Promise<{ ok: boolean; error?: string }> {
  const r = await call(token, 'chat.deleteScheduledMessage', { channel: channelId, scheduled_message_id: messageId })
  if (r.ok !== true) return { ok: false, error: friendly(String(r.error)) }
  return { ok: true }
}
