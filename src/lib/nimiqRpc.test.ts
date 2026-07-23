import { describe, expect, it, vi } from 'vitest'
import { bytesToHex, buildAttestationPayloadBytes } from './attestation'
import {
  findSealMatchesByHash,
  isTransactionNotFoundError,
  isValidTxHash,
  mapTx,
  normalizeNimiqAddress,
  normalizeTxHash,
  verifyFileAgainstTx,
} from './nimiqRpc'

const SHA = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const DOC = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const TX = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

function mockFetchSequence(
  responses: Array<{ ok?: boolean; body: unknown } | { networkError: string }>,
): typeof fetch {
  let i = 0
  return vi.fn(async () => {
    const next = responses[i++]
    if (!next) throw new Error('unexpected extra fetch')
    if ('networkError' in next) throw new Error(next.networkError)
    return {
      ok: next.ok !== false,
      status: next.ok === false ? 500 : 200,
      statusText: next.ok === false ? 'Error' : 'OK',
      json: async () => next.body,
    } as Response
  }) as unknown as typeof fetch
}

function sealTxBody(recipientData: string) {
  return {
    result: {
      data: {
        hash: TX,
        from: 'NQ01',
        to: 'NQ02',
        value: 1,
        recipientData,
        executionResult: true,
        confirmations: 5,
        blockNumber: 100,
      },
    },
  }
}

describe('nimiqRpc helpers', () => {
  it('normalizes tx hashes', () => {
    expect(normalizeTxHash('0x' + 'Ab'.repeat(32))).toBe('ab'.repeat(32))
    expect(isValidTxHash(TX)).toBe(true)
    expect(isValidTxHash('short')).toBe(false)
  })

  it('detects not-found errors', () => {
    expect(isTransactionNotFoundError('Transaction not found')).toBe(true)
    expect(isTransactionNotFoundError('RPC network error: failed')).toBe(false)
  })

  it('maps recipientData from nested data.raw', () => {
    const tx = mapTx({
      hash: TX,
      from: 'NQ01',
      to: 'NQ02',
      value: 1,
      data: { raw: '01aabb' },
      executionResult: true,
      confirmations: 2,
    })
    expect(tx.recipientData).toBe('01aabb')
    expect(tx.confirmations).toBe(2)
  })
})

describe('verifyFileAgainstTx', () => {
  it('returns match when payload hash equals local', async () => {
    const payloadHex = bytesToHex(buildAttestationPayloadBytes(DOC, SHA))
    const fetchImpl = mockFetchSequence([{ body: sealTxBody(payloadHex) }])

    const result = await verifyFileAgainstTx({
      rpcUrl: 'https://rpc.example',
      txHash: TX,
      localSha256: SHA,
      fetchImpl,
    })
    expect(result.status).toBe('match')
    if (result.status === 'match') {
      expect(result.chainSha256).toBe(SHA)
      expect(result.shortId).toBe('a1b2c3d4')
    }
  })

  it('returns mismatch when hashes differ', async () => {
    const payloadHex = bytesToHex(buildAttestationPayloadBytes(DOC, SHA))
    const fetchImpl = mockFetchSequence([{ body: sealTxBody(payloadHex) }])
    const result = await verifyFileAgainstTx({
      rpcUrl: 'https://rpc.example',
      txHash: TX,
      localSha256: 'ff'.repeat(32),
      fetchImpl,
    })
    expect(result.status).toBe('mismatch')
  })

  it('returns not-found when RPC has no tx', async () => {
    const fetchImpl = mockFetchSequence([
      { body: { error: { message: 'Transaction not found', code: -1 } } },
      { body: { error: { message: 'Transaction not found', code: -1 } } },
    ])
    const result = await verifyFileAgainstTx({
      rpcUrl: 'https://rpc.example',
      txHash: TX,
      localSha256: SHA,
      fetchImpl,
    })
    expect(result.status).toBe('not-found')
  })

  it('returns error on network failure', async () => {
    const fetchImpl = mockFetchSequence([{ networkError: 'offline' }])
    const result = await verifyFileAgainstTx({
      rpcUrl: 'https://rpc.example',
      txHash: TX,
      localSha256: SHA,
      fetchImpl,
    })
    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.message).toMatch(/network/i)
    }
  })

  it('returns not-seal for empty recipient data', async () => {
    const fetchImpl = mockFetchSequence([{ body: sealTxBody('') }])
    const result = await verifyFileAgainstTx({
      rpcUrl: 'https://rpc.example',
      txHash: TX,
      localSha256: SHA,
      fetchImpl,
    })
    expect(result.status).toBe('not-seal')
  })
})

