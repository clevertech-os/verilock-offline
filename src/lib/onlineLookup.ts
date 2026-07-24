/**
 * Optional hash-only directory lookup against verilock.online.
 * Sends ONLY the SHA-256 fingerprint — never file bytes.
 *
 * On desktop (Tauri), uses a native HTTP helper so CORS cannot block the call.
 * On web, uses fetch (requires product API CORS for this origin).
 */

import { httpPostJson } from './tauriHttp'

export interface OnlineMatch {
  id: string
  slug: string
  title: string
  originalFilename: string | null
  status: string
  finalSha256: string | null
  createdAt: number
  lockedAt: number | null
}

export type OnlineLookupResult =
  | { ok: true; matches: OnlineMatch[] }
  | { ok: false; error: string }

function friendlyNetworkError(msg: string): string {
  // Safari/WebKit: "Load failed"; Chromium: "Failed to fetch"
  if (/Failed to fetch|NetworkError|Load failed|CORS/i.test(msg)) {
    return (
      'Could not reach verilock.online. Check your internet connection. ' +
      'If this keeps failing on the web app, the product API may need to allow this site.'
    )
  }
  return msg
}

export async function lookupHashOnline(
  onlineApiBase: string,
  sha256: string,
): Promise<OnlineLookupResult> {
  const hash = sha256.toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    return { ok: false, error: 'Not a valid document fingerprint' }
  }

  const base = onlineApiBase.replace(/\/$/, '')
  const url = `${base}/api/verify/hash`
  const body = JSON.stringify({ sha256: hash })

  try {
    const text = await httpPostJson(url, body)
    const data = JSON.parse(text) as { matches?: OnlineMatch[] }
    return { ok: true, matches: Array.isArray(data.matches) ? data.matches : [] }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: friendlyNetworkError(msg) }
  }
}

export function onlineVerifyUrl(onlineBase: string, slug: string): string {
  const base = onlineBase.replace(/\/$/, '')
  return `${base}/v/${slug}`
}
