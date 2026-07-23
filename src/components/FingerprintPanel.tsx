import { useEffect, useRef, useState } from 'react'
import { buildNimiqExplorerUrl } from '../lib/attestation'
import {
  APP_VERSION,
  DEFAULT_ATTESTATION_SINK,
  getStoredRpcUrl,
  surfaceLabel,
} from '../lib/config'
import { useDocumentSession } from '../lib/DocumentSessionContext'
import {
  buildFingerprintReceipt,
  downloadJson,
  formatBytes,
  shortHash,
} from '../lib/hash'
import {
  type FindSealMatchesResult,
  findSealMatchesByHash,
} from '../lib/nimiqRpc'
import { SessionFileBar } from './SessionFileBar'

export function FingerprintPanel() {
  const { session, busy: hashing } = useDocumentSession()
  const [copied, setCopied] = useState(false)
  const [scanBusy, setScanBusy] = useState(false)
  const [scanResult, setScanResult] = useState<FindSealMatchesResult | null>(null)
  const scanRunId = useRef(0)
  const lastScannedHash = useRef<string | null>(null)

  async function copyHash() {
    if (!session) return
    await navigator.clipboard.writeText(session.sha256)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function downloadReceipt() {
    if (!session) return
    const receipt = buildFingerprintReceipt({
      filename: session.file.name,
      size: session.size,
      sha256: session.sha256,
      appVersion: APP_VERSION,
      surface: surfaceLabel(),
    })
    const safe = session.file.name.replace(/[^\w.-]+/g, '_').slice(0, 40)
    downloadJson(`verilock-fingerprint-${safe}.json`, receipt)
  }

  async function runChainScan(sha256: string, force = false) {
    if (!force && lastScannedHash.current === sha256 && scanResult) return
    const runId = ++scanRunId.current
    setScanBusy(true)
    setScanResult(null)
    try {
      const out = await findSealMatchesByHash({
        rpcUrl: getStoredRpcUrl(),
        localSha256: sha256,
        sinkAddress: DEFAULT_ATTESTATION_SINK,
      })
      if (runId !== scanRunId.current) return
      lastScannedHash.current = sha256
      setScanResult(out)
    } catch (err) {
      if (runId !== scanRunId.current) return
      setScanResult({
        status: 'error',
        localSha256: sha256,
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      if (runId === scanRunId.current) setScanBusy(false)
    }
  }

  // Drop → hash → automatic Nimiq match search (public RPC only).
  useEffect(() => {
    if (!session || hashing) {
      if (!session) {
        scanRunId.current += 1
        lastScannedHash.current = null
        setScanResult(null)
        setScanBusy(false)
      }
      return
    }
    void runChainScan(session.sha256)
    // Only re-scan when the session fingerprint changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [session?.sha256, hashing])

  return (
    <section className="panel" aria-labelledby="fingerprint-title">
      <h2 id="fingerprint-title">Drop, hash &amp; match</h2>
      <p className="panel-lead">
        Drop any file to compute its SHA-256 on this device, then scan public Nimiq seal
        transactions for that fingerprint. The file never leaves this app — only JSON-RPC
        reads of the VeriLock sink address.
      </p>

      <SessionFileBar label="Drop a file on this device" />

      {session && !hashing && (
        <div className="result-card result-card--neutral">
          <p className="result-eyebrow">Local SHA-256</p>
          <code className="hash-full" title={session.sha256}>
            {session.sha256}
          </code>
          <p className="muted">
            Short form {shortHash(session.sha256)} · {formatBytes(session.size)} ·{' '}
            {session.file.name}
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={copyHash}>
              {copied ? 'Copied' : 'Copy hash'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={downloadReceipt}>
              Download fingerprint receipt
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={scanBusy}
              onClick={() => void runChainScan(session.sha256, true)}
            >
              {scanBusy ? 'Scanning Nimiq…' : 'Re-scan Nimiq'}
            </button>
          </div>
        </div>
      )}

      {session && !hashing && scanBusy && (
        <p className="status status-pending" role="status">
          Checking Nimiq seal transactions for matches…
        </p>
      )}

      {scanResult && <ChainMatchResult result={scanResult} />}
    </section>
  )
}

function ChainMatchResult({ result }: { result: FindSealMatchesResult }) {
  if (result.status === 'error') {
    return (
      <div className="result-card result-card--error" role="alert">
        <p className="result-eyebrow">Nimiq scan failed</p>
        <p>{result.message}</p>
        <p className="muted">
          Public RPC may be unreachable. Try another endpoint under Trust, then re-scan.
        </p>
      </div>
    )
  }

  if (result.matches.length === 0) {
    return (
      <div className="result-card result-card--warn" role="status">
        <p className="result-eyebrow">No on-chain match</p>
        <h3 className="result-title">No VeriLock seal embeds this fingerprint</h3>
        <p>
          Scanned {result.scannedTxs} transaction{result.scannedTxs === 1 ? '' : 's'} to the seal
          sink ({result.sealTxs} VeriLock seal payload
          {result.sealTxs === 1 ? '' : 's'}). None embed {shortHash(result.localSha256)}.
        </p>
        {result.truncated && (
          <p className="muted">
            Scan stopped at the client budget. If you have a lock transaction hash, use{' '}
            <strong>Verify (tx)</strong>.
          </p>
        )}
        <p className="muted">
          Tip: seals use the <em>final</em> document hash after signing. An unsigned original may
          not match. You can still paste a known tx hash under Verify (tx), or load a certificate.
        </p>
      </div>
    )
  }

  return (
    <div className="result-card result-card--ok" role="status">
      <p className="result-eyebrow">Match on Nimiq</p>
      <h3 className="result-title">
        {result.matches.length === 1
          ? 'Your file matches an on-chain seal'
          : `Your file matches ${result.matches.length} on-chain seals`}
      </h3>
      <p className="muted">
        Compared local fingerprint to seal payloads on sink{' '}
        <code title={result.sinkAddress}>
          {result.sinkAddress.slice(0, 6)}…{result.sinkAddress.slice(-4)}
        </code>{' '}
        · scanned {result.scannedTxs} tx · {result.sealTxs} seal
        {result.sealTxs === 1 ? '' : 's'}
        {result.truncated ? ' · scan budget hit' : ''}
      </p>
      <ul className="match-list">
        {result.matches.map(m => {
          const explorer = buildNimiqExplorerUrl(m.tx.hash)
          return (
            <li key={m.tx.hash} className="match-item">
              <strong>Seal match</strong>
              <span className="muted"> · doc short id {m.shortId}</span>
              <div className="muted">
                Format {m.format} · {m.tx.confirmations} confirmation
                {m.tx.confirmations === 1 ? '' : 's'}
                {m.tx.blockNumber != null ? ` · block ${m.tx.blockNumber}` : ''}
              </div>
              <div className="muted">
                Sender <code>{m.tx.from}</code>
              </div>
              <div className="muted">
                Tx <code title={m.tx.hash}>{shortHash(m.tx.hash)}</code>
              </div>
              <a href={explorer} target="_blank" rel="noopener noreferrer">
                View on nimiq.watch
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
