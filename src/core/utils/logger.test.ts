import { describe, it, expect } from 'vitest'
import { redactSensitive } from './logger.js'

describe('redactSensitive', () => {
  it('redacts Bearer authorization tokens', () => {
    const input = 'Authorization: Bearer 1234567890abcdef1234567890'
    const result = redactSensitive(input)
    expect(result).toBe('Authorization: Bearer [REDACTED]')
  })

  it('redacts password key-value parameters', () => {
    const input = 'Logging in with password=MySuperSecretPassword123!'
    const result = redactSensitive(input)
    expect(result).toBe('Logging in with password=[REDACTED]')
  })

  it('redacts token key-value parameters', () => {
    const input = 'api_token=99283482348234823482348234'
    const result = redactSensitive(input)
    expect(result).toBe('api_token=[REDACTED]')
  })

  it('hashes the domain part of email addresses to preserve privacy', () => {
    const input = 'User email is contact@example.com in payload'
    const result = redactSensitive(input)
    expect(result).toContain('contact@[')
    expect(result).not.toContain('example.com')
  })

  it('leaves regular text without secrets untouched', () => {
    const input = 'Zone updated successfully for zone_id 12345'
    const result = redactSensitive(input)
    expect(result).toBe(input)
  })
})

