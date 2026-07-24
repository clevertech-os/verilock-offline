import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut } from 'lucide-react'
import { useWallet } from '../lib/WalletContext'
import { NimiqHexagonIcon } from './NimiqHexagonIcon'

/**
 * Top-right wallet control — same pattern as verilock.online:
 * Nimiq hex + Login when signed out; address menu when signed in.
 */
export function WalletHeader() {
  const wallet = useWallet()
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  useEffect(() => {
    if (wallet.session) setMenuOpen(false)
  }, [wallet.session])

  if (!wallet.session) {
    return (
      <div className="wallet-header">
        <button
          type="button"
          className="wallet-login-btn"
          disabled={wallet.connecting}
          title={wallet.status ?? 'Log in with your Nimiq wallet'}
          onClick={() => {
            wallet.clearError()
            void wallet.login()
          }}
        >
          <NimiqHexagonIcon size={16} />
          <span>
            {wallet.connecting || wallet.status
              ? wallet.status || 'Opening browser…'
              : 'Log in with Nimiq'}
          </span>
        </button>
        {wallet.error && (
          <p className="wallet-header-error" role="alert" title={wallet.error}>
            {wallet.error}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="wallet-header wallet-header--in" ref={rootRef}>
      <button
        type="button"
        className={`wallet-account-btn${menuOpen ? ' wallet-account-btn--open' : ''}`}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        title={wallet.address ?? undefined}
        onClick={() => setMenuOpen(v => !v)}
      >
        <NimiqHexagonIcon size={16} />
        <span className="wallet-account-addr">{wallet.shortAddress}</span>
        <ChevronDown
          className="wallet-account-caret"
          size={14}
          strokeWidth={2.5}
          aria-hidden
        />
      </button>
      {menuOpen && (
        <div className="wallet-menu" role="menu">
          <p className="wallet-menu-label">Connected wallet</p>
          <p className="wallet-menu-address" title={wallet.address ?? undefined}>
            {wallet.address}
          </p>
          <button
            type="button"
            className="wallet-menu-signout"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false)
              wallet.logout()
            }}
          >
            <LogOut size={15} strokeWidth={2.25} aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
