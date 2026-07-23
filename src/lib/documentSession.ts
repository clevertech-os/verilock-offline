/**
 * Shared document selection across panels (same file, one local hash).
 * File bytes stay in memory only — never serialized to storage or network.
 */

import { hashFile } from './hash'

export type DocumentSession = {
  file: File
  sha256: string
  size: number
  hashedAt: number
}

export async function createDocumentSession(file: File): Promise<DocumentSession> {
  const { sha256, size } = await hashFile(file)
  return {
    file,
    sha256,
    size,
    hashedAt: Date.now(),
  }
}
