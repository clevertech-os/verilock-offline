/**
 * Minimal annotation types for placement fill reconstruction.
 * Coordinates are normalized [0,1] page fractions (origin top-left).
 */

export type PdfAnnotationType = 'signature' | 'text' | 'checkmark' | 'cross'

export interface AnnotationGeometry {
  pageIndex: number
  x: number
  y: number
  width: number
  height: number
}

export interface SignaturePathStroke {
  points: Array<{ x: number; y: number }>
}

/**
 * Vector ink for signature/initial slots.
 * Points are in [0,1]² relative to the capture pad.
 */
export interface SignaturePathData {
  epsilon: number
  lineWidthRatio: number
  strokes: SignaturePathStroke[]
  /** Capture pad width ÷ height — paint letterboxes when set. */
  captureAspect?: number
}

export interface SignatureAnnotation extends AnnotationGeometry {
  id: string
  type: 'signature'
  imageDataUrl: string
  path?: SignaturePathData
}

export interface TextAnnotation extends AnnotationGeometry {
  id: string
  type: 'text'
  text: string
  fontSizeRatio?: number
  color?: string
}

export interface MarkAnnotation extends AnnotationGeometry {
  id: string
  type: 'checkmark' | 'cross'
  color?: string
}

export type PdfAnnotation = SignatureAnnotation | TextAnnotation | MarkAnnotation
