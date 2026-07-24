/**
 * Nimiq Hub wallet login against verilock.online (same challenge/verify as the product).
 * - Desktop (Tauri): system browser on a free loopback port (WebKit cannot hold Hub keys).
 * - Web: full-page Hub redirect.
 * Never sends document bytes.
 */

import HubApi from '@nimiq/hub-api'
import type { ChooseAddressResult, SignedMessage } from '@nimiq/hub-api'
import { DEFAULT_ONLINE_API_BASE, isDesktopSurface } from './config'
import { httpGetText, httpPostJson } from './tauriHttp'

const { RedirectRequestBehavior, RequestType } = HubApi

const HUB_ENDPOINT =
  (import.meta.env.VITE_NIMIQ_HUB_URL as string | undefined)?.trim() || 'https://hub.nimiq.com'
/** Same app label as the product so Hub shows a familiar approval screen. */
const APP_NAME = 'VeriLock'
const STORAGE_KEY = 'verilock-offline.walletSession'
const REDIRECT_STATUS_KEY = 'verilock-offline.hubLoginStatus'
const RPC_REQUESTS_KEY = 'rpcRequests'
const HUB_RESPONSE_KEY_PREFIX = 'response-'

export interface WalletSession {
  token: string
  address: string
}

export const HUB_REDIRECT_MESSAGE = 'Opening Nimiq Hub…'

let hubApi: HubApi | null = null
let redirectHandlersReady = false

function getHub(): HubApi {
  if (!hubApi) hubApi = new HubApi(HUB_ENDPOINT)
  return hubApi
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

function apiBase(): string {
  return DEFAULT_ONLINE_API_BASE.replace(/\/$/, '')
}

/** Return URL for Hub redirect — current offline app origin/path (no hash). */
function hubReturnUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:5177/'
  return `${window.location.origin}${window.location.pathname}${window.location.search}`
}

function hubRedirectBehavior(localState: Record<string, unknown>) {
  return new RedirectRequestBehavior(hubReturnUrl(), localState)
}

export function loadWalletSession(): WalletSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WalletSession
    if (!parsed.token || !parsed.address) return null
    return parsed
  } catch {
    return null
  }
}

export function saveWalletSession(session: WalletSession): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    /* private mode */
  }
}

export function clearWalletSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function shortAddr(address: string): string {
  const a = address.replace(/\s/g, '')
  if (a.length < 12) return a
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

export { shortAddr as shortWalletAddress }

export function isHubRedirectError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg === HUB_REDIRECT_MESSAGE || /redirecting to nimiq hub|opening nimiq hub/i.test(msg)
}

export function isHubCancelError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).trim()
  if (!msg) return false
  if (msg === 'Request was cancelled') return true
  if (/^cancell?ed$/i.test(msg)) return true
  if (/cancell?ed by user/i.test(msg)) return true
  if (/request was cancell?ed/i.test(msg)) return true
  if (/user cancell?ed/i.test(msg)) return true
  return false
}

/** Hub wallet still syncing / key material not ready (common in WebKit / desktop). */
export function isHubWalletNotReadyError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return (
    msg.includes('keyid not found') ||
    msg.includes('key id not found') ||
    msg.includes('could not read login file') ||
    msg.includes('fetching addresses failed') ||
    (msg.includes('syncing with the network') && msg.includes('failed'))
  )
}

/**
 * Turn Hub/raw errors into short, actionable copy for the offline UI.
 */
export function friendlyHubError(err: unknown): string {
  if (isHubCancelError(err)) return ''
  if (isHubWalletNotReadyError(err)) {
    return (
      'Nimiq Hub was still syncing your wallet (key not ready yet). ' +
      'Wait until Hub shows your addresses fully loaded, then try Log in with Nimiq again.'
    )
  }
  const msg = err instanceof Error ? err.message : String(err)
  if (/failed to open popup|popup blocked/i.test(msg)) {
    return 'Could not open Nimiq Hub. Close other Hub tabs and try again.'
  }
  if (/network|fetch|load failed|offline/i.test(msg)) {
    return 'Could not reach Nimiq Hub or verilock.online. Check your connection and try again.'
  }
  return msg || 'Nimiq login failed'
}

/** Drop stale Hub RPC entries so the next login is not blocked as “in flight”. */
export function clearStaleHubRpcState(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(RPC_REQUESTS_KEY)
    const stale: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(HUB_RESPONSE_KEY_PREFIX)) stale.push(key)
    }
    for (const key of stale) sessionStorage.removeItem(key)
  } catch {
    /* private mode */
  }
}

/** Validate stored session still works on the product API. */
export async function validateWalletSession(session: WalletSession): Promise<boolean> {
  try {
    await httpGetText(`${apiBase()}/api/me`, {
      Authorization: `Bearer ${session.token}`,
      Accept: 'application/json',
    })
    return true
  } catch {
    return false
  }
}

async function challengeForAddress(address: string): Promise<{ token: string; nonce: string }> {
  const challengeText = await httpPostJson(
    `${apiBase()}/api/auth/challenge`,
    JSON.stringify({ address }),
  )
  const challenge = JSON.parse(challengeText) as {
    token: string
    nonce: string
    address: string
  }
  if (!challenge.token || !challenge.nonce) {
    throw new Error('Login challenge failed')
  }
  return { token: challenge.token, nonce: challenge.nonce }
}

