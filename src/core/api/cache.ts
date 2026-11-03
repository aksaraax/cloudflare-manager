import { ApiError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { withRetry } from '../utils/retry.js'
import { getClient } from './client.js'

export interface PurgeResult {
  requestId: string
  purgedCount: number
}

const PURGE_CHUNK_SIZE = 30

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

function extractRequestId(raw: unknown): string {
  if (raw !== null && typeof raw === 'object' && 'id' in raw) {
    const id = (raw as Record<string, unknown>)['id']
    if (typeof id === 'string') {
      return id
    }
  }
  return ''
}

export async function purgeEverything(apiToken: string, zoneId: string): Promise<PurgeResult> {
  return withRetry(async () => {
    try {
      const client = getClient(apiToken)
      const result = await client.cache.purge({ zone_id: zoneId, purge_everything: true })
      logger.info('cache purged everything', { zoneId })
      return { requestId: extractRequestId(result), purgedCount: 1 }
    } catch (err) {
      throw new ApiError(
        'CACHE_PURGE_EVERYTHING_FAILED',
        `Failed to purge everything for zone ${zoneId}`,
        undefined,
        undefined,
        err,
      )
    }
  })
}

export async function purgeByUrls(
  apiToken: string,
  zoneId: string,
  urls: string[],
): Promise<PurgeResult> {
  const chunks = chunkArray(urls, PURGE_CHUNK_SIZE)
  let lastRequestId = ''
  let totalPurged = 0

  for (const chunk of chunks) {
    await withRetry(async () => {
      try {
        const client = getClient(apiToken)
        const result = await client.cache.purge({ zone_id: zoneId, files: chunk })
        lastRequestId = extractRequestId(result)
        totalPurged += chunk.length
        logger.debug('cache purged urls chunk', { zoneId, count: chunk.length })
      } catch (err) {
        throw new ApiError(
          'CACHE_PURGE_URLS_FAILED',
          `Failed to purge URLs for zone ${zoneId}`,
          undefined,
          undefined,
          err,
        )
      }
    })
  }

  logger.info('cache purged by urls', { zoneId, totalPurged })
  return { requestId: lastRequestId, purgedCount: totalPurged }
}

export async function purgeByTags(
  apiToken: string,
  zoneId: string,
  tags: string[],
): Promise<PurgeResult> {
  const chunks = chunkArray(tags, PURGE_CHUNK_SIZE)
  let lastRequestId = ''
  let totalPurged = 0

  for (const chunk of chunks) {
    await withRetry(async () => {
      try {
        const client = getClient(apiToken)
        const result = await client.cache.purge({ zone_id: zoneId, tags: chunk })
        lastRequestId = extractRequestId(result)
        totalPurged += chunk.length
        logger.debug('cache purged tags chunk', { zoneId, count: chunk.length })
      } catch (err) {
        throw new ApiError(
          'CACHE_PURGE_TAGS_FAILED',
          `Failed to purge tags for zone ${zoneId}`,
          undefined,
          undefined,
          err,
        )
      }
    })
  }

  logger.info('cache purged by tags', { zoneId, totalPurged })
  return { requestId: lastRequestId, purgedCount: totalPurged }
}

export async function purgeByHostnames(
  apiToken: string,
  zoneId: string,
  hostnames: string[],
): Promise<PurgeResult> {
  const chunks = chunkArray(hostnames, PURGE_CHUNK_SIZE)
  let lastRequestId = ''
  let totalPurged = 0

  for (const chunk of chunks) {
    await withRetry(async () => {
      try {
        const client = getClient(apiToken)
        const result = await client.cache.purge({ zone_id: zoneId, hosts: chunk })
        lastRequestId = extractRequestId(result)
        totalPurged += chunk.length
        logger.debug('cache purged hostnames chunk', { zoneId, count: chunk.length })
      } catch (err) {
        throw new ApiError(
          'CACHE_PURGE_HOSTNAMES_FAILED',
          `Failed to purge hostnames for zone ${zoneId}`,
          undefined,
          undefined,
          err,
        )
      }
    })
  }

  logger.info('cache purged by hostnames', { zoneId, totalPurged })
  return { requestId: lastRequestId, purgedCount: totalPurged }
}
