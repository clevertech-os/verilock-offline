/**
 * VeriLock seal attestation payload (Nimiq basic-tx extra data).
 *
 * Canonical format documented in verilock (product repo):
 *   docs/nimiq-network-integration.md
 *   client/src/nimiq.ts — buildAttestationPayloadBytes
 *   server/src/nimiq-rpc.ts — parseAttestationPayload
 *
 * Binary (current): 37 bytes
 *   [0]     version 0x01
 *   [1..4]  first 8 hex chars of document UUID (no hyphens) as 4 bytes
 *   [5..36] finalSha256 raw bytes (32)
 *
 * Legacy UTF-8: seal:v1:lock:{shortId8}:{sha256}
 *
 * Keep this file in sync when VeriLock adds payload v2.
 */

export const ATTESTATION_PAYLOAD_VERSION = 1
export const ATTESTATION_PAYLOAD_SIZE = 37

export type ParsedAttestation = {
  shortId: string
  sha256: string
  format: 'binary-v1' | 'legacy-utf8'
}

export function docShortId(docId: string): string {
  return docId.replace(/-/g, '').slice(0, 8).toLowerCase()
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/i, '').toLowerCase()
  if (!/^[0-9a-f]*$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error('Invalid hex string')
  }
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Decode recipientData from RPC (hex or UTF-8). */
export function decodeRecipientDataBytes(raw: string): Uint8Array {
  if (!raw) return new Uint8Array(0)
  const clean = raw.replace(/^0x/i, '')
  if (/^[0-9a-fA-F]+$/.test(clean) && clean.length % 2 === 0) {
    return hexToBytes(clean)
  }
  return new TextEncoder().encode(raw)
}

function normalizeAttestationPayloadBytes(bytes: Uint8Array): Uint8Array {
  if (bytes.length === ATTESTATION_PAYLOAD_SIZE) return bytes
  // Sometimes hex is double-encoded as UTF-8 text of the hex string (74 chars).
  if (bytes.length === ATTESTATION_PAYLOAD_SIZE * 2) {
    const asText = new TextDecoder().decode(bytes)
    if (/^[0-9a-f]{74}$/i.test(asText)) {
      return hexToBytes(asText)
    }
  }
  return bytes
}

export function buildAttestationPayloadBytes(docId: string, finalSha256: string): Uint8Array {
  const hash = finalSha256.toLowerCase()
  const shortHex = docShortId(docId)
  if (!/^[a-f0-9]{8}$/.test(shortHex)) {
    throw new Error('Invalid document id for attestation payload')
  }
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error('Invalid sha256 for attestation payload')
  }
  const payload = new Uint8Array(ATTESTATION_PAYLOAD_SIZE)
  payload[0] = ATTESTATION_PAYLOAD_VERSION
  for (let i = 0; i < 4; i++) {
    payload[1 + i] = parseInt(shortHex.slice(i * 2, i * 2 + 2), 16)
  }
  for (let i = 0; i < 32; i++) {
    payload[5 + i] = parseInt(hash.slice(i * 2, i * 2 + 2), 16)
  }
  return payload
}

/**
 * Parse raw recipient data (hex string, binary hex, or legacy UTF-8 seal string).
 */
export function parseAttestationPayload(raw: string): ParsedAttestation | null {
  if (!raw) return null

  const cleanHex = raw.replace(/^0x/i, '').toLowerCase()
  if (/^[0-9a-f]{74}$/.test(cleanHex)) {
    const bytes = hexToBytes(cleanHex)
    if (bytes.length === ATTESTATION_PAYLOAD_SIZE && bytes[0] === ATTESTATION_PAYLOAD_VERSION) {
      return {
        shortId: bytesToHex(bytes.subarray(1, 5)),
        sha256: bytesToHex(bytes.subarray(5, 37)),
        format: 'binary-v1',
      }
    }
  }

  // Try decoding as bytes that may be hex-as-utf8 or binary
  const bytes = normalizeAttestationPayloadBytes(decodeRecipientDataBytes(raw))
  if (bytes.length === ATTESTATION_PAYLOAD_SIZE && bytes[0] === ATTESTATION_PAYLOAD_VERSION) {
    return {
      shortId: bytesToHex(bytes.subarray(1, 5)),
      sha256: bytesToHex(bytes.subarray(5, 37)),
      format: 'binary-v1',
    }
  }

  const asUtf8 = typeof raw === 'string' ? raw : new TextDecoder().decode(bytes)
  const match = asUtf8.match(/^seal:v1:lock:([a-f0-9]{8}):([a-f0-9]{64})$/i)
  if (match) {
    return {
      shortId: match[1]!.toLowerCase(),
      sha256: match[2]!.toLowerCase(),
      format: 'legacy-utf8',
    }
  }

  // UTF-8 may be in the decoded bytes
  try {
    const text = new TextDecoder().decode(bytes)
    const m2 = text.match(/^seal:v1:lock:([a-f0-9]{8}):([a-f0-9]{64})$/i)
    if (m2) {
      return {
        shortId: m2[1]!.toLowerCase(),
        sha256: m2[2]!.toLowerCase(),
        format: 'legacy-utf8',
      }
    }
  } catch {
    /* ignore */
  }

  return null
}

export type HashCompareResult =
  | { kind: 'match'; localSha256: string; chainSha256: string; shortId: string; format: ParsedAttestation['format'] }
  | { kind: 'mismatch'; localSha256: string; chainSha256: string; shortId: string; format: ParsedAttestation['format'] }
  | { kind: 'not-seal'; localSha256: string; rawPreview: string }

export function compareLocalHashToPayload(
  localSha256: string,
  rawRecipientData: string,
): HashCompareResult {
  const local = localSha256.toLowerCase()
  const parsed = parseAttestationPayload(rawRecipientData)
  if (!parsed) {
    const preview =
      rawRecipientData.length > 80 ? `${rawRecipientData.slice(0, 80)}…` : rawRecipientData || '(empty)'
    return { kind: 'not-seal', localSha256: local, rawPreview: preview }
  }
  if (parsed.sha256 === local) {
    return {
      kind: 'match',
      localSha256: local,
      chainSha256: parsed.sha256,
      shortId: parsed.shortId,
      format: parsed.format,
    }
  }
  return {
    kind: 'mismatch',
    localSha256: local,
    chainSha256: parsed.sha256,
    shortId: parsed.shortId,
    format: parsed.format,
  }
}

export function buildNimiqExplorerUrl(txHash: string): string {
  const clean = txHash.replace(/^0x/i, '').toUpperCase()
  return `https://nimiq.watch/#${clean}`
}
