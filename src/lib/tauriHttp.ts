/**
 * Desktop-native HTTP helpers (Tauri). Bypass browser CORS for product API.
 * Never used for document file bytes.
 * Also opens external https links in the system browser (webview cannot).
 */

import { isDesktopSurface } from './config'

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

/** Open https URL: system browser on desktop, new tab on web. */
export async function openExternalUrl(url: string): Promise<void> {
  const trimmed = url.trim()
  if (!trimmed) return
  if (isDesktopSurface()) {
    await invoke('open_external_url', { url: trimmed })
    return
  }
  window.open(trimmed, '_blank', 'noopener,noreferrer')
}

/**
 * Intercept clicks on external http(s) anchors so desktop opens them outside
 * the webview (target=_blank and in-app navigation are blocked/no-ops in Tauri).
 */
export function installExternalLinkHandler(): () => void {
  if (typeof document === 'undefined' || !isDesktopSurface()) {
    return () => {}
  }

  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented) return
    if (event.button !== 0) return // left click only
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

    const target = event.target
    if (!(target instanceof Element)) return
    const anchor = target.closest('a[href]')
    if (!(anchor instanceof HTMLAnchorElement)) return

    const href = anchor.getAttribute('href')
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('javascript:')) {
      return
    }

    let absolute: URL
    try {
      absolute = new URL(href, window.location.href)
    } catch {
      return
    }
    if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') return
    // Same-origin (e.g. assets) — leave alone
    if (absolute.origin === window.location.origin) return

    event.preventDefault()
    event.stopPropagation()
    void openExternalUrl(absolute.href).catch(err => {
      console.error('Could not open external link', err)
    })
  }

  document.addEventListener('click', onClick, true)
  return () => document.removeEventListener('click', onClick, true)
}

export async function httpGetText(
  url: string,
  headers?: Record<string, string>,
): Promise<string> {
  if (isDesktopSurface()) {
    const result = await invoke('fetch_json', {
      url,
      method: 'GET',
      body: null,
      headers: headers ?? null,
    })
    if (typeof result !== 'string') throw new Error('Unexpected desktop response')
    return result
  }
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers } })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}${t ? `: ${t.slice(0, 120)}` : ''}`)
  }
  return res.text()
}

export async function httpPostJson(
  url: string,
  body: string,
  headers?: Record<string, string>,
): Promise<string> {
  if (isDesktopSurface()) {
    const result = await invoke('fetch_json', {
      url,
      method: 'POST',
      body,
      headers: headers ?? null,
    })
    if (typeof result !== 'string') throw new Error('Unexpected desktop response')
    return result
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    },
    body,
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}${t ? `: ${t.slice(0, 120)}` : ''}`)
  }
  return res.text()
}

/** Returns a data:image/...;base64,... URL (or empty if failed). */
export async function httpGetImageDataUrl(
  url: string,
  headers?: Record<string, string>,
): Promise<string | null> {
  if (isDesktopSurface()) {
    try {
      const result = await invoke('fetch_image_data_url', {
        url,
        headers: headers ?? null,
      })
      return typeof result === 'string' && result.startsWith('data:') ? result : null
    } catch {
      return null
    }
  }
  try {
    const res = await fetch(url, { headers })
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string | null>(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}
