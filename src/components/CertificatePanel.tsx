import { useState } from 'react'
import { buildNimiqExplorerUrl } from '../lib/attestation'
import { getStoredRpcUrl } from '../lib/config'
import {
  type CertHashMatch,
  type VeriLockCertificateV1,
  matchLocalToCertificate,
  parseCertificateJson,
} from '../lib/certificate'
import { useDocumentSession } from '../lib/DocumentSessionContext'
import { shortHash } from '../lib/hash'
import { type VerifyTxResult, verifyFileAgainstTx } from '../lib/nimiqRpc'
import { SessionFileBar } from './SessionFileBar'

export function CertificatePanel() {
  const { session, busy: hashing } = useDocumentSession()
  const [certText, setCertText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cert, setCert] = useState<VeriLockCertificateV1 | null>(null)
  const [match, setMatch] = useState<CertHashMatch | null>(null)
  const [chain, setChain] = useState<VerifyTxResult | null>(null)
  const [recheckChain, setRecheckChain] = useState(true)

  async function onCertFile(f: File | null) {
    if (!f) return
    const text = await f.text()
    setCertText(text)
  }

  async function runVerify() {
    setError(null)
    setCert(null)
    setMatch(null)
    setChain(null)
    if (!session) {
      setError('Choose the document file first.')
      return
    }
    const parsed = parseCertificateJson(certText)
    if (parsed.ok === false) {
      setError(parsed.error)
      return
    }
    setBusy(true)
    try {
      const m = matchLocalToCertificate(session.sha256, parsed.cert)
      setCert(parsed.cert)
      setMatch(m)

      const txHash = parsed.cert.attestation?.txHash
      if (recheckChain && txHash) {
        const out = await verifyFileAgainstTx({
          rpcUrl: getStoredRpcUrl(),
          txHash,
          localSha256: session.sha256,
        })
        setChain(out)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel" aria-labelledby="cert-title">
      <h2 id="cert-title">Verify by certificate</h2>
      <p className="panel-lead">
        Compare your local file to a VeriLock certificate JSON (exported from verilock.online). Hash
        comparison works fully offline. Optionally re-check the embedded transaction on Nimiq.
      </p>

      <SessionFileBar />

      <label className="field-label" htmlFor="cert-json">
        Certificate JSON
      </label>
      <textarea
        id="cert-json"
        className="field-textarea"
        rows={8}
        spellCheck={false}
        placeholder="Paste certificate JSON, or load a .json file below"
        value={certText}
        disabled={busy}
        onChange={e => setCertText(e.target.value)}
      />
      <div className="file-picker-row">
        <input
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={e => {
            const f = e.target.files?.[0] ?? null
            void onCertFile(f)
          }}
        />
      </div>

      <label className="check-row">
        <input
          type="checkbox"
          checked={recheckChain}
          disabled={busy}
          onChange={e => setRecheckChain(e.target.checked)}
        />
        <span>
          Also re-check attestation tx on public Nimiq RPC (if certificate includes tx hash)
        </span>
      </label>

      <div className="btn-row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || hashing || !session || !certText.trim()}
          onClick={runVerify}
        >
          {busy ? 'Verifying…' : 'Verify certificate'}
        </button>
      </div>

      {error && (
        <p className="status status-error" role="alert">
          {error}
        </p>
      )}

      {match && cert && (
        <div
          className={`result-card ${match.kind === 'match' ? 'result-card--ok' : 'result-card--error'}`}
          role="status"
        >
          <p className="result-eyebrow">Certificate hash</p>
          <h3 className="result-title">
            {match.kind === 'match'
              ? `Match on ${match.field}`
              : 'Mismatch — file does not match certificate hashes'}
          </h3>
          {cert.title && <p>Title: {cert.title}</p>}
          {cert.status && <p className="muted">Status: {cert.status}</p>}
          <dl className="meta-dl">
            <div>
              <dt>Local SHA-256</dt>
              <dd>
                <code>{match.kind === 'match' ? match.local : match.local}</code>
              </dd>
            </div>
            {match.kind === 'match' ? (
              <div>
                <dt>Expected</dt>
                <dd>
                  <code>{match.expected}</code>
                </dd>
              </div>
            ) : (
              <>
                {match.final && (
                  <div>
                    <dt>finalSha256</dt>
                    <dd>
                      <code>{match.final}</code>
                    </dd>
                  </div>
                )}
                {match.original && (
                  <div>
                    <dt>originalSha256</dt>
                    <dd>
                      <code>{match.original}</code>
                    </dd>
                  </div>
                )}
              </>
            )}
          </dl>
        </div>
      )}

      {chain && (
        <div className="result-card result-card--neutral">
          <p className="result-eyebrow">On-chain re-check</p>
          {chain.status === 'match' && (
            <p className="status status-ok">Chain confirms the same hash.</p>
          )}
          {chain.status === 'mismatch' && (
            <p className="status status-error">
              Chain hash differs from local (
              {chain.chainSha256 ? shortHash(chain.chainSha256) : '—'}).
            </p>
          )}
          {chain.status === 'not-found' && (
            <p className="status status-warn">Transaction not found on RPC yet.</p>
          )}
          {chain.status === 'not-seal' && (
            <p className="status status-warn">Tx has no VeriLock seal payload.</p>
          )}
          {chain.status === 'error' && <p className="status status-error">{chain.message}</p>}
          {'tx' in chain && chain.tx && (
            <p>
              <a
                href={buildNimiqExplorerUrl(chain.tx.hash)}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on nimiq.watch
              </a>
            </p>
          )}
        </div>
      )}
    </section>
  )
}
