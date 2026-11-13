import { getDomain } from 'tldts'
import { ValidationError } from '../utils/errors.js'

const LABEL_REGEX = /^[a-z0-9-]{1,63}$/
const MAX_DOMAIN_LENGTH = 253
const MAX_DOMAINS_PER_BATCH = 500

export function normalizeDomain(input: string): string {
  const domain = input.trim().toLowerCase().replace(/\.$/, '')
  const labels = domain.split('.')
  const valid =
    domain.length <= MAX_DOMAIN_LENGTH &&
    labels.length >= 2 &&
    labels.every((l) => LABEL_REGEX.test(l) && !l.startsWith('-') && !l.endsWith('-'))

  if (!valid) {
    throw new ValidationError('INVALID_DOMAIN', `Invalid domain name: ${input.slice(0, 80)}`, 'domain')
  }
  return domain
}

export interface DomainListResult {
  domains: string[]
  invalid: string[]
}

export function parseDomainList(rawInput: string): DomainListResult {
  const domains = new Set<string>()
  const invalid = new Set<string>()

  for (const token of rawInput.split(/[\s,;]+/)) {
    if (token === '') continue
    const candidate = token.replace(/^https?:\/\//i, '').split('/')[0] ?? ''
    try {
      const domain = normalizeDomain(candidate)
      if (getDomain(domain) === domain) domains.add(domain)
      else invalid.add(token)
    } catch {
      invalid.add(token)
    }
  }

  if (domains.size > MAX_DOMAINS_PER_BATCH) {
    throw new ValidationError(
      'TOO_MANY_DOMAINS',
      `Input exceeds maximum of ${MAX_DOMAINS_PER_BATCH} domains per batch`,
      'rawInput',
    )
  }

  return { domains: [...domains], invalid: [...invalid] }
}
