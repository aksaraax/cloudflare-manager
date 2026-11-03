import { describe, it, expect } from 'vitest'
import { matchDomains } from './matcher.js'
import { ZoneInfo } from '../api/zones.js'

describe('matchDomains', () => {
  const mockZones: ZoneInfo[] = [
    {
      id: 'zone-1',
      name: 'example.com',
      status: 'active',
      paused: false,
      plan: 'Free Plan',
      nameservers: ['ns1.cloudflare.com', 'ns2.cloudflare.com'],
      originalNameservers: [],
      createdOn: '2025-01-01',
      modifiedOn: '2025-01-02',
    },
    {
      id: 'zone-2',
      name: 'myproject.net',
      status: 'active',
      paused: false,
      plan: 'Pro Plan',
      nameservers: ['ns3.cloudflare.com', 'ns4.cloudflare.com'],
      originalNameservers: [],
      createdOn: '2025-01-01',
      modifiedOn: '2025-01-02',
    },
  ]

  it('matches exact domain name to existing zone', () => {
    const domains = new Map([
      ['example.com', { count: 5, subdomains: new Set<string>() }],
    ])
    const result = matchDomains(domains, mockZones)
    expect(result.matched.length).toBe(1)
    expect(result.matched[0]?.domain).toBe('example.com')
    expect(result.matched[0]?.zoneId).toBe('zone-1')
    expect(result.matched[0]?.emailCount).toBe(5)
    expect(result.unmatched.length).toBe(0)
  })

  it('strips www prefix to match root domain zone', () => {
    const domains = new Map([
      ['www.example.com', { count: 2, subdomains: new Set<string>() }],
    ])
    const result = matchDomains(domains, mockZones)
    expect(result.matched.length).toBe(1)
    expect(result.matched[0]?.zoneId).toBe('zone-1')
  })

  it('classifies domains without existing zone as unmatched', () => {
    const domains = new Map([
      ['notfound.org', { count: 1, subdomains: new Set<string>() }],
    ])
    const result = matchDomains(domains, mockZones)
    expect(result.matched.length).toBe(0)
    expect(result.unmatched).toContain('notfound.org')
  })

  it('handles empty zone list by placing all domains in unmatched', () => {
    const domains = new Map([
      ['alpha.com', { count: 1, subdomains: new Set<string>() }],
      ['beta.com', { count: 2, subdomains: new Set<string>() }],
    ])
    const result = matchDomains(domains, [])
    expect(result.matched.length).toBe(0)
    expect(result.unmatched.length).toBe(2)
  })

  it('partitions multiple domains correctly between matched and unmatched', () => {
    const domains = new Map([
      ['example.com', { count: 10, subdomains: new Set<string>() }],
      ['myproject.net', { count: 3, subdomains: new Set<string>() }],
      ['other.org', { count: 1, subdomains: new Set<string>() }],
    ])
    const result = matchDomains(domains, mockZones)
    expect(result.matched.length).toBe(2)
    expect(result.unmatched).toEqual(['other.org'])
  })

  it('matches subdomains to parent zone', () => {
    const domains = new Map([
      ['spcp.example.com', { count: 2, subdomains: new Set<string>(), rootDomain: 'example.com', isSubdomain: true }],
    ])
    const result = matchDomains(domains, mockZones)
    expect(result.matched.length).toBe(1)
    expect(result.matched[0]?.domain).toBe('spcp.example.com')
    expect(result.matched[0]?.zoneName).toBe('example.com')
    expect(result.matched[0]?.zoneId).toBe('zone-1')
  })
})

