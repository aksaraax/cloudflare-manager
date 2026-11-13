import { describe, it, expect } from 'vitest'
import { mapConcurrent } from './concurrency.js'

describe('mapConcurrent', () => {
  it('preserves input order regardless of completion order', async () => {
    const result = await mapConcurrent([30, 5, 15], 3, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms))
      return ms * 2
    })
    expect(result).toEqual([60, 10, 30])
  })

  it('never exceeds the concurrency limit', async () => {
    let active = 0
    let peak = 0
    await mapConcurrent(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 2))
      active--
    })
    expect(peak).toBe(4)
  })

  it('returns an empty array for empty input', async () => {
    expect(await mapConcurrent([], 5, async (x) => x)).toEqual([])
  })
})
