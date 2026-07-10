import { safeStorage } from 'electron'

// The Slack token lives in config.json as a safeStorage (Keychain-backed)
// blob so a plaintext secret never sits on disk. Decrypt failures (corrupt
// blob, config copied from another machine) read as "not configured" rather
// than erroring — the user just reconnects.
export function encryptSecret(plain: string): string {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Encryption unavailable on this system')
  return safeStorage.encryptString(plain).toString('base64')
}

export function decryptSecret(blob: string): string {
  if (!blob) return ''
  try {
    return safeStorage.decryptString(Buffer.from(blob, 'base64'))
  } catch {
    return ''
  }
}
