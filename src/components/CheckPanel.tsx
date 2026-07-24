import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  Globe,
  Hash,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import { buildNimiqExplorerUrl } from '../lib/attestation'
import {
  APP_VERSION,
  DEFAULT_ATTESTATION_SINK,
  DEFAULT_ONLINE_API_BASE,
  getStoredRpcUrl,
  surfaceLabel,
} from '../lib/config'
import {
  type CertHashMatch,
  type VeriLockCertificateV1,
  matchLocalToCertificate,
  parseCertificateJson,
} from '../lib/certificate'
import { useDocumentSession } from '../lib/DocumentSessionContext'
import { downloadJson, shortHash } from '../lib/hash'
import {
  type FindSealMatchesResult,
  isValidTxHash,
  type VerifyTxResult,
  findSealMatchesByHash,
  verifyFileAgainstTx,
} from '../lib/nimiqRpc'
import {
  type OnlineMatch,
  lookupHashOnline,
  onlineVerifyUrl,
} from '../lib/onlineLookup'
import { buildVerificationProof } from '../lib/verificationProof'
import { useWallet } from '../lib/WalletContext'
import { DocumentViewer } from './DocumentViewer'
import { SessionFileBar } from './SessionFileBar'

type AdvancedId = 'online' | 'tx' | 'cert' | null

const iconSm = { size: 16, strokeWidth: 2.25 } as const
const iconTitle = { size: 18, strokeWidth: 2.25 } as const

