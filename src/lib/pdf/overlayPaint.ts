/**
 * Lightweight overlay paint for verify-style reconstruction.
 * Coordinates are normalized [0,1] page fractions (origin top-left).
 */

import type { SignaturePathData } from './annotations'

export type OverlayKind = 'signature' | 'initial' | 'text' | 'checkmark' | 'cross' | 'name'

export interface OverlayField {
  id: string
  pageIndex: number
  x: number
  y: number
  width: number
  height: number
  kind: OverlayKind
  /** Optional ink image (data URL). */
  imageDataUrl?: string | null
  /** Vector ink from placement fills — preferred over image when present. */
  path?: SignaturePathData | null
  /** Optional label when ink is missing (empty field outline). */
  label?: string
  text?: string
  color?: string
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function rectOf(f: OverlayField, w: number, h: number) {
  return {
    left: clamp01(f.x) * w,
    top: clamp01(f.y) * h,
    width: Math.max(1, clamp01(f.width) * w),
    height: Math.max(1, clamp01(f.height) * h),
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load overlay image'))
    img.src = src.startsWith('data:') ? src : `data:image/png;base64,${src}`
  })
}

function paintOutline(
  ctx: CanvasRenderingContext2D,
  rect: { left: number; top: number; width: number; height: number },
  label: string,
  color: string,
): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.setLineDash([5, 4])
  ctx.strokeRect(rect.left, rect.top, rect.width, rect.height)
  ctx.setLineDash([])
  const fontPx = Math.max(9, Math.min(14, rect.height * 0.28))
  ctx.font = `600 ${fontPx}px system-ui, -apple-system, sans-serif`
  ctx.fillStyle = color
  ctx.textBaseline = 'top'
  const pad = 4
  ctx.fillText(label, rect.left + pad, rect.top + pad, Math.max(8, rect.width - pad * 2))
  ctx.restore()
}

function paintMark(
  ctx: CanvasRenderingContext2D,
  kind: 'checkmark' | 'cross',
  rect: { left: number; top: number; width: number; height: number },
  color: string,
): void {
  const pad = Math.min(rect.width, rect.height) * 0.15
  const x0 = rect.left + pad
  const y0 = rect.top + pad
  const x1 = rect.left + rect.width - pad
  const y1 = rect.top + rect.height - pad
  const lw = Math.max(2, Math.min(rect.width, rect.height) * 0.12)
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  if (kind === 'checkmark') {
    const midX = x0 + (x1 - x0) * 0.32
    const midY = y1 - (y1 - y0) * 0.08
    ctx.moveTo(x0, y0 + (y1 - y0) * 0.45)
    ctx.lineTo(midX, midY)
    ctx.lineTo(x1, y0)
  } else {
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.moveTo(x1, y0)
    ctx.lineTo(x0, y1)
  }
  ctx.stroke()
  ctx.restore()
}

function fitCaptureRect(
  outer: { left: number; top: number; width: number; height: number },
  captureAspect: number,
): { left: number; top: number; width: number; height: number } {
  const aspect = Number.isFinite(captureAspect) && captureAspect > 0.05 ? captureAspect : 1
  let width = outer.width
  let height = width / aspect
  if (height > outer.height) {
    height = outer.height
    width = height * aspect
  }
  return {
    left: outer.left + (outer.width - width) / 2,
    top: outer.top + (outer.height - height) / 2,
    width,
    height,
  }
}

/** Paint stroke path into a field box (path coords are 0–1 on the capture pad). */
function paintSignaturePath(
  ctx: CanvasRenderingContext2D,
  path: SignaturePathData,
  rect: { left: number; top: number; width: number; height: number },
  color = '#0f172a',
): void {
  const drawRect =
    path.captureAspect != null && path.captureAspect > 0
      ? fitCaptureRect(rect, path.captureAspect)
      : rect
  const minSide = Math.min(drawRect.width, drawRect.height)
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(1, path.lineWidthRatio * minSide)
  for (const stroke of path.strokes) {
    if (stroke.points.length === 0) continue
    ctx.beginPath()
    const p0 = stroke.points[0]!
    ctx.moveTo(drawRect.left + p0.x * drawRect.width, drawRect.top + p0.y * drawRect.height)
    for (let i = 1; i < stroke.points.length; i++) {
      const p = stroke.points[i]!
      ctx.lineTo(drawRect.left + p.x * drawRect.width, drawRect.top + p.y * drawRect.height)
    }
    ctx.stroke()
  }
  ctx.restore()
}

export async function paintOverlay(
  ctx: CanvasRenderingContext2D,
  field: OverlayField,
  canvasWidth: number,
  canvasHeight: number,
): Promise<void> {
  const rect = rectOf(field, canvasWidth, canvasHeight)
  const accent = field.color ?? '#0d9488'

  if (field.kind === 'checkmark' || field.kind === 'cross') {
    paintMark(ctx, field.kind, rect, accent)
    return
  }

  if (field.kind === 'text' || field.kind === 'name') {
    if (field.text) {
      const fontPx = Math.max(10, canvasHeight * 0.02)
      ctx.save()
      ctx.fillStyle = field.color ?? '#0f172a'
      ctx.font = `${fontPx}px system-ui, -apple-system, sans-serif`
      ctx.textBaseline = 'top'
      ctx.fillText(field.text, rect.left, rect.top, rect.width)
      ctx.restore()
      return
    }
    paintOutline(ctx, rect, field.label || (field.kind === 'name' ? 'Name' : 'Text'), accent)
    return
  }

  // signature / initial — prefer vector path (all parties' fill frames)
  if (field.path && field.path.strokes.length > 0) {
    paintSignaturePath(ctx, field.path, rect)
    return
  }
  if (field.imageDataUrl) {
    try {
      const img = await loadImage(field.imageDataUrl)
      ctx.drawImage(img, rect.left, rect.top, rect.width, rect.height)
      return
    } catch {
      /* fall through to outline */
    }
  }
  paintOutline(
    ctx,
    rect,
    field.label || (field.kind === 'initial' ? 'Initial' : 'Signature'),
    accent,
  )
}
