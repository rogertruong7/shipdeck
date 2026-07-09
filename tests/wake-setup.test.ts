import { describe, expect, it } from 'vitest'
import { wakeSetupScript } from '../src/main/wake-setup'

describe('wakeSetupScript', () => {
  const rule = 'roger ALL=(root) NOPASSWD: /usr/bin/pmset schedule *'

  it('creates a fresh unpredictable temp file via mktemp rather than a fixed path', () => {
    const script = wakeSetupScript(rule)
    expect(script).toContain('/usr/bin/mktemp /private/tmp/shipdeck-sudoers.XXXXXX')
    expect(script).not.toContain("'/private/tmp/shipdeck-sudoers'")
  })

  it('validates with visudo -c before installing', () => {
    const script = wakeSetupScript(rule)
    const mktempIdx = script.indexOf('mktemp')
    const visudoIdx = script.indexOf('visudo -c -f')
    const installIdx = script.indexOf('install -m 440')
    expect(mktempIdx).toBeGreaterThanOrEqual(0)
    expect(visudoIdx).toBeGreaterThan(mktempIdx)
    expect(installIdx).toBeGreaterThan(visudoIdx)
  })

  it('quotes the mktemp-generated path throughout so it survives the AppleScript escaping chain', () => {
    const script = wakeSetupScript(rule)
    expect(script).toContain('> "$f"')
    expect(script).toContain('visudo -c -f "$f"')
    expect(script).toContain('install -m 440 -o root -g wheel "$f" /etc/sudoers.d/shipdeck')
    expect(script).toContain('rm "$f"')
  })

  it('embeds the given sudoers rule text', () => {
    const script = wakeSetupScript(rule)
    expect(script).toContain(rule)
  })
})
