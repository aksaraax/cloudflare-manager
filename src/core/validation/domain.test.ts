import { describe, it, expect } from 'vitest'
import { normalizeDomain, parseDomainList } from './domain.js'
import { ValidationError } from '../utils/errors.js'

describe('normalizeDomain', () => {
  it('lowercases, trims and strips the trailing dot', () => {
    expect(normalizeDomain('  Example.COM. ')).toBe('example.com')
  })

  it.each(['', 'localhost', 'exa mple.com', '-bad.com', 'bad-.com', 'a..com', '<b>x</b>.com', 'a'.repeat(64) + '.com'])(
    'rejects %j',
    (input) => {
      expect(() => normalizeDomain(input)).toThrow(ValidationError)
    },
  )
})

describe('parseDomainList', () => {
  it('splits on whitespace, commas and semicolons and deduplicates', () => {
    const result = parseDomainList('example.com, Example.com\nfoo.co.id;bar.net')
    expect(result.domains).toEqual(['example.com', 'foo.co.id', 'bar.net'])
    expect(result.invalid).toEqual([])
  })

  it('accepts URLs and keeps only the hostname', () => {
    expect(parseDomainList('https://example.com/path').domains).toEqual(['example.com'])
  })

  it('reports subdomains and malformed entries as invalid', () => {
    const result = parseDomainList('sub.example.com not_a_domain example.com')
    expect(result.domains).toEqual(['example.com'])
    expect(result.invalid).toEqual(['sub.example.com', 'not_a_domain'])
  })

  it('rejects batches above the limit', () => {
    const input = Array.from({ length: 501 }, (_, i) => `site${i}.com`).join('\n')
    expect(() => parseDomainList(input)).toThrow(ValidationError)
  })
})
