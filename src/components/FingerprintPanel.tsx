import { useState } from 'react'
import { APP_VERSION, surfaceLabel } from '../lib/config'
import { useDocumentSession } from '../lib/DocumentSessionContext'
import {
  buildFingerprintReceipt,
  downloadJson,
  formatBytes,
  shortHash,
} from '../lib/hash'
import { SessionFileBar } from './SessionFileBar'

export function FingerprintPanel() {
  const { session, busy } = useDocumentSession()
  const [copied, setCopied] = useState(false)

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

  return (
    <section className="panel" aria-labelledby="fingerprint-title">
      <h2 id="fingerprint-title">Local fingerprint</h2>
      <p className="panel-lead">
        Compute the SHA-256 of any file on this device. No network is required for this step. The
        same file stays selected when you switch to Verify or Certificate.
      </p>

      <SessionFileBar label="Choose a file on this device" />

      {session && !busy && (
        <div className="result-card result-card--neutral">
          <p className="result-eyebrow">SHA-256</p>
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
          </div>
        </div>
      )}
    </section>
  )
}
