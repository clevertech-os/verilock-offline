import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { createDocumentSession, type DocumentSession } from './documentSession'

type Ctx = {
  session: DocumentSession | null
  busy: boolean
  error: string | null
  setFile: (file: File | null) => Promise<void>
  clear: () => void
}

const DocumentSessionContext = createContext<Ctx | null>(null)

export function DocumentSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<DocumentSession | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clear = useCallback(() => {
    setSession(null)
    setError(null)
    setBusy(false)
  }, [])

  const setFile = useCallback(async (file: File | null) => {
    if (!file) {
      clear()
      return
    }
    setBusy(true)
    setError(null)
    try {
      const next = await createDocumentSession(file)
      setSession(next)
    } catch (err) {
      setSession(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [clear])

  const value = useMemo(
    () => ({ session, busy, error, setFile, clear }),
    [session, busy, error, setFile, clear],
  )

  return (
    <DocumentSessionContext.Provider value={value}>{children}</DocumentSessionContext.Provider>
  )
}

export function useDocumentSession(): Ctx {
  const ctx = useContext(DocumentSessionContext)
  if (!ctx) {
    throw new Error('useDocumentSession must be used within DocumentSessionProvider')
  }
  return ctx
}
