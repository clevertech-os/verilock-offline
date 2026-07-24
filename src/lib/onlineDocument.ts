/**
 * Fetch agreement metadata + field layout from verilock.online.
 * Never sends the document file — only fingerprint / ids / optional session token.
 *
 * Multi-party ink loading mirrors verilock.online SignedDocumentView:
 * 1) Prefer placement fill wire frames (all parties' strokes/text) when authorized
 * 2) Fall back to per-signature image URLs with 1-based personSlotIndex mapping
 */

import { DEFAULT_ONLINE_API_BASE } from './config'
import type { SignaturePathData } from './pdf/annotations'
import type { OverlayField, OverlayKind } from './pdf/overlayPaint'
import type { PlacementSlot } from './pdf/placements'
import { reconstructAnnotationsFromPlanAndFills } from './pdf/placementStream'
import { httpGetImageDataUrl, httpGetText, httpPostJson } from './tauriHttp'

export interface OnlineAgreementMeta {
  id: string
  slug: string
  title: string
  status: string
  originalFilename: string | null
  finalSha256: string | null
  originalSha256?: string | null
  participantDetailsRevealed?: boolean
}

export type OverlayLoadResult =
  | {
      ok: true
      agreement: OnlineAgreementMeta
      fields: OverlayField[]
      /** True when ink images/fills were available for this viewer. */
      hasInk: boolean
      note: string
    }
  | { ok: false; error: string }

interface PublicParty {
  id: string
  displayName?: string | null
  walletAddress?: string | null
  required?: boolean
}

interface PublicSignature {
  id: string
  partyId: string
  imageUrl?: string | null
  hasImage?: boolean
  signatureType?: string
  signerAddress?: string
}

interface PublicDoc {
  id: string
  slug: string
  title: string
  status: string
  originalFilename: string | null
  finalSha256: string | null
  originalSha256?: string | null
  participantDetailsRevealed?: boolean
  annotations?: Array<Record<string, unknown>> | null
  parties?: PublicParty[]
  signatures?: PublicSignature[]
}

interface PlacementPerson {
  slotIndex: number
  displayName?: string
  walletAddress?: string | null
}

interface PlacementPlanResponse {
  plan: {
    slots?: Array<{
      id: string
      personSlotIndex: number
      kind: string
      pageIndex: number
      x: number
      y: number
      width: number
      height: number
      lockedContent?: {
        text?: string
        mark?: 'checkmark' | 'cross'
        fontSizeRatio?: number
        color?: string
      }
    }>
    people?: PlacementPerson[]
  } | null
  fillPayloadRevealed?: boolean
  filledSlotIds?: string[]
  fillBatches?: Array<{
    personSlotIndex?: number
    signerAddress?: string
    framesHex?: string[] | null
  }>
}

function baseUrl(apiBase?: string): string {
  return (apiBase ?? DEFAULT_ONLINE_API_BASE).replace(/\/$/, '')
}

function authHeaders(token?: string | null): Record<string, string> | undefined {
  if (!token?.trim()) return undefined
  return { Authorization: `Bearer ${token.trim()}` }
}

function normalizeAddr(addr: string | null | undefined): string {
  return (addr ?? '').replace(/\s/g, '').toUpperCase()
}

function kindFromWire(raw: string): OverlayKind {
  const k = raw.toLowerCase()
  if (k === 'initial' || k === 'initials') return 'initial'
  if (k === 'text') return 'text'
  if (k === 'name') return 'name'
  if (k === 'checkmark' || k === 'check') return 'checkmark'
  if (k === 'cross') return 'cross'
  return 'signature'
}

function labelForKind(kind: OverlayKind): string {
  switch (kind) {
    case 'initial':
      return 'Initial'
    case 'text':
      return 'Text'
    case 'name':
      return 'Name'
    case 'checkmark':
      return 'Check'
    case 'cross':
      return 'Mark'
    default:
      return 'Signature'
  }
}

