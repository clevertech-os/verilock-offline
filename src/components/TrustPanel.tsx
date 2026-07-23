import { useState } from 'react'
import {
  APP_VERSION,
  DEFAULT_NIMIQ_RPC_URL,
  DEFAULT_ONLINE_API_BASE,
  GITHUB_REPO_URL,
  ONLINE_PRODUCT_URL,
  getStoredRpcUrl,
  networkAllowlist,
  setStoredRpcUrl,
  surfaceLabel,
} from '../lib/config'

export function TrustPanel() {
  const [rpc, setRpc] = useState(getStoredRpcUrl())
  const [saved, setSaved] = useState(false)
  const surface = surfaceLabel()
  const allowlist = networkAllowlist(rpc, DEFAULT_ONLINE_API_BASE)

  function saveRpc() {
    setStoredRpcUrl(rpc.trim() || DEFAULT_NIMIQ_RPC_URL)
    setRpc(getStoredRpcUrl())
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <section className="panel" aria-labelledby="trust-title">
      <h2 id="trust-title">Trust &amp; source</h2>
      <p className="panel-lead">
        VeriLock Offline exists so you can re-check seals without the product website, and so
        anyone can read the code that handles your file.
      </p>

      <div className="result-card result-card--neutral">
        <p className="result-eyebrow">Runtime</p>
        <dl className="meta-dl">
          <div>
            <dt>Version</dt>
            <dd>{APP_VERSION}</dd>
          </div>
          <div>
            <dt>Surface</dt>
            <dd>{surface === 'desktop' ? 'Desktop (Tauri)' : 'Web browser'}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>
              <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
                {GITHUB_REPO_URL}
              </a>
            </dd>
          </div>
          <div>
            <dt>Product (create / seal)</dt>
            <dd>
              <a href={ONLINE_PRODUCT_URL} target="_blank" rel="noopener noreferrer">
                {ONLINE_PRODUCT_URL}
              </a>
            </dd>
          </div>
        </dl>
      </div>

      <h3>What never leaves this device</h3>
      <ul className="trust-list">
        <li>Document file bytes (PDF, image, or any other file you select)</li>
        <li>Anything other than a 64-character hex fingerprint when you opt into directory lookup</li>
      </ul>

      <h3>Network allowlist</h3>
      <p className="muted">
        Fingerprint and certificate hash compare need no network. Chain verify uses public Nimiq
        RPC. Directory lookup (opt-in) uses verilock.online. Explorer links open nimiq.watch in your
        browser.
      </p>
      <ul className="trust-list">
        {allowlist.map(h => (
          <li key={h}>
            <code>{h}</code>
          </li>
        ))}
      </ul>

      <h3>Nimiq RPC URL</h3>
      <label className="field-label" htmlFor="rpc-url">
        JSON-RPC endpoint for getTransactionByHash
      </label>
      <input
        id="rpc-url"
        className="field-input"
        type="url"
        value={rpc}
        onChange={e => setRpc(e.target.value)}
        spellCheck={false}
      />
      <div className="btn-row">
        <button type="button" className="btn btn-secondary" onClick={saveRpc}>
          {saved ? 'Saved' : 'Save RPC URL'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setRpc(DEFAULT_NIMIQ_RPC_URL)
            setStoredRpcUrl(DEFAULT_NIMIQ_RPC_URL)
          }}
        >
          Reset default
        </button>
      </div>

      <h3>How to audit “no file upload”</h3>
      <ol className="trust-list">
        <li>
          Open{' '}
          <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
            the repository
          </a>{' '}
          and search <code>src/</code> for <code>fetch(</code>, <code>FormData</code>,{' '}
          <code>XMLHttpRequest</code>.
        </li>
        <li>
          Confirm that <code>hashFile</code> / <code>sha256Hex</code> only use{' '}
          <code>crypto.subtle.digest</code> on local <code>ArrayBuffer</code>s.
        </li>
        <li>
          Confirm <code>onlineLookup.ts</code> POSTs only <code>{'{ sha256 }'}</code> and only when
          you enable directory lookup.
        </li>
        <li>
          In browser DevTools → Network, hash a file: no request should carry the file body.
        </li>
      </ol>

      <h3>Seal payload (protocol)</h3>
      <p>
        Locked agreements anchor a 37-byte Nimiq basic-tx payload:{' '}
        <code>0x01</code> + 4-byte doc short id + 32-byte SHA-256. Legacy UTF-8{' '}
        <code>seal:v1:lock:…</code> is also accepted. See{' '}
        <code>src/lib/attestation.ts</code> and the main VeriLock docs.
      </p>
    </section>
  )
}
