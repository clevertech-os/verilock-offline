/**
 * Print rendered PDF page canvases (with overlays already painted).
 *
 * Desktop (Tauri): WKWebView does not support window.print() reliably.
 * We write page images into a temporary HTML file and open it in the system
 * browser, which can show the OS print dialog.
 *
 * Web: use in-page @media print + window.print().
 */

import { isDesktopSurface } from '../config'

const PRINT_ROOT_ID = 'verilock-offline-print-root'
const PRINT_STYLE_ID = 'verilock-offline-print-style'

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: {
    invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
  }
}

function invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  const w = window as TauriWindow
  const fn = w.__TAURI_INTERNALS__?.invoke
  if (!fn) throw new Error('Desktop bridge unavailable')
  return fn(cmd, args)
}

function waitForImage(img: HTMLImageElement): Promise<void> {
  return new Promise(resolve => {
    if (img.complete && img.naturalWidth > 0) {
      resolve()
      return
    }
    img.onload = () => resolve()
    img.onerror = () => resolve()
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function capturePageDataUrls(pagesRoot: HTMLElement): string[] {
  const canvases = Array.from(pagesRoot.querySelectorAll('canvas'))
  if (canvases.length === 0) throw new Error('No pages to print')

  return canvases.map(c => {
    try {
      return c.toDataURL('image/png')
    } catch {
      throw new Error('Could not capture page for print')
    }
  })
}

/** Self-contained print HTML — marker `verilock-offline-print` required by native command. */
function buildPrintHtml(dataUrls: string[], title: string): string {
  const safeTitle = escapeHtml(title.replace(/[<>&"]/g, '').trim() || 'Signed document')
  const images = dataUrls
    .map(
      (src, i) =>
        `<img class="print-page" src="${src}" alt="Page ${i + 1}" />`,
    )
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <!-- verilock-offline-print -->
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #0f172a;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #e2e8f0;
      background: #f8fafc;
    }
    .toolbar h1 {
      margin: 0;
      font-size: 1rem;
      font-weight: 650;
    }
    .toolbar p {
      margin: 0.15rem 0 0;
      font-size: 0.8rem;
      color: #64748b;
    }
    .toolbar button {
      appearance: none;
      border: 0;
      border-radius: 8px;
      background: #0d9488;
      color: #fff;
      font: inherit;
      font-size: 0.9rem;
      font-weight: 650;
      padding: 0.5rem 1rem;
      cursor: pointer;
    }
    .toolbar button:hover { background: #0f766e; }
    .pages {
      padding: 1rem;
      max-width: 920px;
      margin: 0 auto;
    }
    .print-page {
      display: block;
      width: 100%;
      max-width: 100%;
      height: auto;
      margin: 0 auto 1rem;
      box-shadow: 0 1px 3px rgb(15 23 42 / 12%);
    }
    @media print {
      @page { margin: 10mm; }
      .toolbar { display: none !important; }
      .pages { padding: 0; max-width: none; }
      .print-page {
        box-shadow: none;
        margin: 0 auto;
        page-break-after: always;
        break-after: page;
      }
      .print-page:last-child {
        page-break-after: auto;
        break-after: auto;
      }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div>
      <h1>${safeTitle}</h1>
      <p>Local preview only — file never left VeriLock Offline. Use Print (or ⌘P / Ctrl+P).</p>
    </div>
    <button type="button" onclick="window.print()">Print…</button>
  </div>
  <div class="pages">
    ${images}
  </div>
  <script>
    // Auto-open the system print dialog once images are ready.
    window.addEventListener('load', function () {
      var imgs = Array.prototype.slice.call(document.images || []);
      Promise.all(imgs.map(function (img) {
        if (img.complete) return Promise.resolve();
        return new Promise(function (resolve) {
          img.onload = resolve;
          img.onerror = resolve;
        });
      })).then(function () {
        setTimeout(function () { window.print(); }, 200);
      });
    });
  </script>
</body>
</html>`
}

async function printViaSystemBrowser(dataUrls: string[], title: string): Promise<void> {
  const html = buildPrintHtml(dataUrls, title)
  await invoke('open_print_html', { html })
}

async function printInWebview(dataUrls: string[], title: string): Promise<void> {
  document.getElementById(PRINT_ROOT_ID)?.remove()
  document.getElementById(PRINT_STYLE_ID)?.remove()

  const style = document.createElement('style')
  style.id = PRINT_STYLE_ID
  style.textContent = `
    #${PRINT_ROOT_ID} {
      position: fixed !important;
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
      z-index: -1 !important;
    }
    @media print {
      @page { margin: 10mm; }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        height: auto !important;
        overflow: visible !important;
      }
      body > *:not(#${PRINT_ROOT_ID}) {
        display: none !important;
      }
      #${PRINT_ROOT_ID} {
        display: block !important;
        position: static !important;
        width: 100% !important;
        height: auto !important;
        overflow: visible !important;
        opacity: 1 !important;
        pointer-events: auto !important;
        z-index: auto !important;
        background: #fff !important;
        color: #0f172a !important;
      }
      #${PRINT_ROOT_ID} .print-page {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        height: auto !important;
        margin: 0 auto !important;
        page-break-after: always;
        break-after: page;
      }
      #${PRINT_ROOT_ID} .print-page:last-child {
        page-break-after: auto;
        break-after: auto;
      }
    }
  `
  document.head.appendChild(style)

  const root = document.createElement('div')
  root.id = PRINT_ROOT_ID
  root.setAttribute('aria-hidden', 'true')

  dataUrls.forEach((src, i) => {
    const img = document.createElement('img')
    img.className = 'print-page'
    img.src = src
    img.alt = `Page ${i + 1}`
    root.appendChild(img)
  })
  document.body.appendChild(root)

  await Promise.all(Array.from(root.querySelectorAll('img')).map(waitForImage))
  await new Promise<void>(r => {
    window.setTimeout(r, 50)
  })

  const previousTitle = document.title
  const safeTitle = title.replace(/[<>&"]/g, '').trim()
  if (safeTitle) document.title = safeTitle

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    document.title = previousTitle
    root.remove()
    style.remove()
    window.removeEventListener('afterprint', onAfterPrint)
  }
  const onAfterPrint = () => cleanup()
  window.addEventListener('afterprint', onAfterPrint)

  try {
    window.print()
  } catch (err) {
    cleanup()
    throw err instanceof Error ? err : new Error('Could not open print')
  }

  window.setTimeout(cleanup, 60_000)
}

/**
 * Open a print dialog with the rendered page canvases.
 * Desktop opens the system browser (webview print is a no-op on many platforms).
 */
export async function printRenderedPages(
  pagesRoot: HTMLElement | null,
  title = 'Signed document',
): Promise<void> {
  if (!pagesRoot) throw new Error('Document is not ready to print')
  const dataUrls = capturePageDataUrls(pagesRoot)

  if (isDesktopSurface()) {
    try {
      await printViaSystemBrowser(dataUrls, title)
      return
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(
        msg.includes('Desktop bridge')
          ? 'Could not open system print preview. Restart the app and try again.'
          : msg || 'Could not open system print preview',
      )
    }
  }

  await printInWebview(dataUrls, title)
}
