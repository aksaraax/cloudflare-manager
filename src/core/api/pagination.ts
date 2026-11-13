import { mapConcurrent } from '../utils/concurrency.js'

export interface RawPage {
  result?: unknown[] | null
  result_info?: { total_pages?: number } | null
}

const PAGE_CONCURRENCY = 8

export async function fetchAllPages(
  fetchPage: (page: number) => Promise<RawPage>,
  perPage: number,
): Promise<Record<string, unknown>[]> {
  const first = await fetchPage(1)
  const items = [...(first.result ?? [])]
  const totalPages = first.result_info?.total_pages

  if (totalPages === undefined) {
    let lastCount = items.length
    for (let page = 2; lastCount >= perPage; page++) {
      const result = (await fetchPage(page)).result ?? []
      lastCount = result.length
      items.push(...result)
    }
  } else if (totalPages > 1) {
    const remaining = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
    const pages = await mapConcurrent(remaining, PAGE_CONCURRENCY, fetchPage)
    for (const page of pages) items.push(...(page.result ?? []))
  }

  return items as Record<string, unknown>[]
}