function fieldHasInk(f: OverlayField): boolean {
  return (
    Boolean(f.imageDataUrl) ||
    Boolean(f.path?.strokes?.length) ||
    Boolean(f.text) ||
    f.kind === 'checkmark' ||
    f.kind === 'cross'
  )
}

function annotationsToFields(anns: Array<Record<string, unknown>> | null | undefined): OverlayField[] {
  if (!anns?.length) return []
  const out: OverlayField[] = []
  for (const a of anns) {
    const type = String(a.type ?? 'signature')
    const kind = kindFromWire(type)
    const id = String(a.id ?? `ann_${out.length}`)
    const pageIndex = Number(a.pageIndex)
    const x = Number(a.x)
    const y = Number(a.y)
    const width = Number(a.width)
    const height = Number(a.height)
    if (![pageIndex, x, y, width, height].every(Number.isFinite)) continue
    const imageDataUrl =
      typeof a.imageDataUrl === 'string'
        ? a.imageDataUrl
        : typeof a.imageData === 'string'
          ? a.imageData
          : null
    const path =
      a.path && typeof a.path === 'object' ? (a.path as SignaturePathData) : null
    out.push({
      id,
      pageIndex,
      x,
      y,
      width,
      height,
      kind,
      imageDataUrl,
      path,
      text: typeof a.text === 'string' ? a.text : undefined,
      color: typeof a.color === 'string' ? a.color : undefined,
      label: labelForKind(kind),
    })
  }
  return out
}

async function fetchDocument(
  apiBase: string,
  idOrSlug: string,
  token?: string | null,
): Promise<PublicDoc> {
  const url = `${baseUrl(apiBase)}/api/documents/${encodeURIComponent(idOrSlug)}`
  const text = await httpGetText(url, authHeaders(token))
  const data = JSON.parse(text) as { document?: PublicDoc } & PublicDoc
  return data.document ?? data
}

async function fetchPlacementPlan(
  apiBase: string,
  sha256: string,
  documentId?: string | null,
  token?: string | null,
): Promise<PlacementPlanResponse | null> {
  const q =
    documentId && documentId.trim()
      ? `?documentId=${encodeURIComponent(documentId.trim())}`
      : ''
  const url = `${baseUrl(apiBase)}/api/placement-plans/${sha256.toLowerCase()}${q}`
  try {
    const text = await httpGetText(url, authHeaders(token))
    return JSON.parse(text) as PlacementPlanResponse
  } catch {
    return null
  }
}

async function resolveSignatureImage(
  apiBase: string,
  imageUrl: string,
  token?: string | null,
): Promise<string | null> {
  const absolute = imageUrl.startsWith('http')
    ? imageUrl
    : `${baseUrl(apiBase)}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`
  return httpGetImageDataUrl(absolute, authHeaders(token))
}

/**
 * personSlotIndex is 1-based ("Person 1"). Map each person index → party id
 * using wallet, display name, then ordered required parties (same as product).
 */
function buildPersonToPartyMap(
  people: PlacementPerson[],
  parties: PublicParty[],
  fillBatches?: PlacementPlanResponse['fillBatches'],
): Map<number, string> {
  // Match product: prefer required parties; otherwise stable id order.
  const required = parties.filter(p => p.required)
  const ordered =
    required.length > 0
      ? required
      : [...parties].sort((a, b) => a.id.localeCompare(b.id))

  const personToParty = new Map<number, string>()

  for (const person of people) {
    const personWallet = normalizeAddr(person.walletAddress)
    const byWallet =
      personWallet &&
      ordered.find(p => p.walletAddress && normalizeAddr(p.walletAddress) === personWallet)
    if (byWallet) {
      personToParty.set(person.slotIndex, byWallet.id)
      continue
    }
    const byName =
      person.displayName?.trim() &&
      ordered.find(
        p =>
          p.displayName?.trim() &&
          p.displayName.trim().toLowerCase() === person.displayName!.trim().toLowerCase(),
      )
    if (byName) {
      personToParty.set(person.slotIndex, byName.id)
      continue
    }
    // 1-based person index → ordered party (NOT orderedParties[personSlotIndex] as 0-based)
    const byIndex = ordered[person.slotIndex - 1]
    if (byIndex) personToParty.set(person.slotIndex, byIndex.id)
  }

  if (people.length === 0) {
    ordered.forEach((p, i) => personToParty.set(i + 1, p.id))
  }

  // Fill batches often carry the signer wallet even when plan people omit wallets.
  for (const batch of fillBatches ?? []) {
    const personIdx = batch.personSlotIndex
    if (personIdx == null || personToParty.has(personIdx)) continue
    const signer = normalizeAddr(batch.signerAddress)
    if (!signer) continue
    const party = ordered.find(
      p => p.walletAddress && normalizeAddr(p.walletAddress) === signer,
    )
    if (party) personToParty.set(personIdx, party.id)
  }

  return personToParty
}

