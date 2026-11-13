import { describe, it, expect, vi } from 'vitest'
import { withRetry } from './retry.js'
import { ValidationError, AuthError, ApiError, RateLimitError } from './errors.js'

describe('withRetry', () => {
  it('succeeds on first attempt without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('success')
    const result = await withRetry(fn, { baseDelayMs: 1 })
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on failure and returns result when subsequent attempt succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error 1'))
      .mockRejectedValueOnce(new Error('Network error 2'))
      .mockResolvedValue('recovered')

    const result = await withRetry(fn, { baseDelayMs: 1, jitter: false })
    expect(result).toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('exhausts all retry attempts and throws final error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Persistent server error'))
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 1, jitter: false })).rejects.toThrow(
      'Persistent server error',
    )
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does not retry on ValidationError and throws immediately', async () => {
    const fn = vi.fn().mockRejectedValue(new ValidationError('INVALID_INPUT', 'Bad data'))
    await expect(withRetry(fn, { maxAttempts: 5, baseDelayMs: 1 })).rejects.toThrow(ValidationError)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('does not retry on AuthError and throws immediately', async () => {
    const fn = vi.fn().mockRejectedValue(new AuthError('UNAUTHORIZED', 'Invalid token'))
    await expect(withRetry(fn, { maxAttempts: 5, baseDelayMs: 1 })).rejects.toThrow(AuthError)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('does not retry client errors reported by the API', async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(new ApiError('ZONE_CREATE_FAILED', 'exists', undefined, undefined, { status: 400 }))
    await expect(withRetry(fn, { maxAttempts: 5, baseDelayMs: 1 })).rejects.toThrow(ApiError)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries rate-limited and server errors reported by the API', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('X', 'limited', undefined, undefined, { status: 429 }))
      .mockRejectedValueOnce(new ApiError('X', 'down', undefined, undefined, { status: 503 }))
      .mockResolvedValue('ok')
    expect(await withRetry(fn, { baseDelayMs: 1, jitter: false })).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('respects custom maxAttempts configuration', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Fail'))
    await expect(withRetry(fn, { maxAttempts: 2, baseDelayMs: 1, jitter: false })).rejects.toThrow()
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('retries RateLimitError and uses specified retryAfterMs', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new RateLimitError('RATE_LIMITED', 'Slow down', 5))
      .mockResolvedValue('ok')

    const result = await withRetry(fn, { baseDelayMs: 1, jitter: false })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

