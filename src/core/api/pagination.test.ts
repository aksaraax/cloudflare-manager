import { describe, it, expect, vi } from 'vitest'
import { fetchAllPages, type RawPage } from './pagination.js'

function makePages(total: number, perPage: number, withInfo: boolean): (page: number) => Promise<RawPage> {
  const all = Array.from({ length: total }, (_, i) => ({ id: i }))
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  return async (page) => ({
    result: all.slice((page - 1) * perPage, page * perPage),
    ...(withInfo ? { result_info: { total_pages: totalPages } } : {}),
  })
}

describe('fetchAllPages', () => {
  it('collects every page in order when total_pages is reported', async () => {
    const fetchPage = vi.fn(makePages(137, 50, true))
    const items = await fetchAllPages(fetchPage, 50)
    expect(items.map((i) => i['id'])).toEqual(Array.from({ length: 137 }, (_, i) => i))
    expect(fetchPage).toHaveBeenCalledTimes(3)
  })

  it('makes a single request when everything fits on one page', async () => {
    const fetchPage = vi.fn(makePages(12, 50, true))
    expect(await fetchAllPages(fetchPage, 50)).toHaveLength(12)
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('walks pages sequentially until a short page when total_pages is missing', async () => {
    const fetchPage = vi.fn(makePages(120, 50, false))
    expect(await fetchAllPages(fetchPage, 50)).toHaveLength(120)
    expect(fetchPage).toHaveBeenCalledTimes(3)
  })

  it('handles an empty result', async () => {
    expect(await fetchAllPages(async () => ({ result: null }), 50)).toEqual([])
  })
})
