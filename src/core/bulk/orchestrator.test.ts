import { describe, it, expect } from 'vitest'
import { matchesDomain } from './orchestrator.js'

describe('matchesDomain', () => {
  it('matches exact domain name', () => {
    expect(matchesDomain('example.com', 'example.com', 'example.com')).toBe(true)
    expect(matchesDomain('sub.example.com', 'sub.example.com', 'example.com')).toBe(true)
  })

  it('matches sub-records of subdomain (e.g. dmarc, dkim)', () => {
    expect(matchesDomain('_dmarc.sub.example.com', 'sub.example.com', 'example.com')).toBe(true)
    expect(matchesDomain('k1._domainkey.sub.example.com', 'sub.example.com', 'example.com')).toBe(true)
  })

  it('matches root zone @ or zone name', () => {
    expect(matchesDomain('@', 'example.com', 'example.com')).toBe(true)
    expect(matchesDomain('example.com', 'example.com', 'example.com')).toBe(true)
    expect(matchesDomain('_dmarc', 'example.com', 'example.com')).toBe(true)
    expect(matchesDomain('k1._domainkey', 'example.com', 'example.com')).toBe(true)
  })

  it('matches relative subdomain record name', () => {
    expect(matchesDomain('spcp', 'spcp.sampaikan.biz.id', 'sampaikan.biz.id')).toBe(true)
    expect(matchesDomain('_dmarc.spcp', 'spcp.sampaikan.biz.id', 'sampaikan.biz.id')).toBe(true)
  })

  it('does not match unrelated domain', () => {
    expect(matchesDomain('other.com', 'example.com', 'example.com')).toBe(false)
    expect(matchesDomain('diff.sampaikan.biz.id', 'spcp.sampaikan.biz.id', 'sampaikan.biz.id')).toBe(false)
  })
})
