import { mapConcurrent } from '../utils/concurrency.js'
import { ApiError, ConfigError, causeDetail } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { withRetry } from '../utils/retry.js'
import { getClient, tokenKey } from './client.js'
import { fetchAllPages, type RawPage } from './pagination.js'

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

export interface AddZoneResult {
  name: string
  zone?: ZoneInfo
  error?: string
}

const ZONE_CACHE_TTL_MS = 60_000
const ZONES_PER_PAGE = 50
const ZONE_CREATE_CONCURRENCY = 3

const zoneCache = new Map<string, ZoneCacheEntry>()

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
  const key = tokenKey(apiToken)
  const cached = zoneCache.get(key)
  if (cached !== undefined && isCacheValid(cached)) {
    logger.debug('zones cache hit', { key })
    return cached.zones
  }

  const zones = await withRetry(async () => {
    try {
      const client = getClient(apiToken)
      const raw = await fetchAllPages(
        async (page) =>
          (await client.zones.list({ page, per_page: ZONES_PER_PAGE })) as unknown as RawPage,
        ZONES_PER_PAGE,
      )
      return raw.map(mapZone)
    } catch (err) {
      throw new ApiError('ZONES_LIST_FAILED', 'Failed to list zones', undefined, undefined, err)
    }
  })

  zoneCache.set(key, { zones, fetchedAt: Date.now() })
  logger.debug('zones fetched and cached', { count: zones.length })
  return zones
}

export async function getZone(apiToken: string, zoneId: string): Promise<ZoneInfo> {
  const cached = zoneCache.get(tokenKey(apiToken))
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

export async function findZoneByName(
  apiToken: string,
  name: string,
): Promise<ZoneInfo | undefined> {
  const cached = zoneCache.get(tokenKey(apiToken))
  if (cached !== undefined && isCacheValid(cached)) {
    return cached.zones.find((z) => z.name === name)
  }

  return withRetry(async () => {
    try {
      const client = getClient(apiToken)
      const page = (await client.zones.list({ name })) as unknown as RawPage
      const first = (page.result ?? [])[0]
      return first === undefined ? undefined : mapZone(first as Record<string, unknown>)
    } catch (err) {
      throw new ApiError('ZONE_GET_FAILED', `Failed to look up zone ${name}`, undefined, undefined, err)
    }
  })
}

export async function resolveAccountId(apiToken: string): Promise<string> {
  const configured = process.env['CF_ACCOUNT_ID'] ?? process.env['CFM_ACCOUNT_ID']
  if (configured) return configured

  const accounts = await withRetry(async () => {
    try {
      const client = getClient(apiToken)
      const page = (await client.accounts.list()) as unknown as RawPage
      return (page.result ?? []) as Record<string, unknown>[]
    } catch (err) {
      throw new ApiError('ACCOUNTS_LIST_FAILED', 'Failed to list accounts', undefined, undefined, err)
    }
  })

  const only = accounts[0]
  if (accounts.length === 1 && only !== undefined) return String(only['id'] ?? '')

  throw new ConfigError(
    'ACCOUNT_ID_REQUIRED',
    accounts.length === 0
      ? 'API token cannot read any account. Set CF_ACCOUNT_ID or grant Account read permission.'
      : 'API token can access multiple accounts. Set CF_ACCOUNT_ID to choose one.',
  )
}

export async function createZone(
  apiToken: string,
  accountId: string,
  name: string,
): Promise<ZoneInfo> {
  const zone = await withRetry(async () => {
    try {
      const client = getClient(apiToken)
      const z = await client.zones.create({ account: { id: accountId }, name, type: 'full' })
      return mapZone(z as unknown as Record<string, unknown>)
    } catch (err) {
      throw new ApiError(
        'ZONE_CREATE_FAILED',
        `Failed to create zone ${name}: ${causeDetail(err)}`,
        undefined,
        undefined,
        err,
      )
    }
  })
  await invalidateZoneCache(apiToken)
  logger.info('zone created', { zoneId: zone.id, name })
  return zone
}

export async function addZones(
  apiToken: string,
  names: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<AddZoneResult[]> {
  const accountId = await resolveAccountId(apiToken)
  let done = 0

  return mapConcurrent(names, ZONE_CREATE_CONCURRENCY, async (name) => {
    let result: AddZoneResult
    try {
      result = { name, zone: await createZone(apiToken, accountId, name) }
    } catch (err) {
      result = { name, error: err instanceof Error ? err.message : String(err) }
    }
    onProgress?.(++done, names.length)
    return result
  })
}

export async function deleteZone(apiToken: string, zoneId: string): Promise<void> {
  await withRetry(async () => {
    try {
      const client = getClient(apiToken)
      await client.zones.delete({ zone_id: zoneId })
      logger.info('zone deleted', { zoneId })
    } catch (err) {
      throw new ApiError(
        'ZONE_DELETE_FAILED',
        `Failed to delete zone ${zoneId}: ${causeDetail(err)}`,
        undefined,
        undefined,
        err,
      )
    }
  })
  await invalidateZoneCache(apiToken)
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
  zoneCache.delete(tokenKey(apiToken))
  logger.debug('zone cache invalidated', { key: tokenKey(apiToken) })
}

export async function refreshZones(apiToken: string): Promise<ZoneInfo[]> {
  await invalidateZoneCache(apiToken)
  return listZones(apiToken)
}
