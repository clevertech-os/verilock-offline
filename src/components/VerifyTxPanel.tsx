import { useState } from 'react'
import { buildNimiqExplorerUrl } from '../lib/attestation'
import { getStoredRpcUrl } from '../lib/config'
import { useDocumentSession } from '../lib/DocumentSessionContext'
import { shortHash } from '../lib/hash'
import { isValidTxHash, type VerifyTxResult, verifyFileAgainstTx } from '../lib/nimiqRpc'
import { SessionFileBar } from './SessionFileBar'

export function VerifyTxPanel() {
  const { session, busy: hashing } = useDocumentSession()
  const [txHash, setTxHash] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<VerifyTxResult | null>(null)

  async function runVerify() {
    if (!session) return
    setBusy(true)
    setResult(null)
    try {
      const out = await verifyFileAgainstTx({
        rpcUrl: getStoredRpcUrl(),
        txHash: txHash.trim(),
        localSha256: session.sha256,
      })
      setResult(out)
    } catch (err) {
      setResult({
        status: 'error',
        localSha256: session.sha256,
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setBusy(false)
    }
  }

  const canVerify = !!session && isValidTxHash(txHash) && !busy && !hashing

  return (
    <section className="panel" aria-labelledby="verify-tx-title">
      <h2 id="verify-tx-title">Verify by transaction</h2>
      <p className="panel-lead">
        Compare your local fingerprint to the seal payload in a Nimiq lock transaction. Uses a
        public Nimiq RPC only — not verilock.online. The file never leaves this device.
      </p>

      <SessionFileBar />

      <label className="field-label" htmlFor="tx-hash">
        Nimiq transaction hash
      </label>
      <input
        id="tx-hash"
        className="field-input"
        type="text"
        spellCheck={false}
        autoComplete="off"
        placeholder="64-character hex hash"
        value={txHash}
        disabled={busy}
        onChange={e => setTxHash(e.target.value)}
      />

      <div className="btn-row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canVerify}
          onClick={runVerify}
        >
          {busy ? 'Verifying…' : 'Verify against chain'}
        </button>
      </div>

      {result && <VerifyTxResultView result={result} />}
    </section>
  )
}

function VerifyTxResultView({ result }: { result: VerifyTxResult }) {
  if (result.status === 'error') {
    return (
      <div className="result-card result-card--error" role="alert">
        <p className="result-eyebrow">Error</p>
        <p>{result.message}</p>
      </div>
    )
  }
  if (result.status === 'not-found') {
    return (
      <div className="result-card result-card--warn" role="status">
        <p className="result-eyebrow">Transaction not found</p>
        <p>
          No transaction with that hash was returned by the public RPC. Check the hash, wait for
          propagation, or try another RPC URL in Trust.
        </p>
        <p className="muted">Local hash {shortHash(result.localSha256)}</p>
      </div>
    )
  }

  const explorer = buildNimiqExplorerUrl(result.tx.hash)
  const statusClass =
    result.status === 'match'
      ? 'result-card--ok'
      : result.status === 'mismatch'
        ? 'result-card--error'
        : 'result-card--warn'

  const title =
    result.status === 'match'
      ? 'Match — same bytes as the on-chain seal'
      : result.status === 'mismatch'
        ? 'Mismatch — file does not match the sealed hash'
        : 'Not a VeriLock seal payload'

  return (
    <div className={`result-card ${statusClass}`} role="status">
      <p className="result-eyebrow">{result.status.toUpperCase()}</p>
      <h3 className="result-title">{title}</h3>
      <dl className="meta-dl">
        <div>
          <dt>Local SHA-256</dt>
          <dd>
            <code>{result.localSha256}</code>
          </dd>
        </div>
        {result.chainSha256 && (
          <div>
            <dt>Chain SHA-256</dt>
            <dd>
              <code>{result.chainSha256}</code>
            </dd>
          </div>
        )}
        {result.shortId && (
          <div>
            <dt>Doc short id</dt>
            <dd>
              <code>{result.shortId}</code>
            </dd>
          </div>
        )}
        {result.format && (
          <div>
            <dt>Payload format</dt>
            <dd>{result.format}</dd>
          </div>
        )}
        {result.rawPreview && (
          <div>
            <dt>Recipient data (preview)</dt>
            <dd>
              <code>{result.rawPreview}</code>
            </dd>
          </div>
        )}
        <div>
          <dt>Sender</dt>
          <dd>
            <code>{result.tx.from}</code>
          </dd>
        </div>
        <div>
          <dt>Confirmations</dt>
          <dd>
            {result.tx.confirmations}
            {result.tx.blockNumber != null ? ` · block ${result.tx.blockNumber}` : ''}
          </dd>
        </div>
        <div>
          <dt>Execution</dt>
          <dd>{result.tx.executionResult ? 'success' : 'failed'}</dd>
        </div>
      </dl>
      <p>
        <a href={explorer} target="_blank" rel="noopener noreferrer">
          View on nimiq.watch
        </a>
      </p>
    </div>
  )
}
