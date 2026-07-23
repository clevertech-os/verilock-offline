/**
 * Local SHA-256 fingerprinting.
 * File bytes are only passed to Web Crypto — never to fetch/XHR.
 */

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export function shortHash(hash: string, chars = 8): string {
  if (hash.length <= chars * 2) return hash
  return `${hash.slice(0, chars)}…${hash.slice(-chars)}`
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

export interface FingerprintReceipt {
  v: 1
  app: 'verilock-offline'
  appVersion: string
  surface: 'web' | 'desktop'
  filename: string
  size: number
  sha256: string
  hashedAt: string
}

export function buildFingerprintReceipt(input: {
  filename: string
  size: number
  sha256: string
  appVersion: string
  surface: 'web' | 'desktop'
}): FingerprintReceipt {
  return {
    v: 1,
    app: 'verilock-offline',
    appVersion: input.appVersion,
    surface: input.surface,
    filename: input.filename,
    size: input.size,
    sha256: input.sha256.toLowerCase(),
    hashedAt: new Date().toISOString(),
  }
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.click()
  URL.revokeObjectURL(url)
}

export async function hashFile(file: File): Promise<{ sha256: string; size: number }> {
  const buf = await file.arrayBuffer()
  const sha256 = await sha256Hex(buf)
  return { sha256, size: file.size }
}
