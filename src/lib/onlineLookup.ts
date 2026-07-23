/**
 * Optional hash-only directory lookup against verilock.online.
 * Sends ONLY the SHA-256 fingerprint — never file bytes.
 */

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

export async function lookupHashOnline(
  onlineApiBase: string,
  sha256: string,
): Promise<OnlineLookupResult> {
  const hash = sha256.toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    return { ok: false, error: 'SHA-256 must be 64 hex characters' }
  }

  const base = onlineApiBase.replace(/\/$/, '')
  const url = `${base}/api/verify/hash`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sha256: hash }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        error: `HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
      }
    }
    const data = (await res.json()) as { matches?: OnlineMatch[] }
    return { ok: true, matches: Array.isArray(data.matches) ? data.matches : [] }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/Failed to fetch|NetworkError|CORS/i.test(msg)) {
      return {
        ok: false,
        error:
          'Network or CORS error. Desktop apps are not subject to CORS; for the web SPA, verilock.online must allow this origin.',
      }
    }
    return { ok: false, error: msg }
  }
}

export function onlineVerifyUrl(onlineBase: string, slug: string): string {
  const base = onlineBase.replace(/\/$/, '')
  return `${base}/v/${slug}`
}
