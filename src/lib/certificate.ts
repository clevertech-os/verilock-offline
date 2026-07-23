/**
 * VeriLock certificate JSON (v1) as produced by verilock.online
 * GET /api/documents/:id/certificate — server/src/certificate.ts
 */

export interface VeriLockCertificateV1 {
  v: number
  app: string
  documentId?: string
  slug?: string
  title?: string
  originalFilename?: string | null
  type?: string
  status?: string
  originalSha256?: string | null
  finalSha256?: string | null
  createdAt?: number
  lockedAt?: number | null
  parties?: unknown[]
  signatures?: unknown[]
  attestation?: {
    txHash?: string
    payload?: string
    blockNumber?: number | null
    senderAddress?: string
    status?: string
    explorerUrl?: string
  } | null
  verifyUrl?: string
  generatedAt?: string
}

export type CertificateParseResult =
  | { ok: true; cert: VeriLockCertificateV1 }
  | { ok: false; error: string }

export function parseCertificateJson(text: string): CertificateParseResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Not valid JSON' }
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Certificate must be a JSON object' }
  }
  const obj = data as Record<string, unknown>
  if (obj.app != null && obj.app !== 'verilock') {
    return { ok: false, error: `Unexpected app field: ${String(obj.app)}` }
  }
  const original =
    typeof obj.originalSha256 === 'string' ? obj.originalSha256.toLowerCase() : null
  const final = typeof obj.finalSha256 === 'string' ? obj.finalSha256.toLowerCase() : null
  if (!original && !final) {
    return { ok: false, error: 'Certificate has no originalSha256 or finalSha256' }
  }
  if (original && !/^[a-f0-9]{64}$/.test(original)) {
    return { ok: false, error: 'originalSha256 is not a 64-char hex SHA-256' }
  }
  if (final && !/^[a-f0-9]{64}$/.test(final)) {
    return { ok: false, error: 'finalSha256 is not a 64-char hex SHA-256' }
  }

  return {
    ok: true,
    cert: {
      v: typeof obj.v === 'number' ? obj.v : 1,
      app: typeof obj.app === 'string' ? obj.app : 'verilock',
      documentId: typeof obj.documentId === 'string' ? obj.documentId : undefined,
      slug: typeof obj.slug === 'string' ? obj.slug : undefined,
      title: typeof obj.title === 'string' ? obj.title : undefined,
      originalFilename:
        typeof obj.originalFilename === 'string' ? obj.originalFilename : null,
      type: typeof obj.type === 'string' ? obj.type : undefined,
      status: typeof obj.status === 'string' ? obj.status : undefined,
      originalSha256: original,
      finalSha256: final,
      createdAt: typeof obj.createdAt === 'number' ? obj.createdAt : undefined,
      lockedAt: typeof obj.lockedAt === 'number' ? obj.lockedAt : null,
      parties: Array.isArray(obj.parties) ? obj.parties : undefined,
      signatures: Array.isArray(obj.signatures) ? obj.signatures : undefined,
      attestation:
        obj.attestation && typeof obj.attestation === 'object'
          ? (obj.attestation as VeriLockCertificateV1['attestation'])
          : null,
      verifyUrl: typeof obj.verifyUrl === 'string' ? obj.verifyUrl : undefined,
      generatedAt: typeof obj.generatedAt === 'string' ? obj.generatedAt : undefined,
    },
  }
}

export type CertHashMatch =
  | { kind: 'match'; field: 'finalSha256' | 'originalSha256'; expected: string; local: string }
  | { kind: 'mismatch'; final?: string | null; original?: string | null; local: string }

/** Prefer finalSha256 (what was locked), then originalSha256. */
export function matchLocalToCertificate(
  localSha256: string,
  cert: VeriLockCertificateV1,
): CertHashMatch {
  const local = localSha256.toLowerCase()
  if (cert.finalSha256 && cert.finalSha256 === local) {
    return { kind: 'match', field: 'finalSha256', expected: cert.finalSha256, local }
  }
  if (cert.originalSha256 && cert.originalSha256 === local) {
    return { kind: 'match', field: 'originalSha256', expected: cert.originalSha256, local }
  }
  return {
    kind: 'mismatch',
    final: cert.finalSha256,
    original: cert.originalSha256,
    local,
  }
}
