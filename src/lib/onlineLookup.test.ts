import { describe, expect, it, vi } from 'vitest'
import { lookupHashOnline, onlineVerifyUrl } from './onlineLookup'

const SHA = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

describe('onlineLookup', () => {
  it('posts only sha256', async () => {
    const payload = {
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
    }
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(Object.keys(body)).toEqual(['sha256'])
      expect(body.sha256).toBe(SHA)
      return {
        ok: true,
        text: async () => JSON.stringify(payload),
        json: async () => payload,
      } as Response
    })

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

  it('maps Load failed to a friendly message', async () => {
    const prev = globalThis.fetch
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Load failed')
    }) as unknown as typeof fetch
    try {
      const r = await lookupHashOnline('https://verilock.online', SHA)
      expect(r).toEqual(
        expect.objectContaining({
          ok: false,
          error: expect.stringMatching(/Could not reach verilock\.online/i),
        }),
      )
      if (r.ok === false) {
        expect(r.error).not.toMatch(/^Load failed$/)
      }
    } finally {
      globalThis.fetch = prev
    }
  })
})
