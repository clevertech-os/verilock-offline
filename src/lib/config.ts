/** App version shown in UI and fingerprint receipts. */
export const APP_VERSION = '0.1.3'

export const APP_NAME = 'VeriLock Offline'

export const GITHUB_REPO_URL = 'https://github.com/clevertech-os/verilock-offline'

export const ONLINE_PRODUCT_URL = 'https://verilock.online'

/** Public Nimiq JSON-RPC used to fetch lock transactions. Overridable in Trust panel. */
export const DEFAULT_NIMIQ_RPC_URL =
  (import.meta.env.VITE_NIMIQ_RPC_URL as string | undefined)?.trim() ||
  'https://rpc.nimiqwatch.com'

/**
 * VeriLock seal fee / credit proof sink on mainnet.
 * Lock transactions send 1 luna here with the 37-byte attestation payload.
 * Offline match search scans this address via public RPC (no product API).
 */
export const DEFAULT_ATTESTATION_SINK =
  (import.meta.env.VITE_ATTESTATION_SINK as string | undefined)?.trim() ||
  'NQ815N9JRGBJMLJQNBKEMQ1RD27TXS8PCVKA'

/** verilock.online origin for optional hash-only directory lookup. */
export const DEFAULT_ONLINE_API_BASE =
  (import.meta.env.VITE_ONLINE_API_BASE as string | undefined)?.trim() ||
  'https://verilock.online'

export const ONLINE_LOOKUP_DEFAULT =
  String(import.meta.env.VITE_ONLINE_LOOKUP_DEFAULT ?? 'false').toLowerCase() === 'true'

const STORAGE_RPC_KEY = 'verilock-offline.rpcUrl'

export function getStoredRpcUrl(): string {
  try {
    const v = localStorage.getItem(STORAGE_RPC_KEY)?.trim()
    if (v) return v
  } catch {
    /* private mode */
  }
  return DEFAULT_NIMIQ_RPC_URL
}

export function setStoredRpcUrl(url: string): void {
  try {
    const clean = url.trim()
    if (!clean || clean === DEFAULT_NIMIQ_RPC_URL) {
      localStorage.removeItem(STORAGE_RPC_KEY)
    } else {
      localStorage.setItem(STORAGE_RPC_KEY, clean)
    }
  } catch {
    /* ignore */
  }
}

/** Detect Tauri desktop shell vs plain browser. */
export function isDesktopSurface(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  )
}

export function surfaceLabel(): 'desktop' | 'web' {
  return isDesktopSurface() ? 'desktop' : 'web'
}

/** Documented outbound hosts this app may contact (never with file bytes). */
export function networkAllowlist(rpcUrl: string, onlineBase: string): string[] {
  const hosts: string[] = []
  try {
    hosts.push(new URL(rpcUrl).origin)
  } catch {
    hosts.push(rpcUrl)
  }
  try {
    hosts.push(new URL(onlineBase).origin)
  } catch {
    hosts.push(onlineBase)
  }
  hosts.push('https://nimiq.watch')
  return [...new Set(hosts)]
}
