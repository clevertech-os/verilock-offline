/**
 * Minimal Nimiq JSON-RPC client for public verification.
 * Only fetches transaction metadata — never sends file bytes.
 */

import { decodeRecipientDataBytes, parseAttestationPayload } from './attestation'

export interface NimiqTransaction {
  hash: string
  from: string
  to: string
  value: number
  recipientData: string
  executionResult: boolean
  confirmations: number
  blockNumber?: number
}

interface RpcResponse<T> {
  jsonrpc?: string
  result?: { data: T } | T
  error?: { message: string; code: number; data?: unknown }
}

export function normalizeTxHash(hash: string): string {
  return hash.replace(/^0x/i, '').replace(/\s+/g, '').toLowerCase()
}

export function isValidTxHash(hash: string): boolean {
  return /^[a-f0-9]{64}$/.test(normalizeTxHash(hash))
}

function unwrapResult<T>(body: RpcResponse<T>): T {
  if (body.error) {
    const msg = body.error.message || 'Nimiq RPC error'
    const data = typeof body.error.data === 'string' ? body.error.data : ''
    throw new Error(data ? `${msg}: ${data}` : msg)
  }
  const r = body.result
  if (r == null) throw new Error('Empty RPC result')
  // Nimiq RPC often wraps as { data: T }
  if (typeof r === 'object' && r !== null && 'data' in r && Object.keys(r as object).length <= 2) {
    return (r as { data: T }).data
  }
  return r as T
}

/** True when the error means the hash is simply unknown (try mempool / not-found). */
export function isTransactionNotFoundError(message: string): boolean {
  return /not found|unknown transaction|null|empty rpc result|does not exist/i.test(message)
}

export async function rpcCall<T>(
  rpcUrl: string,
  method: string,
  params: unknown[] = [],
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  let res: Response
  try {
    res = await fetchImpl(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params,
      }),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`RPC network error: ${msg}`)
  }
  if (!res.ok) {
    throw new Error(`RPC HTTP ${res.status} ${res.statusText}`)
  }
  const body = (await res.json()) as RpcResponse<T>
  return unwrapResult(body)
}

function extractRecipientData(raw: Record<string, unknown>): string {
  if (typeof raw.recipientData === 'string') return raw.recipientData
  if (typeof raw.data === 'string') return raw.data
  if (raw.data && typeof raw.data === 'object' && raw.data !== null && 'raw' in raw.data) {
    return String((raw.data as { raw?: string }).raw ?? '')
  }
  return ''
}

export function mapTx(raw: Record<string, unknown>): NimiqTransaction {
  return {
    hash: String(raw.hash ?? raw.transactionHash ?? ''),
    from: String(raw.from ?? raw.sender ?? ''),
    to: String(raw.to ?? raw.recipient ?? ''),
    value: Number(raw.value ?? 0),
    recipientData: extractRecipientData(raw),
    executionResult: raw.executionResult !== false,
    confirmations: Number(raw.confirmations ?? 0),
    blockNumber:
      raw.blockNumber != null
        ? Number(raw.blockNumber)
        : raw.blockHeight != null
          ? Number(raw.blockHeight)
          : undefined,
  }
}

export async function fetchTransaction(
  rpcUrl: string,
  txHash: string,
  fetchImpl: typeof fetch = fetch,
): Promise<NimiqTransaction | null> {
  const clean = normalizeTxHash(txHash)
  if (!/^[a-f0-9]{64}$/.test(clean)) {
    throw new Error('Transaction hash must be 64 hex characters')
  }

  try {
    const tx = await rpcCall<Record<string, unknown>>(
      rpcUrl,
      'getTransactionByHash',
      [clean],
      fetchImpl,
    )
    return mapTx(tx)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Network / hard RPC failures should not be silent "not found"
    if (msg.startsWith('RPC network error') || msg.startsWith('RPC HTTP')) {
      throw err instanceof Error ? err : new Error(msg)
    }
    if (!isTransactionNotFoundError(msg)) {
      // Unexpected RPC error — still try mempool once, then rethrow if both fail
      try {
        const mem = await rpcCall<Record<string, unknown>>(
          rpcUrl,
          'getTransactionFromMempool',
          [clean],
          fetchImpl,
        )
        return { ...mapTx(mem), confirmations: 0, executionResult: true }
      } catch {
        throw err instanceof Error ? err : new Error(msg)
      }
    }
  }

  try {
    const tx = await rpcCall<Record<string, unknown>>(
      rpcUrl,
      'getTransactionFromMempool',
      [clean],
      fetchImpl,
    )
    return {
      ...mapTx(tx),
      confirmations: 0,
      executionResult: true,
    }
  } catch {
    return null
  }
}

export type VerifyTxResult =
  | {
      status: 'match' | 'mismatch' | 'not-seal'
      tx: NimiqTransaction
      localSha256: string
      chainSha256?: string
      shortId?: string
      format?: string
      rawPreview?: string
    }
  | { status: 'not-found'; localSha256: string; txHash: string }
  | { status: 'error'; localSha256: string; message: string }

export async function verifyFileAgainstTx(options: {
  rpcUrl: string
  txHash: string
  localSha256: string
  fetchImpl?: typeof fetch
}): Promise<VerifyTxResult> {
  const local = options.localSha256.toLowerCase()
  let tx: NimiqTransaction | null
  try {
    tx = await fetchTransaction(options.rpcUrl, options.txHash, options.fetchImpl)
  } catch (err) {
    return {
      status: 'error',
      localSha256: local,
      message: err instanceof Error ? err.message : String(err),
    }
  }
  if (!tx) {
    return { status: 'not-found', localSha256: local, txHash: normalizeTxHash(options.txHash) }
  }

  const parsed = parseAttestationPayload(tx.recipientData)
  if (!parsed) {
    const bytes = decodeRecipientDataBytes(tx.recipientData)
    const preview =
      bytes.length === 0
        ? '(empty recipient data)'
        : bytes.length <= 40
          ? Array.from(bytes)
              .map(b => b.toString(16).padStart(2, '0'))
              .join('')
          : `${Array.from(bytes.slice(0, 20))
              .map(b => b.toString(16).padStart(2, '0'))
              .join('')}…`
    return {
      status: 'not-seal',
      tx,
      localSha256: local,
      rawPreview: preview,
    }
  }

  if (parsed.sha256 === local) {
    return {
      status: 'match',
      tx,
      localSha256: local,
      chainSha256: parsed.sha256,
      shortId: parsed.shortId,
      format: parsed.format,
    }
  }
  return {
    status: 'mismatch',
    tx,
    localSha256: local,
    chainSha256: parsed.sha256,
    shortId: parsed.shortId,
    format: parsed.format,
  }
}
