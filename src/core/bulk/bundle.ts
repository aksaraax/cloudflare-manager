import { DnsRecord } from '../api/dns.js'
import { MatchResult } from './matcher.js'

export interface MxEntry {
  host: string
  priority: number
}

export interface BundleSelection {
  mx: boolean
  spf: boolean
  dmarc: boolean
  dkim: boolean
  dkimSelector?: string | undefined
  dkimValue?: string | undefined
  mxEntries: MxEntry[]
  spfContent?: string | undefined
  dmarcContent?: string | undefined
}

export type RecordAction = 'create' | 'skip' | 'replace'

export interface PlannedRecord {
  type: 'MX' | 'TXT'
  name: string
  content: string
  priority?: number
  ttl: 1
  proxied: false
  action: RecordAction
  existingId?: string
}

export interface DomainBundle {
  domain: string
  zoneId: string
  zoneName: string
  records: PlannedRecord[]
}

const SPF_CONTENT = 'v=spf1 mx ~all'

function getSubdomainPrefix(domain: string, zoneName: string): string {
  if (domain === zoneName) return ''
  if (domain.endsWith('.' + zoneName)) {
    return domain.slice(0, -(zoneName.length + 1))
  }
  return domain
}

function buildMxRecords(
  domain: string,
  zoneName: string,
  mxEntries: MxEntry[],
  existingRecords: DnsRecord[],
): PlannedRecord[] {
  const sub = getSubdomainPrefix(domain, zoneName)
  const recordName = sub ? sub : zoneName
  const existingMx = existingRecords.filter(
    (r) =>
      r.type === 'MX' &&
      (r.name === domain || r.name === sub || (!sub && (r.name === zoneName || r.name === '@'))),
  )
  return mxEntries.map((entry) => {
    const action: RecordAction = existingMx.length > 0 ? 'replace' : 'create'
    const existingId = existingMx.length > 0 ? existingMx[0]?.id : undefined
    const record: PlannedRecord = {
      type: 'MX',
      name: recordName,
      content: entry.host,
      priority: entry.priority,
      ttl: 1,
      proxied: false,
      action,
    }
    if (existingId !== undefined) record.existingId = existingId
    return record
  })
}

function buildSpfRecord(
  domain: string,
  zoneName: string,
  existingRecords: DnsRecord[],
  customSpfContent?: string,
): PlannedRecord {
  const content = customSpfContent?.trim() || SPF_CONTENT
  const sub = getSubdomainPrefix(domain, zoneName)
  const recordName = sub ? sub : '@'
  const existingSpf = existingRecords.find(
    (r) =>
      r.type === 'TXT' &&
      (r.name === domain || r.name === sub || (!sub && (r.name === zoneName || r.name === '@'))) &&
      r.content.includes('v=spf1'),
  )

  if (existingSpf !== undefined && existingSpf.content === content) {
    return { type: 'TXT', name: recordName, content, ttl: 1, proxied: false, action: 'skip' }
  }

  return { type: 'TXT', name: recordName, content, ttl: 1, proxied: false, action: 'create' }
}

function buildDmarcRecord(
  domain: string,
  zoneName: string,
  existingRecords: DnsRecord[],
  customDmarcContent?: string,
): PlannedRecord {
  const sub = getSubdomainPrefix(domain, zoneName)
  const dmarcName = sub ? `_dmarc.${sub}` : '_dmarc'
  const dmarcLookup = `_dmarc.${domain}`
  const dmarcContent = customDmarcContent?.trim() || `v=DMARC1; p=none; rua=mailto:dmarc@${domain}`

  const existingDmarc = existingRecords.find(
    (r) => r.type === 'TXT' && (r.name === dmarcLookup || r.name === dmarcName),
  )

  const action: RecordAction =
    existingDmarc !== undefined && existingDmarc.content === dmarcContent ? 'skip' : 'create'

  return {
    type: 'TXT',
    name: dmarcName,
    content: dmarcContent,
    ttl: 1,
    proxied: false,
    action,
  }
}

function buildDkimRecord(
  selector: string,
  value: string,
  domain: string,
  zoneName: string,
  existingRecords: DnsRecord[],
): PlannedRecord {
  const sub = getSubdomainPrefix(domain, zoneName)
  const dkimName = sub ? `${selector}._domainkey.${sub}` : `${selector}._domainkey`
  const dkimLookup = `${selector}._domainkey.${domain}`

  const existingDkim = existingRecords.find(
    (r) => r.type === 'TXT' && (r.name === dkimLookup || r.name === dkimName),
  )

  const action: RecordAction =
    existingDkim !== undefined && existingDkim.content === value ? 'skip' : 'create'

  return {
    type: 'TXT',
    name: dkimName,
    content: value,
    ttl: 1,
    proxied: false,
    action,
  }
}

export async function buildBundles(
  matched: MatchResult['matched'],
  selection: BundleSelection,
  existingRecords: Map<string, DnsRecord[]>,
): Promise<DomainBundle[]> {
  const bundles: DomainBundle[] = []

  for (const entry of matched) {
    const zoneRecords = existingRecords.get(entry.zoneId) ?? []
    const records: PlannedRecord[] = []

    if (selection.mx) {
      const mxRecords = buildMxRecords(entry.domain, entry.zoneName, selection.mxEntries, zoneRecords)
      records.push(...mxRecords)
    }

    if (selection.spf) {
      records.push(buildSpfRecord(entry.domain, entry.zoneName, zoneRecords, selection.spfContent))
    }

    if (selection.dmarc) {
      records.push(buildDmarcRecord(entry.domain, entry.zoneName, zoneRecords, selection.dmarcContent))
    }

    if (
      selection.dkim &&
      selection.dkimSelector !== undefined &&
      selection.dkimSelector !== '' &&
      selection.dkimValue !== undefined &&
      selection.dkimValue !== ''
    ) {
      records.push(
        buildDkimRecord(selection.dkimSelector, selection.dkimValue, entry.domain, entry.zoneName, zoneRecords),
      )
    }

    bundles.push({
      domain: entry.domain,
      zoneId: entry.zoneId,
      zoneName: entry.zoneName,
      records,
    })
  }

  return bundles
}