function slotsFromPlan(plan: PlacementPlanResponse['plan']): PlacementSlot[] {
  return (plan?.slots ?? []).map(s => ({
    id: s.id,
    personSlotIndex: s.personSlotIndex,
    kind: kindFromWire(s.kind || 'signature') as PlacementSlot['kind'],
    pageIndex: s.pageIndex,
    x: s.x,
    y: s.y,
    width: s.width,
    height: s.height,
    ...(s.lockedContent ? { lockedContent: s.lockedContent } : {}),
  }))
}

/** Convert reconstructed PdfAnnotations into overlay fields. */
function annotationsFromFillsToFields(
  anns: Awaited<ReturnType<typeof reconstructAnnotationsFromPlanAndFills>>['annotations'],
  slotKindById: Map<string, OverlayKind>,
): OverlayField[] {
  return anns.map(a => {
    const kind =
      a.type === 'checkmark' || a.type === 'cross'
        ? a.type
        : a.type === 'text'
          ? (slotKindById.get(a.id) === 'name' ? 'name' : 'text')
          : (slotKindById.get(a.id) === 'initial' ? 'initial' : 'signature')
    return {
      id: a.id,
      pageIndex: a.pageIndex,
      x: a.x,
      y: a.y,
      width: a.width,
      height: a.height,
      kind,
      imageDataUrl: a.type === 'signature' ? a.imageDataUrl || null : null,
      path: a.type === 'signature' ? a.path ?? null : null,
      text: a.type === 'text' ? a.text : undefined,
      color: a.type === 'text' || a.type === 'checkmark' || a.type === 'cross' ? a.color : undefined,
      label: labelForKind(kind),
    } satisfies OverlayField
  })
}

/**
 * Stamp wallet signature images onto signature/initial slots (fallback when
 * fill frames are unavailable). Uses 1-based personSlotIndex mapping.
 */
async function fieldsFromSignatureImages(input: {
  apiBase: string
  slots: PlacementSlot[]
  people: PlacementPerson[]
  parties: PublicParty[]
  signatures: PublicSignature[]
  fillBatches?: PlacementPlanResponse['fillBatches']
  sessionToken?: string | null
}): Promise<OverlayField[]> {
  const { slots, people, parties, signatures, sessionToken, apiBase, fillBatches } = input
  if (!slots.length || !signatures.length) return []

  const personToParty = buildPersonToPartyMap(people, parties, fillBatches)
  const imageByParty = new Map<string, string>()

  await Promise.all(
    signatures.map(async sig => {
      if (!sig.imageUrl) return
      const dataUrl = await resolveSignatureImage(apiBase, sig.imageUrl, sessionToken)
      if (dataUrl) imageByParty.set(sig.partyId, dataUrl)
    }),
  )

  const out: OverlayField[] = []
  for (const slot of slots) {
    const kind = kindFromWire(slot.kind)
    if (kind === 'checkmark' || kind === 'cross') {
      if (slot.lockedContent?.mark) {
        out.push({
          id: slot.id,
          pageIndex: slot.pageIndex,
          x: slot.x,
          y: slot.y,
          width: slot.width,
          height: slot.height,
          kind: slot.lockedContent.mark,
          color: slot.lockedContent.color,
          label: labelForKind(slot.lockedContent.mark),
        })
      }
      continue
    }
    if (kind === 'name' || kind === 'text') {
      if (slot.lockedContent?.text) {
        out.push({
          id: slot.id,
          pageIndex: slot.pageIndex,
          x: slot.x,
          y: slot.y,
          width: slot.width,
          height: slot.height,
          kind,
          text: slot.lockedContent.text,
          color: slot.lockedContent.color ?? '#0f172a',
          label: labelForKind(kind),
        })
      }
      continue
    }
    // signature / initial
    const partyId = personToParty.get(slot.personSlotIndex)
    const imageDataUrl = partyId ? imageByParty.get(partyId) ?? null : null
    out.push({
      id: slot.id,
      pageIndex: slot.pageIndex,
      x: slot.x,
      y: slot.y,
      width: slot.width,
      height: slot.height,
      kind,
      imageDataUrl,
      label: labelForKind(kind),
    })
  }
  return out
}

