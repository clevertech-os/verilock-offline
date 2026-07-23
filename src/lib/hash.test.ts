import { webcrypto } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildFingerprintReceipt, shortHash } from './hash'

// Node 22+ provides webcrypto; ensure subtle is available for unit tests if needed later
if (!globalThis.crypto) {
  // @ts-expect-error polyfill for older runtimes
  globalThis.crypto = webcrypto
}

describe('hash helpers', () => {
  it('shortHash truncates', () => {
    const h = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    expect(shortHash(h)).toBe('01234567…89abcdef')
  })

  it('builds fingerprint receipt', () => {
    const r = buildFingerprintReceipt({
      filename: 'a.pdf',
      size: 12,
      sha256: 'AA'.repeat(32),
      appVersion: '0.1.0',
      surface: 'web',
    })
    expect(r.v).toBe(1)
    expect(r.app).toBe('verilock-offline')
    expect(r.sha256).toBe('aa'.repeat(32))
    expect(r.hashedAt).toMatch(/T/)
  })
})
