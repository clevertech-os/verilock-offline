import { describe, expect, it } from 'vitest'
import {
  buildAttestationPayloadBytes,
  bytesToHex,
  compareLocalHashToPayload,
  parseAttestationPayload,
} from './attestation'

const DOC_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const SHA = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
/** Known fixture from buildAttestationPayloadBytes */
const BINARY_HEX =
  '01a1b2c3d40123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

describe('attestation payload', () => {
  it('builds binary v1 payload matching fixture', () => {
    const bytes = buildAttestationPayloadBytes(DOC_ID, SHA)
    expect(bytes.length).toBe(37)
    expect(bytes[0]).toBe(1)
    expect(bytesToHex(bytes)).toBe(BINARY_HEX)
  })

  it('parses binary hex payload', () => {
    const parsed = parseAttestationPayload(BINARY_HEX)
    expect(parsed).toEqual({
      shortId: 'a1b2c3d4',
      sha256: SHA,
      format: 'binary-v1',
    })
  })

  it('parses legacy UTF-8 payload', () => {
    const legacy = `seal:v1:lock:a1b2c3d4:${SHA}`
    const parsed = parseAttestationPayload(legacy)
    expect(parsed).toEqual({
      shortId: 'a1b2c3d4',
      sha256: SHA,
      format: 'legacy-utf8',
    })
  })

  it('matches local hash to chain payload', () => {
    const ok = compareLocalHashToPayload(SHA, BINARY_HEX)
    expect(ok.kind).toBe('match')
    const bad = compareLocalHashToPayload(
      'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      BINARY_HEX,
    )
    expect(bad.kind).toBe('mismatch')
  })

  it('rejects non-seal data', () => {
    const r = compareLocalHashToPayload(SHA, 'not-a-seal')
    expect(r.kind).toBe('not-seal')
  })
})
