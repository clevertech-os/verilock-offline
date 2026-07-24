import { useState } from 'react'
import {
  Check,
  Code2,
  Globe,
  Link2,
  Monitor,
  Network,
  RotateCcw,
  Save,
  Settings,
  Shield,
} from 'lucide-react'
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

const iconSm = { size: 16, strokeWidth: 2.25 } as const

export function SettingsPanel() {
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
    <section className="panel" aria-labelledby="settings-title">
      <h2 id="settings-title">
        <Settings size={20} strokeWidth={2.25} aria-hidden />
        Settings
      </h2>
      <p className="panel-lead">
        About this app and optional network settings. You only need these if something isn’t
        working.
      </p>

      <div className="result-card result-card--neutral">
        <dl className="meta-dl">
          <div>
            <dt>Version</dt>
            <dd>v{APP_VERSION}</dd>
          </div>
          <div>
            <dt>Running as</dt>
            <dd>
              <span className="meta-with-icon">
                {surface === 'desktop' ? (
                  <Monitor size={14} strokeWidth={2.25} aria-hidden />
                ) : (
                  <Globe size={14} strokeWidth={2.25} aria-hidden />
                )}
                {surface === 'desktop' ? 'Desktop app' : 'Web browser'}
              </span>
            </dd>
          </div>
          <div>
            <dt>Source code</dt>
            <dd>
              <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
                <Code2 size={14} strokeWidth={2.25} aria-hidden />
                GitHub
              </a>
            </dd>
          </div>
          <div>
            <dt>Create &amp; lock documents</dt>
            <dd>
              <a href={ONLINE_PRODUCT_URL} target="_blank" rel="noopener noreferrer">
                <Link2 size={14} strokeWidth={2.25} aria-hidden />
                verilock.online
              </a>
            </dd>
          </div>
        </dl>
      </div>

      <h3>
        <Shield size={16} strokeWidth={2.25} aria-hidden />
        Privacy
      </h3>
      <ul className="trust-list">
        <li>Your document file never leaves this device.</li>
        <li>
          Checking for on-chain locks only reads public blockchain data — not your file.
        </li>
        <li>
          Signatures are opt-in: “Load from verilock.online” contacts the product with the
          fingerprint only — never the file. Until then, checks stay local / chain-only.
        </li>
        <li>
          Private signature ink needs a Nimiq wallet login (same Hub flow as verilock.online). Only
          the creator and signing parties can unlock ink.
        </li>
      </ul>

      <h3>
        <Network size={16} strokeWidth={2.25} aria-hidden />
        Network (advanced)
      </h3>
      <p className="muted">
        Lock checks use a public Nimiq RPC. Change this only if the default is unreachable.
      </p>
      <label className="field-label" htmlFor="rpc-url">
        RPC endpoint
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
          {saved ? <Check {...iconSm} aria-hidden /> : <Save {...iconSm} aria-hidden />}
          {saved ? 'Saved' : 'Save'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setRpc(DEFAULT_NIMIQ_RPC_URL)
            setStoredRpcUrl(DEFAULT_NIMIQ_RPC_URL)
          }}
        >
          <RotateCcw {...iconSm} aria-hidden />
          Reset default
        </button>
      </div>

      <details className="settings-details">
        <summary>Hosts this app may contact</summary>
        <ul className="trust-list">
          {allowlist.map(h => (
            <li key={h}>
              <code>{h}</code>
            </li>
          ))}
        </ul>
      </details>

      <details className="settings-details">
        <summary>For auditors</summary>
        <ol className="trust-list">
          <li>
            Open the{' '}
            <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
              source on GitHub
            </a>{' '}
            and search <code>src/</code> for <code>fetch</code>, <code>FormData</code>, and{' '}
            <code>XMLHttpRequest</code>.
          </li>
          <li>
            Confirm hashing uses only <code>crypto.subtle.digest</code> on local file buffers — never
            uploaded.
          </li>
          <li>
            Confirm online lookup POSTs only <code>{'{ sha256 }'}</code> and only when you choose
            “Look up online.”
          </li>
        </ol>
      </details>
    </section>
  )
}
