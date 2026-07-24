import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CloudDownload,
  Eraser,
  FileText,
  Loader2,
  PenLine,
  Printer,
  RefreshCw,
} from 'lucide-react'
import { DEFAULT_ONLINE_API_BASE, ONLINE_PRODUCT_URL } from '../lib/config'
import { useDocumentSession } from '../lib/DocumentSessionContext'
import { useWallet } from '../lib/WalletContext'
import {
  type OnlineAgreementMeta,
  loadOnlineOverlays,
} from '../lib/onlineDocument'
import { type OverlayField, paintOverlay } from '../lib/pdf/overlayPaint'
import { isPdfFile, loadPdfFromFile, renderPdfPage } from '../lib/pdf/pdfRender'
import { printRenderedPages } from '../lib/pdf/printPages'

type ViewState = 'idle' | 'rendering' | 'ready' | 'error' | 'not-pdf'

const iconSm = { size: 16, strokeWidth: 2.25 } as const

/**
 * Local PDF pages + optional overlays from verilock.online.
 * File never leaves this device. Signature ink is opt-in (network to .online).
 */
export function DocumentViewer() {
  const { session, busy: hashing } = useDocumentSession()
  const wallet = useWallet()
  const hostRef = useRef<HTMLDivElement>(null)
  const [viewState, setViewState] = useState<ViewState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [overlayBusy, setOverlayBusy] = useState(false)
  const [overlayError, setOverlayError] = useState<string | null>(null)
  const [overlayNote, setOverlayNote] = useState<string | null>(null)
  const [agreement, setAgreement] = useState<OnlineAgreementMeta | null>(null)
  const [fields, setFields] = useState<OverlayField[]>([])
  const [hasInk, setHasInk] = useState(false)
  /** User explicitly chose to contact verilock.online for this fingerprint. */
  const [onlineOptIn, setOnlineOptIn] = useState(false)
  const [printBusy, setPrintBusy] = useState(false)
  const [printError, setPrintError] = useState<string | null>(null)
  const renderGen = useRef(0)
  const lastTokenRef = useRef<string | null>(null)

  const loadOverlays = useCallback(async () => {
    if (!session) return
    setOnlineOptIn(true)
    setOverlayBusy(true)
    setOverlayError(null)
    setOverlayNote(null)
    try {
      const result = await loadOnlineOverlays({
        sha256: session.sha256,
        apiBase: DEFAULT_ONLINE_API_BASE,
        sessionToken: wallet.session?.token ?? null,
      })
      if (result.ok === false) {
        setOverlayError(result.error)
        setFields([])
        setAgreement(null)
        setHasInk(false)
        return
      }
      setAgreement(result.agreement)
      setFields(result.fields)
      setHasInk(result.hasInk)
      setOverlayNote(result.note)
    } catch (err) {
      setOverlayError(err instanceof Error ? err.message : String(err))
    } finally {
      setOverlayBusy(false)
    }
  }, [session, wallet.session?.token])

  // Local PDF render (offline). Re-paint when overlays change.
  useEffect(() => {
    if (!session || hashing) {
      setViewState('idle')
      setError(null)
      if (hostRef.current) hostRef.current.innerHTML = ''
      return
    }

    if (!isPdfFile(session.file)) {
      setViewState('not-pdf')
      if (hostRef.current) hostRef.current.innerHTML = ''
      return
    }

    const gen = ++renderGen.current
    let cancelled = false
    let pdf: Awaited<ReturnType<typeof loadPdfFromFile>> | null = null

    async function run() {
      setViewState('rendering')
      setError(null)
      if (hostRef.current) hostRef.current.innerHTML = ''

      try {
        pdf = await loadPdfFromFile(session!.file)
        if (cancelled || gen !== renderGen.current) return

        const targetWidth = Math.min(680, Math.max(280, (hostRef.current?.clientWidth || 640) - 8))

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          if (cancelled || gen !== renderGen.current) return
          const rendered = await renderPdfPage(pdf, pageNum, targetWidth)
          const ctx = rendered.canvas.getContext('2d')
          if (ctx) {
            const pageFields = fields.filter(f => f.pageIndex === pageNum - 1)
            for (const f of pageFields) {
              await paintOverlay(ctx, f, rendered.cssWidth, rendered.cssHeight)
            }
          }
          if (cancelled || !hostRef.current) return
          const wrap = document.createElement('div')
          wrap.className = 'doc-viewer-page'
          wrap.appendChild(rendered.canvas)
          hostRef.current.appendChild(wrap)
        }

        if (!cancelled && gen === renderGen.current) setViewState('ready')
      } catch (err) {
        if (cancelled || gen !== renderGen.current) return
        setError(err instanceof Error ? err.message : String(err))
        setViewState('error')
      } finally {
        pdf?.destroy()
      }
    }

    void run()
    return () => {
      cancelled = true
      pdf?.destroy()
    }
  }, [session, hashing, fields])

  // Clear overlays when file changes — stay fully offline until user opts in again.
  useEffect(() => {
    setFields([])
    setAgreement(null)
    setOverlayNote(null)
    setOverlayError(null)
    setHasInk(false)
    setPrintError(null)
    setOnlineOptIn(false)
  }, [session?.sha256])

  // Only re-fetch after Nimiq login if the user already opted in to load from .online.
  useEffect(() => {
    const token = wallet.session?.token ?? null
    if (
      token &&
      token !== lastTokenRef.current &&
      session &&
      onlineOptIn &&
      (agreement || fields.length > 0 || overlayError)
    ) {
      lastTokenRef.current = token
      void loadOverlays()
    } else {
      lastTokenRef.current = token
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional on token change only
  }, [wallet.session?.token])

  async function handlePrint() {
    setPrintError(null)
    setPrintBusy(true)
    try {
      const title = agreement?.title
        ? `Signed — ${agreement.title}`
        : session?.file.name
          ? `Signed — ${session.file.name}`
          : 'Signed document'
      await printRenderedPages(hostRef.current, title)
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Could not print')
    } finally {
      setPrintBusy(false)
    }
  }

  function clearOverlays() {
    setFields([])
    setAgreement(null)
    setOverlayNote(null)
    setOverlayError(null)
    setHasInk(false)
    setOnlineOptIn(false)
  }

  if (!session || hashing) return null
  if (viewState === 'not-pdf') return null

  const needsLoginForInk = Boolean(onlineOptIn && agreement && !hasInk && !wallet.session)
  const canPrint = viewState === 'ready' && !overlayBusy
  const showOptInPrompt = !onlineOptIn && !overlayBusy && fields.length === 0

  return (
    <section className="doc-viewer" aria-labelledby="doc-viewer-title">
      <div className="doc-viewer-header">
        <h3 id="doc-viewer-title">
          <FileText size={18} strokeWidth={2.25} aria-hidden />
          Document
        </h3>
        {agreement && (
          <a
            className="muted doc-viewer-link"
            href={`${ONLINE_PRODUCT_URL}/v/${agreement.slug}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {agreement.title}
          </a>
        )}
      </div>

      <p className="doc-viewer-note muted">
        Your PDF is hashed and shown only on this device. On-chain lock checks use public
        blockchain data — not the file.
      </p>

      {showOptInPrompt && (
        <div className="doc-viewer-optin" role="region" aria-label="Optional online signatures">
          <p className="doc-viewer-optin-title">
            <PenLine size={18} strokeWidth={2.25} aria-hidden />
            Show signatures &amp; initials?
          </p>
          <p className="doc-viewer-optin-body">
            This step is <strong>optional</strong> and is <strong>not offline</strong>. It contacts{' '}
            <a href={ONLINE_PRODUCT_URL} target="_blank" rel="noopener noreferrer">
              verilock.online
            </a>{' '}
            with this file’s fingerprint only — never the document bytes — to load field layout and
            party ink (when your Nimiq wallet is a party on the agreement).
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={viewState === 'rendering'}
              onClick={() => void loadOverlays()}
            >
              <CloudDownload {...iconSm} aria-hidden />
              Load from verilock.online
            </button>
          </div>
        </div>
      )}

      {!showOptInPrompt && (
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={overlayBusy || viewState === 'rendering'}
            onClick={() => void loadOverlays()}
          >
            {overlayBusy ? (
              <Loader2 className="lucide-spin" {...iconSm} aria-hidden />
            ) : fields.length ? (
              <RefreshCw {...iconSm} aria-hidden />
            ) : (
              <CloudDownload {...iconSm} aria-hidden />
            )}
            {overlayBusy
              ? 'Loading from verilock.online…'
              : fields.length
                ? 'Reload from verilock.online'
                : 'Load from verilock.online'}
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            disabled={!canPrint || printBusy}
            onClick={() => void handlePrint()}
            title={
              hasInk
                ? 'Open system print preview (local pages + signature overlays)'
                : 'Open system print preview of local PDF pages'
            }
          >
            {printBusy ? (
              <Loader2 className="lucide-spin" {...iconSm} aria-hidden />
            ) : (
              <Printer {...iconSm} aria-hidden />
            )}
            {printBusy ? 'Preparing…' : 'Print'}
          </button>

          {(fields.length > 0 || onlineOptIn) && (
            <button type="button" className="btn btn-ghost" onClick={clearOverlays}>
              <Eraser {...iconSm} aria-hidden />
              Clear online data
            </button>
          )}
        </div>
      )}

      {showOptInPrompt && (
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!canPrint || printBusy}
            onClick={() => void handlePrint()}
            title="Print local PDF pages only (no online signatures)"
          >
            {printBusy ? (
              <Loader2 className="lucide-spin" {...iconSm} aria-hidden />
            ) : (
              <Printer {...iconSm} aria-hidden />
            )}
            {printBusy ? 'Preparing…' : 'Print local PDF'}
          </button>
        </div>
      )}

      {onlineOptIn && !overlayBusy && (
        <p className="muted doc-viewer-network-note">
          Online mode: fingerprint sent to{' '}
          <a href={ONLINE_PRODUCT_URL} target="_blank" rel="noopener noreferrer">
            verilock.online
          </a>
          . File bytes stay on this device.
        </p>
      )}

      {overlayError && (
        <p className="status status-error" role="alert">
          {overlayError}
        </p>
      )}

      {printError && (
        <p className="status status-error" role="alert">
          {printError}
        </p>
      )}

      {needsLoginForInk && (
        <p className="status status-warn" role="status">
          Field layout loaded from verilock.online. Use <strong>Log in with Nimiq</strong> (top
          right) with a wallet that is a party on this agreement to unlock private signature ink.
        </p>
      )}

      {overlayNote && hasInk && <p className="muted">{overlayNote}</p>}

      {viewState === 'rendering' && (
        <p className="status status-pending" role="status">
          <Loader2 className="lucide-spin" {...iconSm} aria-hidden />
          Rendering…
        </p>
      )}

      {viewState === 'error' && error && (
        <p className="status status-error" role="alert">
          {error}
        </p>
      )}

      <div ref={hostRef} className="doc-viewer-pages" />
    </section>
  )
}
