import { describe, expect, it } from 'vitest'
import { matchLocalToCertificate, parseCertificateJson } from './certificate'

const SHA = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const OTHER = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'

describe('certificate', () => {
  it('parses minimal certificate', () => {
    const json = JSON.stringify({
      v: 1,
      app: 'verilock',
      finalSha256: SHA,
      title: 'Test',
    })
    const r = parseCertificateJson(json)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.cert.finalSha256).toBe(SHA)
      expect(r.cert.title).toBe('Test')
    }
  })

  it('prefers finalSha256 match', () => {
    const cert = {
      v: 1,
      app: 'verilock',
      originalSha256: OTHER,
      finalSha256: SHA,
    }
    const m = matchLocalToCertificate(SHA, cert)
    expect(m.kind).toBe('match')
    if (m.kind === 'match') expect(m.field).toBe('finalSha256')
  })

  it('falls back to originalSha256', () => {
    const cert = {
      v: 1,
      app: 'verilock',
      originalSha256: SHA,
      finalSha256: null,
    }
    const m = matchLocalToCertificate(SHA, cert)
    expect(m.kind).toBe('match')
    if (m.kind === 'match') expect(m.field).toBe('originalSha256')
  })

  it('rejects invalid json', () => {
    const r = parseCertificateJson('{')
    expect(r.ok).toBe(false)
  })
})
