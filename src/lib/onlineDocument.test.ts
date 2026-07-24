import { describe, expect, it } from 'vitest'

/**
 * personSlotIndex is 1-based in product plans ("Person 1"). Offline previously
 * used orderedParties[personSlotIndex] (0-based), which mis-mapped multi-party ink.
 */
function mapPersonToPartyIndex(personSlotIndex: number, partyCount: number): number | null {
  const idx = personSlotIndex - 1
  if (idx < 0 || idx >= partyCount) return null
  return idx
}

describe('personSlotIndex mapping', () => {
  it('maps Person 1 and Person 2 to first and second parties', () => {
    expect(mapPersonToPartyIndex(1, 2)).toBe(0)
    expect(mapPersonToPartyIndex(2, 2)).toBe(1)
  })

  it('does not treat personSlotIndex as a 0-based array index', () => {
    // Old bug: orderedParties[1] for Person 1 when only two parties → second party only
    expect(mapPersonToPartyIndex(1, 2)).not.toBe(1)
    expect(mapPersonToPartyIndex(2, 2)).not.toBe(2)
  })

  it('returns null for out-of-range person indexes', () => {
    expect(mapPersonToPartyIndex(0, 2)).toBeNull()
    expect(mapPersonToPartyIndex(3, 2)).toBeNull()
  })
})
