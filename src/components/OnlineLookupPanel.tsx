import { useState } from 'react'
import { DEFAULT_ONLINE_API_BASE, ONLINE_PRODUCT_URL } from '../lib/config'
import { useDocumentSession } from '../lib/DocumentSessionContext'
import { shortHash } from '../lib/hash'
import {
  type OnlineMatch,
  lookupHashOnline,
  onlineVerifyUrl,
} from '../lib/onlineLookup'
import { SessionFileBar } from './SessionFileBar'

export function OnlineLookupPanel() {
  const { session, busy: hashing } = useDocumentSession()
  const [manualHash, setManualHash] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentHash, setSentHash] = useState<string | null>(null)
  const [matches, setMatches] = useState<OnlineMatch[] | null>(null)

  async function runLookup() {
    setError(null)
    setMatches(null)
    setSentHash(null)
    if (!consent) {
      setError('Confirm that you want to send only the fingerprint to verilock.online.')
      return
    }
    setBusy(true)
    try {
      let sha256 = manualHash.trim().toLowerCase()
      if (session) {
        sha256 = session.sha256
      }
      if (!/^[a-f0-9]{64}$/.test(sha256)) {
        setError('Provide a file or a 64-character hex SHA-256.')
        return
      }
      setSentHash(sha256)
      const result = await lookupHashOnline(DEFAULT_ONLINE_API_BASE, sha256)
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

  const hasHash = !!session || /^[a-f0-9]{64}$/i.test(manualHash.trim())

  return (
    <section className="panel" aria-labelledby="online-title">
      <h2 id="online-title">Directory lookup (optional)</h2>
      <p className="panel-lead">
        Optionally ask <a href={ONLINE_PRODUCT_URL}>{ONLINE_PRODUCT_URL}</a> whether it knows this
        fingerprint. This sends <strong>only the SHA-256</strong> — never the file. Default
        verification does not need this step.
      </p>

      <div className="callout callout-warn">
        <strong>Not pure offline.</strong> This mode contacts verilock.online. Use Verify by
        transaction or Certificate if you want zero contact with the product API.
      </div>

      <SessionFileBar label="Document file (hashed locally first)" />

      <label className="field-label" htmlFor="manual-hash">
        Or paste SHA-256 (if no file selected)
      </label>
      <input
        id="manual-hash"
        className="field-input"
        type="text"
        spellCheck={false}
        placeholder="64-character hex"
        value={manualHash}
        disabled={busy || !!session}
        onChange={e => setManualHash(e.target.value)}
      />

      <label className="check-row">
        <input
          type="checkbox"
          checked={consent}
          disabled={busy}
          onChange={e => setConsent(e.target.checked)}
        />
        <span>
          I understand only the fingerprint is sent to verilock.online, not my file
        </span>
      </label>

      <div className="btn-row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || hashing || !consent || !hasHash}
          onClick={runLookup}
        >
          {busy ? 'Looking up…' : 'Look up fingerprint'}
        </button>
      </div>

      {error && (
        <p className="status status-error" role="alert">
          {error}
        </p>
      )}

      {sentHash && (
        <p className="muted">
          Sent fingerprint {shortHash(sentHash)} to {DEFAULT_ONLINE_API_BASE}/api/verify/hash
        </p>
      )}

      {matches && (
        <div className="result-card result-card--neutral" role="status">
          <p className="result-eyebrow">Directory results</p>
          {matches.length === 0 ? (
            <p>No agreements found for this fingerprint on verilock.online.</p>
          ) : (
            <ul className="match-list">
              {matches.map(m => (
                <li key={m.id} className="match-item">
                  <strong>{m.title}</strong>
                  <span className="muted"> · {m.status}</span>
                  {m.originalFilename && <div className="muted">{m.originalFilename}</div>}
                  {m.lockedAt && (
                    <div className="muted">Locked {new Date(m.lockedAt).toLocaleString()}</div>
                  )}
                  <a
                    href={onlineVerifyUrl(DEFAULT_ONLINE_API_BASE, m.slug)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open on verilock.online
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