export function CheckPanel() {
  const { session, busy: hashing } = useDocumentSession()
  const wallet = useWallet()
  const [scanBusy, setScanBusy] = useState(false)
  const [scanResult, setScanResult] = useState<FindSealMatchesResult | null>(null)
  const [advanced, setAdvanced] = useState<AdvancedId>(null)
  const [copied, setCopied] = useState(false)
  const [proofBusy, setProofBusy] = useState(false)
  const scanRunId = useRef(0)
  const lastScannedHash = useRef<string | null>(null)

  async function copyHash() {
    if (!session) return
    await navigator.clipboard.writeText(session.sha256)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  /** Rich proof: fingerprint + chain locks + optional directory meta (never file bytes). */
  async function downloadProof() {
    if (!session) return
    setProofBusy(true)
    try {
      let onlineMatches: OnlineMatch[] | null = null
      try {
        const lookup = await lookupHashOnline(DEFAULT_ONLINE_API_BASE, session.sha256)
        if (lookup.ok) onlineMatches = lookup.matches
      } catch {
        /* directory is optional */
      }

      const proof = buildVerificationProof({
        filename: session.file.name,
        size: session.size,
        sha256: session.sha256,
        appVersion: APP_VERSION,
        surface: surfaceLabel(),
        rpcUrl: getStoredRpcUrl(),
        scanResult,
        onlineMatches,
        onlineApiBase: DEFAULT_ONLINE_API_BASE,
        walletAddress: wallet.session?.address ?? null,
      })
      const safe = session.file.name.replace(/[^\w.-]+/g, '_').slice(0, 40)
      downloadJson(`verilock-proof-${safe}.json`, proof)
    } finally {
      setProofBusy(false)
    }
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

  useEffect(() => {
    if (!session || hashing) {
      if (!session) {
        scanRunId.current += 1
        lastScannedHash.current = null
        setScanResult(null)
        setScanBusy(false)
        setAdvanced(null)
      }
      return
    }
    void runChainScan(session.sha256)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-scan only when fingerprint changes
  }, [session?.sha256, hashing])

  return (
    <section className="panel panel--check">
      <SessionFileBar />

      {session && !hashing && scanBusy && (
        <p className="status status-pending" role="status">
          <Loader2 className="lucide-spin" {...iconSm} aria-hidden />
          Looking for an on-chain lock…
        </p>
      )}

      {scanResult && (
        <ChainMatchResult
          result={scanResult}
          onRecheck={
            session
              ? () => {
                  void runChainScan(session.sha256, true)
                }
              : undefined
          }
          recheckBusy={scanBusy}
          onCopyHash={copyHash}
          copied={copied}
          onSaveProof={() => void downloadProof()}
          proofBusy={proofBusy}
        />
      )}

      {session && !hashing && <DocumentViewer />}

      {session && !hashing && (
        <details className="advanced-details">
          <summary>More options</summary>
          <div className="advanced-toggles" role="group" aria-label="More check options">
            {(
              [
                ['online', 'Look up online', Globe],
                ['tx', 'Transaction', Hash],
                ['cert', 'Certificate', FileCheck2],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                className={`advanced-toggle${advanced === id ? ' advanced-toggle--on' : ''}`}
                aria-expanded={advanced === id}
                onClick={() => setAdvanced(prev => (prev === id ? null : id))}
              >
                <Icon {...iconSm} aria-hidden />
                {label}
              </button>
            ))}
          </div>
          {advanced === 'online' && <OnlineLookupSection />}
          {advanced === 'tx' && <TxSection />}
          {advanced === 'cert' && <CertSection />}
        </details>
      )}
    </section>
  )
}

function ChainMatchResult({
  result,
  onRecheck,
  recheckBusy,
  onCopyHash,
  copied,
  onSaveProof,
  proofBusy,
}: {
  result: FindSealMatchesResult
  onRecheck?: () => void
  recheckBusy?: boolean
  onCopyHash?: () => void
  copied?: boolean
  onSaveProof?: () => void
  proofBusy?: boolean
}) {
  if (result.status === 'error') {
    return (
      <div className="result-card result-card--error" role="alert">
        <h3 className="result-title">
          <XCircle {...iconTitle} aria-hidden />
          Couldn’t check the chain
        </h3>
        <p>{result.message}</p>
        {onRecheck && (
          <div className="btn-row">
            <button type="button" className="btn btn-secondary" onClick={onRecheck}>
              <RefreshCw {...iconSm} aria-hidden />
              Try again
            </button>
          </div>
        )}
      </div>
    )
  }

  if (result.matches.length === 0) {
    if (result.truncated) {
      return (
        <div className="result-card result-card--warn" role="status">
          <h3 className="result-title">
            <AlertTriangle {...iconTitle} aria-hidden />
            Search incomplete
          </h3>
          <p>
            No match in the recent lock transactions we scanned. A lock may still exist — try a
            transaction hash under More options if you have one.
          </p>
        </div>
      )
    }
    return (
      <div className="result-card result-card--warn" role="status">
        <h3 className="result-title">
          <ShieldAlert {...iconTitle} aria-hidden />
          No on-chain lock found
        </h3>
        <p className="muted">
          Usually means it was never locked, or this isn’t the locked version of the file.
        </p>
        <div className="btn-row">
          {onCopyHash && (
            <button type="button" className="btn btn-ghost" onClick={onCopyHash}>
              <Copy {...iconSm} aria-hidden />
              {copied ? 'Copied' : 'Copy fingerprint'}
            </button>
          )}
          {onRecheck && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={recheckBusy}
              onClick={onRecheck}
            >
              {recheckBusy ? (
                <Loader2 className="lucide-spin" {...iconSm} aria-hidden />
              ) : (
                <RefreshCw {...iconSm} aria-hidden />
              )}
              Check again
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="result-card result-card--ok result-card--compact" role="status">
      <h3 className="result-title">
        <CheckCircle2 {...iconTitle} aria-hidden />
        {result.matches.length === 1
          ? 'Locked on the blockchain'
          : `Matches ${result.matches.length} on-chain locks`}
      </h3>
      <ul className="match-list match-list--compact">
        {result.matches.map(m => {
          const explorer = buildNimiqExplorerUrl(m.tx.hash)
          return (
            <li key={m.tx.hash} className="match-item match-item--compact">
              <div className="match-line muted">
                {m.tx.confirmations.toLocaleString()} confirmation
                {m.tx.confirmations === 1 ? '' : 's'}
                {m.tx.blockNumber != null ? ` · block ${m.tx.blockNumber}` : ''}
                {' · '}
                <a href={explorer} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={13} strokeWidth={2.25} aria-hidden />
                  Explorer
                </a>
                {' · '}
                <details className="tech-details tech-details--inline">
                  <summary>Details</summary>
                  <span>
                    Tx <code title={m.tx.hash}>{shortHash(m.tx.hash)}</code>
                    {m.shortId ? (
                      <>
                        {' '}
                        · doc <code>{m.shortId}</code>
                      </>
                    ) : null}
                  </span>
                </details>
              </div>
            </li>
          )
        })}
      </ul>
      <div className="btn-row btn-row--tight">
        {onCopyHash && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCopyHash}>
            <Copy {...iconSm} aria-hidden />
            {copied ? 'Copied' : 'Copy fingerprint'}
          </button>
        )}
        {onSaveProof && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={proofBusy}
            onClick={onSaveProof}
            title="Download verification JSON: fingerprint, chain locks, and directory matches — never the file"
          >
            {proofBusy ? (
              <Loader2 className="lucide-spin" {...iconSm} aria-hidden />
            ) : (
              <Download {...iconSm} aria-hidden />
            )}
            {proofBusy ? 'Saving…' : 'Save proof'}
          </button>
        )}
        {onRecheck && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={recheckBusy}
            onClick={onRecheck}
          >
            {recheckBusy ? (
              <Loader2 className="lucide-spin" {...iconSm} aria-hidden />
            ) : (
              <RefreshCw {...iconSm} aria-hidden />
            )}
            Check again
          </button>
        )}
      </div>
    </div>
  )
}

