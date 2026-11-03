import { createDnsRecord, deleteDnsRecord, listDnsRecords, bulkDeleteDnsRecords } from '../api/dns.js'
import { logger } from '../utils/logger.js'
import { withRetry } from '../utils/retry.js'
import { DomainBundle, PlannedRecord } from './bundle.js'
import { type MatchResult } from './matcher.js'

export type BulkResultStatus = 'created' | 'skipped-exists' | 'replaced' | 'error'

export interface RecordResult {
  type: string
  name: string
  content: string
  status: BulkResultStatus
  error?: string
}

export interface DomainResult {
  domain: string
  records: RecordResult[]
}

export interface BulkSummary {
  totalInput: number
  matched: number
  unmatched: number
  created: number
  skipped: number
  replaced: number
  errors: number
  durationMs: number
  domainResults: DomainResult[]
}

const DEFAULT_CONCURRENCY = 5

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

async function processRecord(
  record: PlannedRecord,
  zoneId: string,
  apiToken: string,
  dryRun: boolean,
): Promise<RecordResult> {
  const base = { type: record.type, name: record.name, content: record.content }

  if (record.action === 'skip') {
    return { ...base, status: 'skipped-exists' }
  }

  if (dryRun) {
    return { ...base, status: record.action === 'replace' ? 'replaced' : 'created' }
  }

  try {
    if (record.action === 'replace') {
      if (record.existingId !== undefined) {
        await withRetry(() => deleteDnsRecord(apiToken, zoneId, record.existingId as string))
      }
      await withRetry(() =>
        createDnsRecord(apiToken, zoneId, {
          type: record.type,
          name: record.name,
          content: record.content,
          ttl: record.ttl,
          proxied: record.proxied,
          priority: record.priority,
        }),
      )
      return { ...base, status: 'replaced' }
    }

    await withRetry(() =>
      createDnsRecord(apiToken, zoneId, {
        type: record.type,
        name: record.name,
        content: record.content,
        ttl: record.ttl,
        proxied: record.proxied,
        priority: record.priority,
      }),
    )
    return { ...base, status: 'created' }
  } catch (err) {
    return { ...base, status: 'error', error: errorMessage(err) }
  }
}

async function processDomain(
  bundle: DomainBundle,
  apiToken: string,
  dryRun: boolean,
): Promise<DomainResult> {
  const recordResults: RecordResult[] = []
  for (const record of bundle.records) {
    const result = await processRecord(record, bundle.zoneId, apiToken, dryRun)
    recordResults.push(result)
  }
  return { domain: bundle.domain, records: recordResults }
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = []
  let index = 0

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const taskIndex = index++
      const task = tasks[taskIndex]
      if (task === undefined) break
      results[taskIndex] = await task()
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker())
  await Promise.all(workers)
  return results
}

export async function executeBulk(
  bundles: DomainBundle[],
  apiToken: string,
  options: { dryRun?: boolean; concurrency?: number },
): Promise<BulkSummary> {
  const startTime = Date.now()
  const dryRun = options.dryRun ?? false
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY

  const tasks = bundles.map(
    (bundle) => () => processDomain(bundle, apiToken, dryRun),
  )

  const domainResults = await runWithConcurrency(tasks, concurrency)

  let created = 0
  let skipped = 0
  let replaced = 0
  let errors = 0

  for (const dr of domainResults) {
    for (const rr of dr.records) {
      if (rr.status === 'created') created++
      else if (rr.status === 'skipped-exists') skipped++
      else if (rr.status === 'replaced') replaced++
      else if (rr.status === 'error') errors++
    }
  }

  const durationMs = Date.now() - startTime

  const summary: BulkSummary = {
    totalInput: bundles.length,
    matched: bundles.length,
    unmatched: 0,
    created,
    skipped,
    replaced,
    errors,
    durationMs,
    domainResults,
  }

  logger.info('bulk dns operation complete', {
    dryRun: String(dryRun),
    matched: String(summary.matched),
    created: String(created),
    skipped: String(skipped),
    replaced: String(replaced),
    errors: String(errors),
    durationMs: String(durationMs),
  })

  return summary
}

export interface BulkDeleteDomainResult {
  domain: string
  zoneName: string
  deletedCount: number
  failedCount: number
}

export interface BulkDeleteSummary {
  totalMatchedDomains: number
  totalRecordsFound: number
  totalDeleted: number
  totalFailed: number
  durationMs: number
  domainResults: BulkDeleteDomainResult[]
}

export function matchesDomain(recordName: string, domain: string, zoneName: string): boolean {
  const normRec = recordName.toLowerCase().replace(/\.$/, '')
  const normDom = domain.toLowerCase().replace(/\.$/, '')
  const normZone = zoneName.toLowerCase().replace(/\.$/, '')

  if (normRec === normDom) return true
  if (normRec.endsWith('.' + normDom)) return true

  if (normDom === normZone) {
    if (normRec === '@' || normRec === normZone) return true
    if (normRec === '_dmarc' || normRec.endsWith('._domainkey')) return true
  }

  if (normDom.endsWith('.' + normZone)) {
    const sub = normDom.slice(0, -(normZone.length + 1))
    if (normRec === sub || normRec.endsWith('.' + sub)) return true
  }

  return false
}

export async function bulkDeleteForMatchedDomains(
  matched: MatchResult['matched'],
  apiToken: string,
  options?: { filterType?: 'all' | 'mx' | 'txt' | undefined; concurrency?: number | undefined },
): Promise<BulkDeleteSummary> {
  const startTime = Date.now()
  const filterType = options?.filterType ?? 'all'
  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY

  const zoneMap = new Map<string, { zoneName: string; domains: string[] }>()
  for (const m of matched) {
    const entry = zoneMap.get(m.zoneId) ?? { zoneName: m.zoneName, domains: [] }
    entry.domains.push(m.domain)
    zoneMap.set(m.zoneId, entry)
  }

  let totalRecordsFound = 0
  let totalDeleted = 0
  let totalFailed = 0
  const domainResults: BulkDeleteDomainResult[] = []

  for (const [zoneId, { zoneName, domains }] of zoneMap.entries()) {
    const records = await listDnsRecords(apiToken, zoneId)

    for (const domain of domains) {
      const matchedRecords = records.filter((r) => {
        if (!matchesDomain(r.name, domain, zoneName)) return false
        if (filterType === 'mx' && r.type !== 'MX') return false
        if (filterType === 'txt' && r.type !== 'TXT') return false
        return true
      })

      if (matchedRecords.length === 0) {
        domainResults.push({
          domain,
          zoneName,
          deletedCount: 0,
          failedCount: 0,
        })
        continue
      }

      totalRecordsFound += matchedRecords.length
      const res = await bulkDeleteDnsRecords(apiToken, zoneId, {
        recordIds: matchedRecords.map((r) => r.id),
        concurrency,
      })

      totalDeleted += res.deleted
      totalFailed += res.failed
      domainResults.push({
        domain,
        zoneName,
        deletedCount: res.deleted,
        failedCount: res.failed,
      })
    }
  }

  return {
    totalMatchedDomains: matched.length,
    totalRecordsFound,
    totalDeleted,
    totalFailed,
    durationMs: Date.now() - startTime,
    domainResults,
  }
}