async function verifyHubLogin(input: {
  token: string
  publicKey: string
  signature: string
  address: string
}): Promise<WalletSession> {
  const verifyText = await httpPostJson(
    `${apiBase()}/api/auth/verify`,
    JSON.stringify({
      publicKey: input.publicKey,
      signature: input.signature,
      authScheme: 'hub',
    }),
    {
      Authorization: `Bearer ${input.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  )
  const verified = JSON.parse(verifyText) as {
    ok?: boolean
    address?: string
    verified?: boolean
  }
  if (!verified.ok) {
    throw new Error('Wallet signature was not accepted')
  }
  const session: WalletSession = {
    token: input.token,
    address: verified.address || input.address,
  }
  saveWalletSession(session)
  return session
}

/**
 * Register Hub redirect handlers + process return from Hub.
 * Call once on app boot (WalletProvider).
 */
export async function setupHubRedirectLogin(handlers: {
  onComplete: (session: WalletSession) => void
  onError: (err: Error) => void
  onStatus?: (message: string | null) => void
}): Promise<{ loginHandled: boolean }> {
  const hub = getHub()
  let loginHandled = false
  let pendingFinish: Promise<void> | null = null

  const finishLogin = async (result: {
    token: string
    address: string
    publicKey: string
    signature: string
  }) => {
    handlers.onStatus?.('Finishing login…')
    try {
      const session = await verifyHubLogin(result)
      loginHandled = true
      handlers.onStatus?.(null)
      handlers.onComplete(session)
    } catch (err) {
      handlers.onStatus?.(null)
      handlers.onError(err instanceof Error ? err : new Error(String(err)))
    }
  }

  if (!redirectHandlersReady) {
    redirectHandlersReady = true

    hub.on(RequestType.CHOOSE_ADDRESS, async chosen => {
      try {
        const { address } = chosen as ChooseAddressResult
        handlers.onStatus?.('Confirming with Nimiq Hub…')
        const { token, nonce } = await challengeForAddress(address)
        // Second full-page redirect: sign challenge (still no popup).
        await hub.signMessage(
          { appName: APP_NAME, message: nonce, signer: address },
          hubRedirectBehavior({ token }) as Parameters<typeof hub.signMessage>[1],
        )
      } catch (err) {
        if (isHubCancelError(err)) {
          handlers.onStatus?.(null)
          return
        }
        handlers.onStatus?.(null)
        clearStaleHubRpcState()
        handlers.onError(new Error(friendlyHubError(err)))
      }
    })

    hub.on(RequestType.SIGN_MESSAGE, (signed, state) => {
      try {
        const token = state?.token as string | undefined
        if (!token) throw new Error('Login session expired — try again.')
        const msg = signed as SignedMessage
        pendingFinish = finishLogin({
          token,
          address: msg.signer,
          publicKey: bytesToHex(msg.signerPublicKey),
          signature: bytesToHex(msg.signature),
        })
      } catch (err) {
        clearStaleHubRpcState()
        handlers.onError(new Error(friendlyHubError(err)))
      }
    })
  }

  try {
    await hub.checkRedirectResponse()
  } catch (err) {
    if (!isHubCancelError(err)) {
      clearStaleHubRpcState()
      handlers.onError(new Error(friendlyHubError(err)))
    }
  }

  if (pendingFinish) await pendingFinish

  return { loginHandled }
}

/**
 * Desktop: open system browser on OS-assigned free port; return session when browser POSTs it.
 * Web: full-page Hub redirect (completion via setupHubRedirectLogin).
 */
export async function loginWithNimiqHub(): Promise<WalletSession | 'redirecting'> {
  if (isDesktopSurface()) {
    return loginWithSystemBrowser()
  }
  return loginWithHubRedirect()
}

async function loginWithSystemBrowser(): Promise<WalletSession> {
  const w = window as unknown as {
    __TAURI_INTERNALS__?: {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
    }
  }
  const invoke = w.__TAURI_INTERNALS__?.invoke
  if (!invoke) {
    throw new Error('Desktop bridge unavailable — restart the app and try again.')
  }
  const raw = await invoke('login_via_system_browser')
  const session = raw as WalletSession
  if (!session?.token || !session?.address) {
    throw new Error('Login did not return a session')
  }
  saveWalletSession(session)
  return session
}

/** Web-only: full-page Hub redirect. Does not return — navigates away. */
async function loginWithHubRedirect(): Promise<'redirecting'> {
  const hub = getHub()
  clearStaleHubRpcState()
  try {
    sessionStorage.setItem(REDIRECT_STATUS_KEY, '1')
  } catch {
    /* ignore */
  }
  try {
    await hub.chooseAddress(
      { appName: APP_NAME },
      hubRedirectBehavior({ flow: 'login' }) as Parameters<typeof hub.chooseAddress>[1],
    )
  } catch (err) {
    clearStaleHubRpcState()
    if (isHubCancelError(err) || isHubRedirectError(err)) throw err
    throw new Error(friendlyHubError(err))
  }
  throw new Error(HUB_REDIRECT_MESSAGE)
}

export function consumeRedirectStatusFlag(): boolean {
  try {
    const v = sessionStorage.getItem(REDIRECT_STATUS_KEY)
    if (v) {
      sessionStorage.removeItem(REDIRECT_STATUS_KEY)
      return true
    }
  } catch {
    /* ignore */
  }
  return false
}
