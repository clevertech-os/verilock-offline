/**
 * Rich verification proof JSON — fingerprint + chain locks + optional directory meta.
 * Never includes document file bytes.
 */

import { buildNimiqExplorerUrl } from './attestation'
import type { FindSealMatchesResult } from './nimiqRpc'
import type { OnlineMatch } from './onlineLookup'
import { onlineVerifyUrl } from './onlineLookup'

export interface VerificationProofMatch {
  txHash: string
  confirmations: number
  blockNumber: number | null
  chainSha256: string
  shortId: string
  format: string
  explorerUrl: string
  senderAddress?: string
}

export interface VerificationProofAgreement {
  id: string
  slug: string
  title: string
  status: string
  originalFilename: string | null
  finalSha256: string | null
  lockedAt: number | null
  createdAt: number
  verifyUrl: string
}

/** v2 proof package for auditors — no file bytes. */
export interface VerificationProof {
  v: 2
  app: 'verilock-offline'
  appVersion: string
  surface: 'web' | 'desktop'
  generatedAt: string
  file: {
    filename: string
    size: number
    sha256: string
  }
  /** Viewer wallet when logged in (optional). */
  walletAddress: string | null
  chain: {
    status: 'ok' | 'error'
    rpcUrl: string
    sinkAddress: string | null
    scannedTxs: number | null
    lockTxs: number | null
    truncated: boolean | null
    message: string | null
    matchCount: number
    matches: VerificationProofMatch[]
  }
  /** Directory hits from verilock.online (hash only) when available. */
  agreements: VerificationProofAgreement[]
  notes: string[]
}

export function buildVerificationProof(input: {
  filename: string
  size: number
  sha256: string
  appVersion: string
  surface: 'web' | 'desktop'
  rpcUrl: string
  scanResult: FindSealMatchesResult | null
  onlineMatches?: OnlineMatch[] | null
  onlineApiBase?: string
  walletAddress?: string | null
}): VerificationProof {
  const sha256 = input.sha256.toLowerCase()
  const notes: string[] = [
    'Document file bytes are not included in this proof.',
    'Fingerprint was computed locally with SHA-256.',
  ]

  let chain: VerificationProof['chain']
  const scan = input.scanResult

  if (!scan) {
    chain = {
      status: 'error',
      rpcUrl: input.rpcUrl,
      sinkAddress: null,
      scannedTxs: null,
      lockTxs: null,
      truncated: null,
      message: 'No chain scan was run for this file.',
      matchCount: 0,
      matches: [],
    }
    notes.push('Chain scan was not available when this proof was saved.')
  } else if (scan.status === 'error') {
    chain = {
      status: 'error',
      rpcUrl: input.rpcUrl,
      sinkAddress: null,
      scannedTxs: null,
      lockTxs: null,
      truncated: null,
      message: scan.message,
      matchCount: 0,
      matches: [],
    }
    notes.push(`Chain scan failed: ${scan.message}`)
  } else {
    const matches: VerificationProofMatch[] = scan.matches.map(m => ({
      txHash: m.tx.hash,
      confirmations: m.tx.confirmations,
      blockNumber: m.tx.blockNumber ?? null,
      chainSha256: m.chainSha256,
      shortId: m.shortId,
      format: m.format,
      explorerUrl: buildNimiqExplorerUrl(m.tx.hash),
      senderAddress: m.tx.from || undefined,
    }))
    chain = {
      status: 'ok',
      rpcUrl: input.rpcUrl,
      sinkAddress: scan.sinkAddress,
      scannedTxs: scan.scannedTxs,
      lockTxs: scan.sealTxs,
      truncated: scan.truncated,
      message: null,
      matchCount: matches.length,
      matches,
    }
    if (matches.length > 0) {
      notes.push(
        `Found ${matches.length} on-chain lock match${matches.length === 1 ? '' : 'es'} for this fingerprint.`,
      )
    } else {
      notes.push('No on-chain lock matched this fingerprint in the scanned sink history.')
    }
    if (scan.truncated) {
      notes.push(
        'Chain scan was truncated (recent history only). A lock may still exist — verify with a transaction hash if you have one.',
      )
    }
  }

  const base = (input.onlineApiBase ?? 'https://verilock.online').replace(/\/$/, '')
  const agreements: VerificationProofAgreement[] = (input.onlineMatches ?? []).map(m => ({
    id: m.id,
    slug: m.slug,
    title: m.title,
    status: m.status,
    originalFilename: m.originalFilename,
    finalSha256: m.finalSha256,
    lockedAt: m.lockedAt,
    createdAt: m.createdAt,
    verifyUrl: onlineVerifyUrl(base, m.slug),
  }))
  if (agreements.length > 0) {
    notes.push(
      `Directory listed ${agreements.length} agreement${agreements.length === 1 ? '' : 's'} for this fingerprint on verilock.online.`,
    )
  }

  return {
    v: 2,
    app: 'verilock-offline',
    appVersion: input.appVersion,
    surface: input.surface,
    generatedAt: new Date().toISOString(),
    file: {
      filename: input.filename,
      size: input.size,
      sha256,
    },
    walletAddress: input.walletAddress?.trim() || null,
    chain,
    agreements,
    notes,
  }
}