function OnlineLookupSection() {
  const { session, busy: hashing } = useDocumentSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [matches, setMatches] = useState<OnlineMatch[] | null>(null)

  async function runLookup() {
    if (!session) return
    setError(null)
    setMatches(null)
    setBusy(true)
    try {
      const result = await lookupHashOnline(DEFAULT_ONLINE_API_BASE, session.sha256)
      if (result.ok === false) {
        setError(result.error)
        return
      }
      setMatches(result.matches)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="advanced-panel">
      <p className="muted">Sends only the fingerprint to verilock.online — never the file.</p>
      <div className="btn-row">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || hashing || !session}
          onClick={() => void runLookup()}
        >
          {busy ? (
            <Loader2 className="lucide-spin" {...iconSm} aria-hidden />
          ) : (
            <Search {...iconSm} aria-hidden />
          )}
          {busy ? 'Looking up…' : 'Look up on verilock.online'}
        </button>
      </div>
      {error && (
        <p className="status status-error" role="alert">
          {error}
        </p>
      )}
      {matches && (
        <div className="result-card result-card--neutral" role="status">
          {matches.length === 0 ? (
            <p>No matching agreements.</p>
          ) : (
            <ul className="match-list">
              {matches.map(m => (
                <li key={m.id} className="match-item">
                  <strong>{m.title}</strong>
                  <span className="muted"> · {m.status}</span>
                  <div>
                    <a
                      href={onlineVerifyUrl(DEFAULT_ONLINE_API_BASE, m.slug)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink size={13} strokeWidth={2.25} aria-hidden />
                      Open
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function TxSection() {
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
    <div className="advanced-panel">
      <label className="field-label" htmlFor="tx-hash">
        Transaction hash
      </label>
      <input
        id="tx-hash"
        className="field-input"
        type="text"
        spellCheck={false}
        autoComplete="off"
        placeholder="64-character hash"
        value={txHash}
        disabled={busy}
        onChange={e => setTxHash(e.target.value)}
      />
      <div className="btn-row">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!canVerify}
          onClick={() => void runVerify()}
        >
          {busy ? (
            <Loader2 className="lucide-spin" {...iconSm} aria-hidden />
          ) : (
            <Hash {...iconSm} aria-hidden />
          )}
          {busy ? 'Checking…' : 'Check transaction'}
        </button>
      </div>
      {result && <TxResultView result={result} />}
    </div>
  )
}

function TxResultView({ result }: { result: VerifyTxResult }) {
  if (result.status === 'error') {
    return (
      <div className="result-card result-card--error" role="alert">
        <p>{result.message}</p>
      </div>
    )
  }
  if (result.status === 'not-found') {
    return (
      <div className="result-card result-card--warn" role="status">
        <p>Transaction not found yet.</p>
      </div>
    )
  }

  const explorer = buildNimiqExplorerUrl(result.tx.hash)
  const ok = result.status === 'match'
  const title =
    result.status === 'match'
      ? 'Match'
      : result.status === 'mismatch'
        ? 'Mismatch — different file'
        : 'Not a VeriLock lock'
  const TitleIcon =
    result.status === 'match'
      ? CheckCircle2
      : result.status === 'mismatch'
        ? XCircle
        : AlertTriangle

  return (
    <div
      className={`result-card ${ok ? 'result-card--ok' : result.status === 'mismatch' ? 'result-card--error' : 'result-card--warn'}`}
      role="status"
    >
      <h3 className="result-title">
        <TitleIcon {...iconTitle} aria-hidden />
        {title}
      </h3>
      <p>
        <a href={explorer} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={13} strokeWidth={2.25} aria-hidden />
          View on explorer
        </a>
      </p>
      {(result.status === 'mismatch' || result.chainSha256) && (
        <details className="tech-details">
          <summary>Details</summary>
          <dl className="meta-dl">
            <div>
              <dt>Your file</dt>
              <dd>
                <code>{shortHash(result.localSha256)}</code>
              </dd>
            </div>
            {result.chainSha256 && (
              <div>
                <dt>On chain</dt>
                <dd>
                  <code>{shortHash(result.chainSha256)}</code>
                </dd>
              </div>
            )}
          </dl>
        </details>
      )}
    </div>
  )
}

function CertSection() {
  const { session, busy: hashing } = useDocumentSession()
  const [certText, setCertText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cert, setCert] = useState<VeriLockCertificateV1 | null>(null)
  const [match, setMatch] = useState<CertHashMatch | null>(null)
  const [chain, setChain] = useState<VerifyTxResult | null>(null)

  async function onCertFile(f: File | null) {
    if (!f) return
    setCertText(await f.text())
  }

  async function runVerify() {
    setError(null)
    setCert(null)
    setMatch(null)
    setChain(null)
    if (!session) {
      setError('Choose the document first.')
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
      if (txHash) {
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
    <div className="advanced-panel">
      <label className="field-label" htmlFor="cert-json">
        Certificate JSON
      </label>
      <textarea
        id="cert-json"
        className="field-textarea"
        rows={4}
        spellCheck={false}
        placeholder="Paste or choose a .json file"
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
            void onCertFile(e.target.files?.[0] ?? null)
          }}
        />
      </div>
      <div className="btn-row">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || hashing || !session || !certText.trim()}
          onClick={() => void runVerify()}
        >
          {busy ? (
            <Loader2 className="lucide-spin" {...iconSm} aria-hidden />
          ) : (
            <FileCheck2 {...iconSm} aria-hidden />
          )}
          {busy ? 'Checking…' : 'Check certificate'}
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
          <h3 className="result-title">
            {match.kind === 'match' ? (
              <CheckCircle2 {...iconTitle} aria-hidden />
            ) : (
              <XCircle {...iconTitle} aria-hidden />
            )}
            {match.kind === 'match' ? 'Certificate matches' : 'Certificate does not match'}
          </h3>
          {cert.title && <p className="muted">{cert.title}</p>}
        </div>
      )}
      {chain?.status === 'match' && (
        <p className="status status-ok">
          <CheckCircle2 {...iconSm} aria-hidden />
          Blockchain confirms this lock.
        </p>
      )}
      {chain?.status === 'mismatch' && (
        <p className="status status-error">
          <XCircle {...iconSm} aria-hidden />
          Blockchain fingerprint differs.
        </p>
      )}
      {chain?.status === 'not-found' && (
        <p className="status status-warn">
          <AlertTriangle {...iconSm} aria-hidden />
          Lock transaction not found yet.
        </p>
      )}
      {chain?.status === 'error' && (
        <p className="status status-warn">
          <AlertTriangle {...iconSm} aria-hidden />
          Chain re-check failed: {chain.message}
        </p>
      )}
    </div>
  )
}
