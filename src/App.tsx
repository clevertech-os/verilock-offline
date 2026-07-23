import { useState } from 'react'
import { CertificatePanel } from './components/CertificatePanel'
import { FingerprintPanel } from './components/FingerprintPanel'
import { OnlineLookupPanel } from './components/OnlineLookupPanel'
import { TrustPanel } from './components/TrustPanel'
import { VerifyTxPanel } from './components/VerifyTxPanel'
import {
  APP_NAME,
  APP_VERSION,
  GITHUB_REPO_URL,
  ONLINE_PRODUCT_URL,
  surfaceLabel,
} from './lib/config'
import { DocumentSessionProvider } from './lib/DocumentSessionContext'
import './App.css'

type TabId = 'fingerprint' | 'tx' | 'certificate' | 'directory' | 'trust'

const TABS: { id: TabId; label: string }[] = [
  { id: 'fingerprint', label: 'Fingerprint' },
  { id: 'tx', label: 'Verify (tx)' },
  { id: 'certificate', label: 'Certificate' },
  { id: 'directory', label: 'Directory' },
  { id: 'trust', label: 'Trust' },
]

export default function App() {
  const [tab, setTab] = useState<TabId>('fingerprint')
  const surface = surfaceLabel()

  return (
    <DocumentSessionProvider>
      <div className="app">
        <header className="app-header">
          <div className="brand">
            <img
              className="brand-mark"
              src={`${import.meta.env.BASE_URL}verilock-mark.png`}
              alt=""
              width={48}
              height={48}
            />
            <div>
              <p className="brand-name">{APP_NAME}</p>
              <p className="brand-tag">Local hash · chain proof · open source</p>
            </div>
          </div>
          <div className="header-meta">
            <span className="badge" title={`v${APP_VERSION}`}>
              {surface === 'desktop' ? 'Desktop' : 'Web'} · v{APP_VERSION}
            </span>
            <a
              className="header-link"
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Source
            </a>
            <a
              className="header-link"
              href={ONLINE_PRODUCT_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              verilock.online
            </a>
          </div>
        </header>

        <main className="app-main">
          <section className="hero">
            <h1>Check a sealed document without uploading it</h1>
            <p>
              Hash files on your Mac, Windows, or Linux machine. Prove they match a Nimiq lock
              transaction or a VeriLock certificate. Review the code to confirm the file never
              leaves this app.
            </p>
          </section>

          <nav className="tabs" aria-label="Verification modes">
            {TABS.map(t => (
              <button
                key={t.id}
                type="button"
                className={`tab ${tab === t.id ? 'tab--active' : ''}`}
                aria-current={tab === t.id ? 'page' : undefined}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="tab-panel">
            {tab === 'fingerprint' && <FingerprintPanel />}
            {tab === 'tx' && <VerifyTxPanel />}
            {tab === 'certificate' && <CertificatePanel />}
            {tab === 'directory' && <OnlineLookupPanel />}
            {tab === 'trust' && <TrustPanel />}
          </div>
        </main>

        <footer className="app-footer">
          <p>
            Companion to{' '}
            <a href={ONLINE_PRODUCT_URL} target="_blank" rel="noopener noreferrer">
              verilock.online
            </a>
            . MIT licensed ·{' '}
            <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </p>
        </footer>
      </div>
    </DocumentSessionProvider>
  )
}
