import { describe, expect, it, vi } from 'vitest'
import { lookupHashOnline, onlineVerifyUrl } from './onlineLookup'

const SHA = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

describe('onlineLookup', () => {
  it('posts only sha256', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(Object.keys(body)).toEqual(['sha256'])
      expect(body.sha256).toBe(SHA)
      return {
        ok: true,
        json: async () => ({
          matches: [
            {
              id: '1',
              slug: 'abc',
              title: 'Doc',
              originalFilename: null,
              status: 'locked',
              finalSha256: SHA,
              createdAt: 1,
              lockedAt: 2,
            },
          ],
        }),
      } as Response
    })

    // inject via global temporarily
    const prev = globalThis.fetch
    globalThis.fetch = fetchImpl as unknown as typeof fetch
    try {
      const r = await lookupHashOnline('https://verilock.online', SHA)
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.matches).toHaveLength(1)
    } finally {
      globalThis.fetch = prev
    }
  })

  it('builds verify url', () => {
    expect(onlineVerifyUrl('https://verilock.online/', 'my-slug')).toBe(
      'https://verilock.online/v/my-slug',
    )
  })

  it('rejects invalid hash', async () => {
    const r = await lookupHashOnline('https://verilock.online', 'nope')
    expect(r.ok).toBe(false)
  })
})
