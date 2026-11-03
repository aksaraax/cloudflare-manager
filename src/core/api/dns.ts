import { ApiError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { withRetry } from '../utils/retry.js'
import { getClient } from './client.js'

export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SRV' | 'CAA'

export interface DnsRecord {
  id: string
  type: DnsRecordType
  name: string
  content: string
  ttl: number
  proxied: boolean
  priority?: number | undefined
  createdOn?: string | undefined
  modifiedOn?: string | undefined
}

export interface CreateDnsRecord {
  type: DnsRecordType
  name: string
  content: string
  ttl?: number | undefined
  proxied?: boolean | undefined
  priority?: number | undefined
}

interface DnsCacheEntry {
  records: DnsRecord[]
  fetchedAt: number
}

const DNS_CACHE_TTL_MS = 30_000

const dnsCache = new Map<string, DnsCacheEntry>()

function cacheKey(apiToken: string, zoneId: string): string {
  return `${apiToken.slice(-8)}:${zoneId}`
}

function isCacheValid(entry: DnsCacheEntry): boolean {
  return Date.now() - entry.fetchedAt < DNS_CACHE_TTL_MS
}

const VALID_TYPES: readonly DnsRecordType[] = [
  'A',
  'AAAA',
  'CNAME',
  'MX',
  'TXT',
  'NS',
  'SRV',
  'CAA',
]

function toDnsType(raw: string): DnsRecordType {
  const upper = raw.toUpperCase()
  if ((VALID_TYPES as readonly string[]).includes(upper)) return upper as DnsRecordType
  return 'TXT'
}

function mapRecord(r: Record<string, unknown>): DnsRecord {
  const record: DnsRecord = {
    id: String(r['id'] ?? ''),
    type: toDnsType(String(r['type'] ?? '')),
    name: String(r['name'] ?? ''),
    content: String(r['content'] ?? ''),
    ttl: Number(r['ttl'] ?? 1),
    proxied: Boolean(r['proxied']),
  }
  if (r['priority'] !== undefined && r['priority'] !== null) {
    record.priority = Number(r['priority'])
  }
  if (typeof r['created_on'] === 'string') record.createdOn = r['created_on']
  if (typeof r['modified_on'] === 'string') record.modifiedOn = r['modified_on']
  return record
}

export async function listDnsRecords(
  apiToken: string,
  zoneId: string,
  filter?: { type?: DnsRecordType; name?: string },
): Promise<DnsRecord[]> {
  const key = cacheKey(apiToken, zoneId)
  const cached = dnsCache.get(key)

  let records: DnsRecord[]

  if (cached !== undefined && isCacheValid(cached)) {
    logger.debug('dns cache hit', { key })
    records = cached.records
  } else {
    records = await withRetry(async () => {
      try {
        const client = getClient(apiToken)
        const pages = await client.dns.records.list({ zone_id: zoneId })
        const raw = pages.result ?? []
        return (raw as unknown as Record<string, unknown>[]).map(mapRecord)
      } catch (err) {
        throw new ApiError(
          'DNS_LIST_FAILED',
          `Failed to list DNS records for zone ${zoneId}`,
          undefined,
          undefined,
          err,
        )
      }
    })
    dnsCache.set(key, { records, fetchedAt: Date.now() })
    logger.debug('dns records fetched and cached', { zoneId, count: records.length })
  }

  if (filter === undefined) return records

  return records.filter((r) => {
    if (filter.type !== undefined && r.type !== filter.type) return false
    if (filter.name !== undefined && !r.name.includes(filter.name)) return false
    return true
  })
}

export async function getDnsRecord(
  apiToken: string,
  zoneId: string,
  recordId: string,
): Promise<DnsRecord> {
  const cached = dnsCache.get(cacheKey(apiToken, zoneId))
  if (cached !== undefined && isCacheValid(cached)) {
    const found = cached.records.find((r) => r.id === recordId)
    if (found !== undefined) return found
  }

  return withRetry(async () => {
    try {
      const client = getClient(apiToken)
      const r = await client.dns.records.get(recordId, { zone_id: zoneId })
      return mapRecord(r as unknown as Record<string, unknown>)
    } catch (err) {
      throw new ApiError(
        'DNS_GET_FAILED',
        `Failed to get DNS record ${recordId}`,
        undefined,
        undefined,
        err,
      )
    }
  })
}

export async function createDnsRecord(
  apiToken: string,
  zoneId: string,
  data: CreateDnsRecord,
): Promise<DnsRecord> {
  const result = await withRetry(async () => {
    try {
      const client = getClient(apiToken)
      const body: Record<string, unknown> = {
        zone_id: zoneId,
        type: data.type,
        name: data.name,
        content: data.content,
        ttl: data.ttl ?? 1,
        proxied: data.proxied ?? false,
      }
      if (data.priority !== undefined) body['priority'] = data.priority
      const r = await client.dns.records.create(body as unknown as Parameters<typeof client.dns.records.create>[0])
      return mapRecord(r as unknown as Record<string, unknown>)
    } catch (err) {
      throw new ApiError(
        'DNS_CREATE_FAILED',
        `Failed to create DNS record in zone ${zoneId}`,
        undefined,
        undefined,
        err,
      )
    }
  })
  await invalidateDnsCache(apiToken, zoneId)
  logger.info('dns record created', { zoneId, id: result.id })
  return result
}

export async function updateDnsRecord(
  apiToken: string,
  zoneId: string,
  recordId: string,
  data: Partial<CreateDnsRecord>,
): Promise<DnsRecord> {
  const result = await withRetry(async () => {
    try {
      const client = getClient(apiToken)
      const body: Record<string, unknown> = { zone_id: zoneId }
      if (data.type !== undefined) body['type'] = data.type
      if (data.name !== undefined) body['name'] = data.name
      if (data.content !== undefined) body['content'] = data.content
      if (data.ttl !== undefined) body['ttl'] = data.ttl
      if (data.proxied !== undefined) body['proxied'] = data.proxied
      if (data.priority !== undefined) body['priority'] = data.priority
      const r = await client.dns.records.edit(
        recordId,
        body as unknown as Parameters<typeof client.dns.records.edit>[1],
      )
      return mapRecord(r as unknown as Record<string, unknown>)
    } catch (err) {
      throw new ApiError(
        'DNS_UPDATE_FAILED',
        `Failed to update DNS record ${recordId}`,
        undefined,
        undefined,
        err,
      )
    }
  })
  await invalidateDnsCache(apiToken, zoneId)
  logger.info('dns record updated', { zoneId, recordId })
  return result
}

export async function deleteDnsRecord(
  apiToken: string,
  zoneId: string,
  recordId: string,
): Promise<void> {
  await withRetry(async () => {
    try {
      const client = getClient(apiToken)
      await client.dns.records.delete(recordId, { zone_id: zoneId })
      logger.info('dns record deleted', { zoneId, recordId })
    } catch (err) {
      throw new ApiError(
        'DNS_DELETE_FAILED',
        `Failed to delete DNS record ${recordId}`,
        undefined,
        undefined,
        err,
      )
    }
  })
  await invalidateDnsCache(apiToken, zoneId)
}

export interface BulkDeleteResult {
  total: number
  deleted: number
  failed: number
  errors: Array<{ id: string; name: string; error: string }>
}

export interface BulkDeleteFilter {
  recordIds?: string[] | undefined
  type?: DnsRecordType | string | undefined
  name?: string | undefined
  all?: boolean | undefined
  concurrency?: number | undefined
}

export async function bulkDeleteDnsRecords(
  apiToken: string,
  zoneId: string,
  filter: BulkDeleteFilter,
): Promise<BulkDeleteResult> {
  const allRecords = await listDnsRecords(apiToken, zoneId)
  let targetRecords: DnsRecord[]

  if (filter.recordIds !== undefined && filter.recordIds.length > 0) {
    const idSet = new Set(filter.recordIds)
    targetRecords = allRecords.filter((r) => idSet.has(r.id))
  } else if (filter.all === true) {
    targetRecords = allRecords
  } else {
    targetRecords = allRecords.filter((r) => {
      let match = true
      if (filter.type !== undefined && filter.type !== '') {
        match = match && r.type.toUpperCase() === filter.type.toUpperCase()
      }
      if (filter.name !== undefined && filter.name !== '') {
        const query = filter.name.toLowerCase()
        match = match && (r.name.toLowerCase() === query || r.name.toLowerCase().includes(query))
      }
      return match
    })
  }

  if (targetRecords.length === 0) {
    return { total: 0, deleted: 0, failed: 0, errors: [] }
  }

  const client = getClient(apiToken)
  const errors: Array<{ id: string; name: string; error: string }> = []
  let deleted = 0

  const concurrency = filter.concurrency ?? 5
  let index = 0

  async function worker(): Promise<void> {
    while (index < targetRecords.length) {
      const i = index++
      const record = targetRecords[i]
      if (!record) break

      try {
        await withRetry(async () => {
          await client.dns.records.delete(record.id, { zone_id: zoneId })
        })
        deleted++
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        errors.push({ id: record.id, name: record.name, error: errorMsg })
        logger.error('bulk dns delete failed for record', { zoneId, recordId: record.id, error: errorMsg })
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, targetRecords.length) },
    () => worker(),
  )
  await Promise.all(workers)

  await invalidateDnsCache(apiToken, zoneId)
  logger.info('bulk dns delete completed', {
    zoneId,
    total: targetRecords.length,
    deleted,
    failed: errors.length,
  })

  return {
    total: targetRecords.length,
    deleted,
    failed: errors.length,
    errors,
  }
}

export async function exportDnsZone(apiToken: string, zoneId: string): Promise<string> {
  return withRetry(async () => {
    try {
      const client = getClient(apiToken)
      const result = await client.dns.records.export({ zone_id: zoneId })
      return typeof result === 'string' ? result : String(result)
    } catch (err) {
      throw new ApiError(
        'DNS_EXPORT_FAILED',
        `Failed to export DNS zone ${zoneId}`,
        undefined,
        undefined,
        err,
      )
    }
  })
}

export async function invalidateDnsCache(apiToken: string, zoneId: string): Promise<void> {
  const key = cacheKey(apiToken, zoneId)
  dnsCache.delete(key)
  logger.debug('dns cache invalidated', { key })
}
