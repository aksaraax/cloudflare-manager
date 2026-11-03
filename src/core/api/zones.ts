import { ApiError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { withRetry } from '../utils/retry.js'
import { getClient } from './client.js'

export interface ZoneInfo {
  id: string
  name: string
  status: 'active' | 'pending' | 'initializing' | 'moved' | 'deleted' | 'deactivated'
  paused: boolean
  plan: string
  nameservers: string[]
  originalNameservers: string[]
  createdOn: string
  modifiedOn: string
}

interface ZoneCacheEntry {
  zones: ZoneInfo[]
  fetchedAt: number
}

const ZONE_CACHE_TTL_MS = 60_000

const zoneCache = new Map<string, ZoneCacheEntry>()

function cacheKey(apiToken: string): string {
  return apiToken.slice(-8)
}

function isCacheValid(entry: ZoneCacheEntry): boolean {
  return Date.now() - entry.fetchedAt < ZONE_CACHE_TTL_MS
}

function toZoneStatus(
  raw: string,
): 'active' | 'pending' | 'initializing' | 'moved' | 'deleted' | 'deactivated' {
  if (
    raw === 'active' ||
    raw === 'pending' ||
    raw === 'initializing' ||
    raw === 'moved' ||
    raw === 'deleted' ||
    raw === 'deactivated'
  ) {
    return raw
  }
  return 'pending'
}

function mapZone(z: Record<string, unknown>): ZoneInfo {
  return {
    id: String(z['id'] ?? ''),
    name: String(z['name'] ?? ''),
    status: toZoneStatus(String(z['status'] ?? '')),
    paused: Boolean(z['paused']),
    plan: String((z['plan'] as Record<string, unknown> | undefined)?.['name'] ?? ''),
    nameservers: Array.isArray(z['name_servers'])
      ? (z['name_servers'] as unknown[]).map(String)
      : [],
    originalNameservers: Array.isArray(z['original_name_servers'])
      ? (z['original_name_servers'] as unknown[]).map(String)
      : [],
    createdOn: String(z['created_on'] ?? ''),
    modifiedOn: String(z['modified_on'] ?? ''),
  }
}

export async function listZones(apiToken: string): Promise<ZoneInfo[]> {
  const key = cacheKey(apiToken)
  const cached = zoneCache.get(key)
  if (cached !== undefined && isCacheValid(cached)) {
    logger.debug('zones cache hit', { key })
    return cached.zones
  }

  const zones = await withRetry(async () => {
    try {
      const client = getClient(apiToken)
      const pages = await client.zones.list()
      const raw = pages.result ?? []
      return (raw as unknown as Record<string, unknown>[]).map(mapZone)
    } catch (err) {
      throw new ApiError('ZONES_LIST_FAILED', 'Failed to list zones', undefined, undefined, err)
    }
  })

  zoneCache.set(key, { zones, fetchedAt: Date.now() })
  logger.debug('zones fetched and cached', { count: zones.length })
  return zones
}

export async function getZone(apiToken: string, zoneId: string): Promise<ZoneInfo> {
  const cached = zoneCache.get(cacheKey(apiToken))
  if (cached !== undefined && isCacheValid(cached)) {
    const found = cached.zones.find((z) => z.id === zoneId)
    if (found !== undefined) return found
  }

  return withRetry(async () => {
    try {
      const client = getClient(apiToken)
      const z = await client.zones.get({ zone_id: zoneId })
      return mapZone(z as unknown as Record<string, unknown>)
    } catch (err) {
      throw new ApiError('ZONE_GET_FAILED', `Failed to get zone ${zoneId}`, undefined, undefined, err)
    }
  })
}

export async function pauseZone(apiToken: string, zoneId: string): Promise<void> {
  await withRetry(async () => {
    try {
      const client = getClient(apiToken)
      await client.zones.edit({
        zone_id: zoneId,
        paused: true,
      } as unknown as Parameters<typeof client.zones.edit>[0])
      logger.info('zone paused', { zoneId })
    } catch (err) {
      throw new ApiError('ZONE_PAUSE_FAILED', `Failed to pause zone ${zoneId}`, undefined, undefined, err)
    }
  })
  await invalidateZoneCache(apiToken)
}

export async function resumeZone(apiToken: string, zoneId: string): Promise<void> {
  await withRetry(async () => {
    try {
      const client = getClient(apiToken)
      await client.zones.edit({
        zone_id: zoneId,
        paused: false,
      } as unknown as Parameters<typeof client.zones.edit>[0])
      logger.info('zone resumed', { zoneId })
    } catch (err) {
      throw new ApiError(
        'ZONE_RESUME_FAILED',
        `Failed to resume zone ${zoneId}`,
        undefined,
        undefined,
        err,
      )
    }
  })
  await invalidateZoneCache(apiToken)
}

export async function invalidateZoneCache(apiToken: string): Promise<void> {
  zoneCache.delete(cacheKey(apiToken))
  logger.debug('zone cache invalidated', { key: cacheKey(apiToken) })
}

export async function refreshZones(apiToken: string): Promise<ZoneInfo[]> {
  await invalidateZoneCache(apiToken)
  return listZones(apiToken)
}
