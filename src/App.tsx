import { useState } from 'react'
import { Code2, FileSearch, Globe, Monitor, Settings } from 'lucide-react'
import { CheckPanel } from './components/CheckPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { WalletHeader } from './components/WalletHeader'
import {
  APP_NAME,
  APP_VERSION,
  GITHUB_REPO_URL,
  ONLINE_PRODUCT_URL,
  surfaceLabel,
} from './lib/config'
import { DocumentSessionProvider } from './lib/DocumentSessionContext'
import { WalletProvider } from './lib/WalletContext'
import './App.css'

type TabId = 'check' | 'settings'

const iconSm = { size: 16, strokeWidth: 2.25 } as const

function AppShell() {
  const [tab, setTab] = useState<TabId>('check')
  const surface = surfaceLabel()

  return (
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
            <p className="brand-tag">Sign today. Prove tomorrow.</p>
          </div>
        </div>
        <div className="header-meta">
          <nav className="header-nav" aria-label="Main">
            <button
              type="button"
              className={`header-nav-btn${tab === 'check' ? ' header-nav-btn--active' : ''}`}
              aria-current={tab === 'check' ? 'page' : undefined}
              onClick={() => setTab('check')}
            >
              <FileSearch {...iconSm} aria-hidden />
              Check
            </button>
            <button
              type="button"
              className={`header-nav-btn${tab === 'settings' ? ' header-nav-btn--active' : ''}`}
              aria-current={tab === 'settings' ? 'page' : undefined}
              onClick={() => setTab('settings')}
            >
              <Settings {...iconSm} aria-hidden />
              Settings
            </button>
          </nav>
          <WalletHeader />
        </div>
      </header>

      <main className="app-main">
        {tab === 'check' && (
          <section className="hero">
            <h1>Is this document locked on chain?</h1>
            <p>Drop the file. Nothing is uploaded.</p>
          </section>
        )}

        <div className="tab-panel">{tab === 'check' ? <CheckPanel /> : <SettingsPanel />}</div>
      </main>

      <footer className="app-footer">
        <p className="app-footer-links">
          Companion to{' '}
          <a href={ONLINE_PRODUCT_URL} target="_blank" rel="noopener noreferrer">
            <Globe size={14} strokeWidth={2.25} aria-hidden />
            verilock.online
          </a>
          {' · '}
          <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
            <Code2 size={14} strokeWidth={2.25} aria-hidden />
            Source
          </a>
        </p>
        <span className="badge app-footer-badge" title={`v${APP_VERSION}`}>
          {surface === 'desktop' ? (
            <Monitor size={13} strokeWidth={2.25} aria-hidden />
          ) : (
            <Globe size={13} strokeWidth={2.25} aria-hidden />
          )}
          {surface === 'desktop' ? 'Desktop' : 'Web'} · v{APP_VERSION}
        </span>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <DocumentSessionProvider>
      <WalletProvider>
        <AppShell />
      </WalletProvider>
    </DocumentSessionProvider>
  )
}
