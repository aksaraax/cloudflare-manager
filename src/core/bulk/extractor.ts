import { getDomain } from 'tldts'
import { ValidationError } from '../utils/errors.js'

export interface ExtractedDomain {
  count: number
  rootDomain: string
  isSubdomain: boolean
  subdomains: Set<string>
}

export interface ExtractResult {
  domains: Map<string, ExtractedDomain>
  ignoredLines: number
  totalEmails: number
}

const MAX_INPUT_BYTES = 512 * 1024
const MAX_INPUT_LINES = 10_000
const EMAIL_RE = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/gi

export function extractDomains(rawInput: string): ExtractResult {
  const byteLength = Buffer.byteLength(rawInput, 'utf8')
  if (byteLength > MAX_INPUT_BYTES) {
    throw new ValidationError(
      'BULK_INPUT_TOO_LARGE',
      `Input exceeds maximum size of ${MAX_INPUT_BYTES} bytes`,
      'rawInput',
    )
  }

  const normalized = rawInput.replace(/\r\n/g, '\n')
  const allLines = normalized.split('\n')

  if (allLines.length > MAX_INPUT_LINES) {
    throw new ValidationError(
      'BULK_INPUT_TOO_MANY_LINES',
      `Input exceeds maximum of ${MAX_INPUT_LINES} lines`,
      'rawInput',
    )
  }

  const lines = allLines.map((l) => l.trim()).filter((l) => l.length > 0)
  let ignoredLines = 0

  const domains = new Map<string, ExtractedDomain>()
  let totalEmails = 0

  for (const line of lines) {
    const matches = line.match(EMAIL_RE)
    if (matches === null || matches === undefined) {
      ignoredLines++
      continue
    }

    let lineHasValidEmail = false
    for (const emailMatch of matches) {
      const atIdx = emailMatch.indexOf('@')
      if (atIdx === -1) continue
      const emailDomain = emailMatch.slice(atIdx + 1).toLowerCase()

      const rootDomain = getDomain(emailDomain) ?? emailDomain
      if (!rootDomain) continue

      lineHasValidEmail = true
      totalEmails++

      const isSubdomain = emailDomain !== rootDomain

      // 1. Record the exact domain/subdomain
      const existing = domains.get(emailDomain)
      if (existing === undefined) {
        const subdomains = new Set<string>()
        if (isSubdomain) subdomains.add(emailDomain)
        domains.set(emailDomain, {
          count: 1,
          rootDomain,
          isSubdomain,
          subdomains,
        })
      } else {
        existing.count++
        if (isSubdomain) existing.subdomains.add(emailDomain)
      }

      // 2. If it is a subdomain, also ensure root domain tracks this subdomain
      if (isSubdomain) {
        const rootEntry = domains.get(rootDomain)
        if (rootEntry === undefined) {
          domains.set(rootDomain, {
            count: 1,
            rootDomain,
            isSubdomain: false,
            subdomains: new Set([emailDomain]),
          })
        } else {
          rootEntry.subdomains.add(emailDomain)
        }
      }
    }

    if (!lineHasValidEmail) {
      ignoredLines++
    }
  }

  return { domains, ignoredLines, totalEmails }
}