const SINK = 'NQ815N9JRGBJMLJQNBKEMQ1RD27TXS8PCVKA'
const OTHER_SHA = 'ff'.repeat(32)

function addressTxBody(txs: Array<Record<string, unknown>>) {
  return { result: { data: txs } }
}

function makeSealTx(
  hash: string,
  docId: string,
  sha: string,
  extra: Partial<Record<string, unknown>> = {},
) {
  return {
    hash,
    from: 'NQ01 TEST',
    to: SINK,
    value: 1,
    recipientData: bytesToHex(buildAttestationPayloadBytes(docId, sha)),
    executionResult: true,
    confirmations: 12,
    blockNumber: 100,
    ...extra,
  }
}

describe('normalizeNimiqAddress', () => {
  it('strips spaces and uppercases', () => {
    expect(normalizeNimiqAddress('nq81 5n9j rgbj mljq nbke mq1r d27t xs8p cvka')).toBe(SINK)
  })
})

describe('findSealMatchesByHash', () => {
  it('finds seal payloads whose hash matches local fingerprint', async () => {
    const matchHash = 'bb'.repeat(32)
    const otherHash = 'cc'.repeat(32)
    const fetchImpl = mockFetchSequence([
      {
        body: addressTxBody([
          makeSealTx(matchHash, DOC, SHA),
          makeSealTx(otherHash, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', OTHER_SHA),
          {
            hash: 'dd'.repeat(32),
            from: 'NQ01',
            to: SINK,
            value: 1,
            recipientData: '',
            executionResult: true,
            confirmations: 1,
          },
        ]),
      },
    ])

    const result = await findSealMatchesByHash({
      rpcUrl: 'https://rpc.example',
      localSha256: SHA,
      sinkAddress: SINK,
      fetchImpl,
    })
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.matches).toHaveLength(1)
      expect(result.matches[0]!.tx.hash).toBe(matchHash)
      expect(result.matches[0]!.shortId).toBe('a1b2c3d4')
      expect(result.scannedTxs).toBe(3)
      expect(result.sealTxs).toBe(2)
      expect(result.truncated).toBe(false)
    }
  })

  it('returns empty matches when no seal embeds the hash', async () => {
    const fetchImpl = mockFetchSequence([
      {
        body: addressTxBody([
          makeSealTx('aa'.repeat(32), DOC, OTHER_SHA),
        ]),
      },
    ])
    const result = await findSealMatchesByHash({
      rpcUrl: 'https://rpc.example',
      localSha256: SHA,
      sinkAddress: SINK,
      fetchImpl,
    })
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.matches).toHaveLength(0)
      expect(result.sealTxs).toBe(1)
    }
  })

  it('pages until history ends', async () => {
    const page1 = Array.from({ length: 2 }, (_, i) =>
      makeSealTx(`${i.toString(16).padStart(2, '0')}`.repeat(32), DOC, OTHER_SHA),
    )
    const page2 = [makeSealTx(TX, DOC, SHA)]
    const fetchImpl = mockFetchSequence([
      { body: addressTxBody(page1) },
      { body: addressTxBody(page2) },
    ])
    const result = await findSealMatchesByHash({
      rpcUrl: 'https://rpc.example',
      localSha256: SHA,
      sinkAddress: SINK,
      pageSize: 2,
      maxTxs: 50,
      fetchImpl,
    })
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.matches).toHaveLength(1)
      expect(result.scannedTxs).toBe(3)
      expect(result.truncated).toBe(false)
    }
  })

  it('marks truncated when scan budget is exhausted on a full page', async () => {
    const page = Array.from({ length: 2 }, (_, i) =>
      makeSealTx(`${(i + 1).toString(16).padStart(2, '0')}`.repeat(32), DOC, OTHER_SHA),
    )
    const fetchImpl = mockFetchSequence([{ body: addressTxBody(page) }])
    const result = await findSealMatchesByHash({
      rpcUrl: 'https://rpc.example',
      localSha256: SHA,
      sinkAddress: SINK,
      pageSize: 2,
      maxTxs: 2,
      fetchImpl,
    })
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.truncated).toBe(true)
      expect(result.scannedTxs).toBe(2)
    }
  })

  it('returns error on network failure', async () => {
    const fetchImpl = mockFetchSequence([{ networkError: 'offline' }])
    const result = await findSealMatchesByHash({
      rpcUrl: 'https://rpc.example',
      localSha256: SHA,
      sinkAddress: SINK,
      fetchImpl,
    })
    expect(result.status).toBe('error')
  })
})