/**
 * Layout-only fields (empty boxes + locked content) when ink is not yet unlocked.
 */
function layoutOnlyFields(slots: PlacementSlot[]): OverlayField[] {
  return slots.map(slot => {
    const kind = kindFromWire(slot.kind)
    return {
      id: slot.id,
      pageIndex: slot.pageIndex,
      x: slot.x,
      y: slot.y,
      width: slot.width,
      height: slot.height,
      kind,
      imageDataUrl: null,
      text:
        kind === 'text' || kind === 'name'
          ? slot.lockedContent?.text
          : undefined,
      color: slot.lockedContent?.color,
      label: labelForKind(kind),
    }
  })
}

/**
 * Load overlays for a local fingerprint from verilock.online.
 * Prefer locked agreements when multiple match.
 */
export async function loadOnlineOverlays(options: {
  sha256: string
  apiBase?: string
  /** Optional product session token — unlocks party-private ink when you are a participant. */
  sessionToken?: string | null
  /** Prefer this agreement id/slug when known. */
  documentIdOrSlug?: string | null
}): Promise<OverlayLoadResult> {
  const apiBase = baseUrl(options.apiBase)
  const hash = options.sha256.toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    return { ok: false, error: 'Not a valid document fingerprint' }
  }

  try {
    let doc: PublicDoc | null = null

    if (options.documentIdOrSlug?.trim()) {
      doc = await fetchDocument(apiBase, options.documentIdOrSlug.trim(), options.sessionToken)
    } else {
      const lookupText = await httpPostJson(
        `${apiBase}/api/verify/hash`,
        JSON.stringify({ sha256: hash }),
      )
      const lookup = JSON.parse(lookupText) as {
        matches?: Array<{ id: string; slug: string; status: string }>
      }
      const matches = Array.isArray(lookup.matches) ? lookup.matches : []
      if (matches.length === 0) {
        return {
          ok: false,
          error: 'No agreement on verilock.online matches this fingerprint.',
        }
      }
      const preferred =
        matches.find(m => m.status === 'locked') ??
        matches.find(m => m.status === 'locking') ??
        matches[0]!
      doc = await fetchDocument(apiBase, preferred.slug || preferred.id, options.sessionToken)
    }

    const agreement: OnlineAgreementMeta = {
      id: doc.id,
      slug: doc.slug,
      title: doc.title,
      status: doc.status,
      originalFilename: doc.originalFilename,
      finalSha256: doc.finalSha256,
      originalSha256: doc.originalSha256,
      participantDetailsRevealed: doc.participantDetailsRevealed,
    }

    // Prefer original hash for placement plan (plan is stored under original file hash).
    const planHash = (doc.originalSha256 || hash).toLowerCase()
    const plan = await fetchPlacementPlan(apiBase, planHash, doc.id, options.sessionToken)
    const legacyFields = annotationsToFields(doc.annotations)

    const slots = slotsFromPlan(plan?.plan ?? null)
    const people: PlacementPerson[] = (plan?.plan?.people ?? []).map(p => ({
      slotIndex: p.slotIndex,
      displayName: p.displayName,
      walletAddress: p.walletAddress ?? null,
    }))
    const parties = doc.parties ?? []
    const signatures = doc.signatures ?? []
    const fillBatches = plan?.fillBatches ?? []
    const hasFrames =
      plan?.fillPayloadRevealed === true &&
      fillBatches.some(b => Array.isArray(b.framesHex) && b.framesHex.length > 0)

    // 1) Prefer vector fill frames — includes every party's ink, not just yours.
    if (slots.length > 0 && hasFrames) {
      try {
        const { annotations: fromFills, filledCount } =
          await reconstructAnnotationsFromPlanAndFills({
            slots,
            fillBatches,
          })
        if (fromFills.length > 0) {
          const slotKindById = new Map(slots.map(s => [s.id, kindFromWire(s.kind)]))
          const fields = annotationsFromFillsToFields(fromFills, slotKindById)
          const hasInk = fields.some(fieldHasInk)
          return {
            ok: true,
            agreement,
            fields,
            hasInk,
            note:
              filledCount > 0
                ? 'Signatures loaded from verilock.online onto your local copy (all parties).'
                : 'Field layout loaded from verilock.online.',
          }
        }
      } catch {
        /* fall through to image / layout fallbacks */
      }
    }

    // 2) Fallback: stamp stored signature images for every party that has ink.
    if (slots.length > 0 && signatures.some(s => s.imageUrl || s.hasImage)) {
      const fromImages = await fieldsFromSignatureImages({
        apiBase,
        slots,
        people,
        parties,
        signatures,
        fillBatches,
        sessionToken: options.sessionToken,
      })
      if (fromImages.length > 0) {
        const hasInk = fromImages.some(fieldHasInk)
        return {
          ok: true,
          agreement,
          fields: fromImages,
          hasInk,
          note: hasInk
            ? hasFrames
              ? 'Signatures placed from recorded ink images.'
              : 'Signatures loaded from verilock.online onto your local copy (all parties).'
            : 'Field layout loaded. Log in with Nimiq (as a party on this agreement) to unlock signature ink.',
        }
      }
    }

    // 3) Locked content / empty boxes / legacy annotations
    if (slots.length > 0) {
      try {
        const { annotations: lockedOnly } = await reconstructAnnotationsFromPlanAndFills({
          slots,
          fillBatches: [],
        })
        const slotKindById = new Map(slots.map(s => [s.id, kindFromWire(s.kind)]))
        const fromLocked =
          lockedOnly.length > 0
            ? annotationsFromFillsToFields(lockedOnly, slotKindById)
            : layoutOnlyFields(slots)
        const fields = fromLocked.length > 0 ? fromLocked : legacyFields
        const hasInk = fields.some(fieldHasInk)
        return {
          ok: true,
          agreement,
          fields,
          hasInk,
          note: hasInk
            ? 'Signatures loaded from verilock.online onto your local copy.'
            : 'Field layout loaded. Log in with Nimiq (as a party on this agreement) to unlock signature ink.',
        }
      } catch {
        const fields = layoutOnlyFields(slots)
        return {
          ok: true,
          agreement,
          fields,
          hasInk: false,
          note:
            'Field layout loaded. Log in with Nimiq (as a party on this agreement) to unlock signature ink.',
        }
      }
    }

    if (legacyFields.length > 0) {
      const hasInk = legacyFields.some(fieldHasInk)
      return {
        ok: true,
        agreement,
        fields: legacyFields,
        hasInk,
        note: hasInk
          ? 'Signatures loaded from verilock.online onto your local copy.'
          : 'Field layout loaded. Log in with Nimiq (as a party on this agreement) to unlock signature ink.',
      }
    }

    return {
      ok: true,
      agreement,
      fields: [],
      hasInk: false,
      note: 'Agreement found online, but no field layout was available. Showing your local PDF only.',
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/Failed to fetch|NetworkError|Load failed|CORS/i.test(msg)) {
      return {
        ok: false,
        error:
          'Could not reach verilock.online. Check your connection. Overlay loading needs the product API.',
      }
    }
    return { ok: false, error: msg }
  }
}
