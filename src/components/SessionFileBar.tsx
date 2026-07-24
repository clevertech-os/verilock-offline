import { AlertCircle, Loader2 } from 'lucide-react'
import { useDocumentSession } from '../lib/DocumentSessionContext'
import { FilePicker } from './FilePicker'

/** Shared file control used by the check flow. */
export function SessionFileBar() {
  const { session, busy, error, setFile } = useDocumentSession()

  return (
    <div className="session-file-bar">
      <FilePicker
        file={session?.file ?? null}
        onFile={f => {
          void setFile(f)
        }}
        disabled={busy}
      />
      {busy && (
        <p className="status status-pending" role="status">
          <Loader2 className="lucide-spin" size={16} strokeWidth={2.25} aria-hidden />
          Checking on this device…
        </p>
      )}
      {error && (
        <p className="status status-error" role="alert">
          <AlertCircle size={16} strokeWidth={2.25} aria-hidden />
          {error}
        </p>
      )}
    </div>
  )
}
