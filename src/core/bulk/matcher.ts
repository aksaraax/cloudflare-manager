import { ZoneInfo } from '../api/zones.js'
import { ExtractedDomain } from './extractor.js'

export interface MatchResult {
  matched: Array<{ domain: string; zoneId: string; zoneName: string; emailCount: number }>
  unmatched: string[]
}

export function matchDomains(
  domains: Map<string, ExtractedDomain | { count: number; subdomains: Set<string>; rootDomain?: string }>,
  zones: ZoneInfo[],
): MatchResult {
  const matched: MatchResult['matched'] = []
  const unmatched: string[] = []

  for (const [domain, info] of domains) {
    const strippedDomain = domain.startsWith('www.') ? domain.slice(4) : domain
    const rootDomain = (info as ExtractedDomain).rootDomain ?? (domain.startsWith('www.') ? domain.slice(4) : domain)

    const zone =
      zones.find((z) => z.name === domain) ??
      zones.find((z) => z.name === strippedDomain) ??
      zones.find((z) => z.name === rootDomain) ??
      zones.find((z) => domain.endsWith('.' + z.name))

    if (zone !== undefined) {
      matched.push({
        domain,
        zoneId: zone.id,
        zoneName: zone.name,
        emailCount: info.count,
      })
    } else {
      unmatched.push(domain)
    }
  }

  return { matched, unmatched }
}
