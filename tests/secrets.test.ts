import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (b: Buffer) => {
      const s = b.toString()
      if (!s.startsWith('enc:')) throw new Error('bad blob')
      return s.slice(4)
    },
  },
}))

import { decryptSecret, encryptSecret } from '../src/main/secrets'

describe('secrets', () => {
  it('round-trips a secret and never stores it verbatim', () => {
    const blob = encryptSecret('xoxb-secret')
    expect(blob).not.toContain('xoxb-secret')
    expect(decryptSecret(blob)).toBe('xoxb-secret')
  })

  it('returns empty string for empty or corrupt blobs', () => {
    expect(decryptSecret('')).toBe('')
    expect(decryptSecret(Buffer.from('garbage').toString('base64'))).toBe('')
  })
})
