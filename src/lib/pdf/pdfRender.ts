/**
 * Local-only PDF rendering via pdf.js.
 * File bytes stay in the browser / desktop webview — never uploaded.
 */
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy } from 'pdfjs-dist'

let workerReady: Promise<void> | null = null

async function ensureWorker(): Promise<void> {
  if (!workerReady) {
    workerReady = import('pdfjs-dist').then(pdfjs => {
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    })
  }
  return workerReady
}

export async function loadPdfFromFile(file: File): Promise<PDFDocumentProxy> {
  await ensureWorker()
  const pdfjs = await import('pdfjs-dist')
  const data = new Uint8Array(await file.arrayBuffer())
  return pdfjs.getDocument({ data }).promise
}

export interface RenderedPage {
  canvas: HTMLCanvasElement
  cssWidth: number
  cssHeight: number
  pageNumber: number
}

/** Render 1-based page to a canvas (CSS-pixel paint space after transform). */
export async function renderPdfPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  targetCssWidth: number,
): Promise<RenderedPage> {
  const page = await doc.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  const scale = Math.max(0.5, targetCssWidth / base.width)
  const viewport = page.getViewport({ scale })
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1

  const canvas = document.createElement('canvas')
  const cssWidth = viewport.width
  const cssHeight = viewport.height
  canvas.width = Math.floor(cssWidth * dpr)
  canvas.height = Math.floor(cssHeight * dpr)
  canvas.style.width = `${cssWidth}px`
  canvas.style.height = `${cssHeight}px`

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get canvas context')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, cssWidth, cssHeight)
  await page.render({ canvasContext: ctx, viewport }).promise
  // Restore CSS-pixel space for overlays.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  return { canvas, cssWidth, cssHeight, pageNumber }
}

export function isPdfFile(file: File): boolean {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) return true
  return file.type === 'application/pdf' || file.type === 'application/x-pdf'
}
