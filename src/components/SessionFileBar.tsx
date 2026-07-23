import { formatBytes, shortHash } from '../lib/hash'
import { useDocumentSession } from '../lib/DocumentSessionContext'
import { FilePicker } from './FilePicker'

/** Shared file control used by all verify modes. */
export function SessionFileBar({ label = 'Document file on this device' }: { label?: string }) {
  const { session, busy, error, setFile } = useDocumentSession()

  return (
    <div className="session-file-bar">
      <FilePicker
        file={session?.file ?? null}
        onFile={f => {
          void setFile(f)
        }}
        label={label}
        disabled={busy}
      />
      {busy && (
        <p className="status status-pending" role="status">
          Hashing locally…
        </p>
      )}
      {error && (
        <p className="status status-error" role="alert">
          {error}
        </p>
      )}
      {session && !busy && (
        <p className="session-hash muted" role="status">
          Local fingerprint <code title={session.sha256}>{shortHash(session.sha256)}</code> ·{' '}
          {formatBytes(session.size)}
        </p>
      )}
    </div>
  )
}
