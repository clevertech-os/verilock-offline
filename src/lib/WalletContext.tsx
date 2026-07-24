import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  type WalletSession,
  clearStaleHubRpcState,
  clearWalletSession,
  consumeRedirectStatusFlag,
  friendlyHubError,
  isHubCancelError,
  isHubRedirectError,
  loadWalletSession,
  loginWithNimiqHub,
  setupHubRedirectLogin,
  shortWalletAddress,
  validateWalletSession,
} from './walletAuth'

type WalletCtx = {
  session: WalletSession | null
  address: string | null
  shortAddress: string | null
  connecting: boolean
  error: string | null
  status: string | null
  login: () => Promise<void>
  logout: () => void
  clearError: () => void
}

const Ctx = createContext<WalletCtx | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<WalletSession | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  // Restore session + finish Hub redirect return (choose-address / sign-message).
  useEffect(() => {
    let cancelled = false

    void (async () => {
      const returning = consumeRedirectStatusFlag()
      if (returning) {
        setStatus('Returning from Nimiq Hub…')
        setConnecting(true)
      }

      let completedViaRedirect = false
      const { loginHandled } = await setupHubRedirectLogin({
        onComplete: s => {
          if (cancelled) return
          completedViaRedirect = true
          setSession(s)
          setError(null)
          setStatus(null)
          setConnecting(false)
        },
        onError: err => {
          if (cancelled) return
          if (isHubCancelError(err)) {
            setError(null)
          } else {
            setError(friendlyHubError(err) || err.message)
          }
          setStatus(null)
          setConnecting(false)
        },
        onStatus: msg => {
          if (cancelled) return
          setStatus(msg)
          if (msg) setConnecting(true)
        },
      })

      if (cancelled) return

      if (!loginHandled && !completedViaRedirect) {
        const stored = loadWalletSession()
        if (stored) {
          const ok = await validateWalletSession(stored)
          if (!cancelled) {
            if (ok) setSession(stored)
            else clearWalletSession()
          }
        }
      }

      if (!cancelled) {
        setConnecting(false)
        if (!completedViaRedirect && !loginHandled) setStatus(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async () => {
    setConnecting(true)
    setError(null)
    setStatus('Opening your browser for Nimiq Hub…')
    clearStaleHubRpcState()
    try {
      const result = await loginWithNimiqHub()
      if (result === 'redirecting') {
        setStatus('Opening Nimiq Hub…')
        return
      }
      // Desktop system-browser path returns a session immediately when browser finishes.
      setSession(result)
      setError(null)
      setStatus(null)
      setConnecting(false)
    } catch (err) {
      if (isHubRedirectError(err)) {
        setStatus('Opening Nimiq Hub…')
        return
      }
      if (isHubCancelError(err)) {
        setError(null)
      } else {
        setError(friendlyHubError(err))
      }
      setStatus(null)
      setConnecting(false)
    }
  }, [])

  const logout = useCallback(() => {
    clearWalletSession()
    setSession(null)
    setError(null)
    setStatus(null)
  }, [])

  const value = useMemo<WalletCtx>(
    () => ({
      session,
      address: session?.address ?? null,
      shortAddress: session ? shortWalletAddress(session.address) : null,
      connecting,
      error,
      status,
      login,
      logout,
      clearError: () => setError(null),
    }),
    [session, connecting, error, status, login, logout],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWallet(): WalletCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useWallet must be used within WalletProvider')
  return ctx
}
