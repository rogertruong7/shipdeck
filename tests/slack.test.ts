import { afterEach, describe, expect, it, vi } from 'vitest'
import { slackCancel, slackChannels, slackPending, slackSchedule, slackTest } from '../src/main/slack'

function stubFetch(...bodies: Array<Record<string, unknown>>) {
  const fn = vi.fn()
  for (const b of bodies) fn.mockResolvedValueOnce({ json: () => Promise.resolve(b) })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

describe('slackTest', () => {
  it('returns team and bot name on ok', async () => {
    stubFetch({ ok: true, team: 'Acme', user: 'shipdeck-bot' })
    expect(await slackTest('xoxb-1')).toEqual({ ok: true, team: 'Acme', botName: 'shipdeck-bot' })
  })

  it('maps invalid_auth to a friendly message', async () => {
    stubFetch({ ok: false, error: 'invalid_auth' })
    const r = await slackTest('xoxb-bad')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('invalid or revoked')
  })

  it('reports a connection error when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const r = await slackTest('xoxb-1')
    expect(r.ok).toBe(false)
    expect(r.error).toContain("Couldn't reach Slack")
  })

  it('sends the token as a bearer header to the right endpoint', async () => {
    const fn = stubFetch({ ok: true, team: 't', user: 'u' })
    await slackTest('xoxb-42')
    const [url, init] = fn.mock.calls[0]
    expect(url).toBe('https://slack.com/api/auth.test')
    expect(init.headers.Authorization).toBe('Bearer xoxb-42')
  })
})

describe('slackChannels', () => {
  it('follows next_cursor pagination and sorts by name', async () => {
    stubFetch(
      { ok: true, channels: [{ id: 'C2', name: 'zeta' }], response_metadata: { next_cursor: 'abc' } },
      { ok: true, channels: [{ id: 'C1', name: 'alpha', is_private: true }], response_metadata: { next_cursor: '' } },
    )
    const r = await slackChannels('xoxb-1')
    expect(r.ok).toBe(true)
    expect(r.channels).toEqual([
      { id: 'C1', name: 'alpha', isPrivate: true },
      { id: 'C2', name: 'zeta', isPrivate: false },
    ])
  })

  it('passes the cursor on the second request', async () => {
    const fn = stubFetch(
      { ok: true, channels: [], response_metadata: { next_cursor: 'abc' } },
      { ok: true, channels: [] },
    )
    await slackChannels('xoxb-1')
    expect(fn).toHaveBeenCalledTimes(2)
    expect(String(fn.mock.calls[1][1].body)).toContain('cursor=abc')
  })

  it('surfaces slack errors', async () => {
    stubFetch({ ok: false, error: 'some_unknown_error' })
    const r = await slackChannels('xoxb-1')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('Slack error: some_unknown_error')
  })

  it('maps missing_scope to a scopes hint', async () => {
    stubFetch({ ok: false, error: 'missing_scope' })
    const r = await slackChannels('xoxb-1')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('missing a scope')
  })
})

describe('slackSchedule', () => {
  it('posts channel, text and post_at as unix seconds', async () => {
    const fn = stubFetch({ ok: true, scheduled_message_id: 'Q123' })
    const r = await slackSchedule('xoxb-1', 'C1', 'hello', 1780000000)
    expect(r).toEqual({ ok: true, messageId: 'Q123' })
    const body = String(fn.mock.calls[0][1].body)
    expect(body).toContain('channel=C1')
    expect(body).toContain('post_at=1780000000')
  })

  it('maps time_too_far', async () => {
    stubFetch({ ok: false, error: 'time_too_far' })
    const r = await slackSchedule('xoxb-1', 'C1', 'hello', 2000000000)
    expect(r.error).toContain('120 days')
  })

  it('maps not_in_channel to an invite hint', async () => {
    stubFetch({ ok: false, error: 'not_in_channel' })
    const r = await slackSchedule('xoxb-1', 'C1', 'hello', 1780000000)
    expect(r.error).toContain('/invite')
  })
})

describe('slackPending', () => {
  it('maps scheduled messages and sorts by post_at', async () => {
    stubFetch({
      ok: true,
      scheduled_messages: [
        { id: 'Q2', channel_id: 'C1', text: 'later', post_at: 200 },
        { id: 'Q1', channel_id: 'C1', text: 'sooner', post_at: 100 },
      ],
    })
    const r = await slackPending('xoxb-1')
    expect(r.ok).toBe(true)
    expect(r.messages?.map(m => m.id)).toEqual(['Q1', 'Q2'])
    expect(r.messages?.[0]).toEqual({ id: 'Q1', channelId: 'C1', text: 'sooner', postAt: 100 })
  })
})

describe('slackCancel', () => {
  it('sends channel and scheduled_message_id', async () => {
    const fn = stubFetch({ ok: true })
    const r = await slackCancel('xoxb-1', 'C1', 'Q1')
    expect(r).toEqual({ ok: true })
    const body = String(fn.mock.calls[0][1].body)
    expect(body).toContain('channel=C1')
    expect(body).toContain('scheduled_message_id=Q1')
  })
})
