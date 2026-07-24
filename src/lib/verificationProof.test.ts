import { describe, expect, it } from 'vitest'
import { buildVerificationProof } from './verificationProof'

describe('buildVerificationProof', () => {
  it('includes chain matches and explorer links without file bytes', () => {
    const proof = buildVerificationProof({
      filename: 'contract.pdf',
      size: 1024,
      sha256: 'AA'.repeat(32),
      appVersion: '0.1.6',
      surface: 'desktop',
      rpcUrl: 'https://rpc.example',
      scanResult: {
        status: 'ok',
        localSha256: 'aa'.repeat(32),
        scannedTxs: 40,
        sealTxs: 3, // internal scan field name; proof exports as lockTxs
        truncated: false,
        sinkAddress: 'NQ81TEST',
        matches: [
          {
            localSha256: 'aa'.repeat(32),
            chainSha256: 'aa'.repeat(32),
            shortId: 'deadbeef',
            format: 'binary-v1',
            tx: {
              hash: 'bb'.repeat(32),
              from: 'NQ81SENDER',
              to: 'NQ81SINK',
              value: 1,
              recipientData: '',
              executionResult: true,
              confirmations: 12,
              blockNumber: 99,
            },
          },
        ],
      },
      onlineMatches: [
        {
          id: 'doc1',
          slug: 'my-deal',
          title: 'My Deal',
          originalFilename: 'contract.pdf',
          status: 'locked',
          finalSha256: 'aa'.repeat(32),
          createdAt: 1,
          lockedAt: 2,
        },
      ],
      onlineApiBase: 'https://verilock.online',
      walletAddress: 'NQ81WALLET',
    })

    expect(proof.v).toBe(2)
    expect(proof.app).toBe('verilock-offline')
    expect(proof.file.sha256).toBe('aa'.repeat(32))
    expect(proof.chain.matchCount).toBe(1)
    expect(proof.chain.matches[0]?.txHash).toBe('bb'.repeat(32))
    expect(proof.chain.matches[0]?.explorerUrl).toContain('nimiq.watch')
    expect(proof.agreements[0]?.slug).toBe('my-deal')
    expect(proof.agreements[0]?.verifyUrl).toBe('https://verilock.online/v/my-deal')
    expect(proof.walletAddress).toBe('NQ81WALLET')
    expect(JSON.stringify(proof)).not.toMatch(/%PDF|fileBytes|pdfBytes/)
    expect(proof.notes.some(n => /on-chain lock/i.test(n))).toBe(true)
  })

  it('records scan errors without inventing matches', () => {
    const proof = buildVerificationProof({
      filename: 'a.pdf',
      size: 1,
      sha256: 'cc'.repeat(32),
      appVersion: '0.1.6',
      surface: 'web',
      rpcUrl: 'https://rpc.example',
      scanResult: {
        status: 'error',
        localSha256: 'cc'.repeat(32),
        message: 'RPC down',
      },
    })
    expect(proof.chain.status).toBe('error')
    expect(proof.chain.matchCount).toBe(0)
    expect(proof.chain.message).toBe('RPC down')
  })
})
