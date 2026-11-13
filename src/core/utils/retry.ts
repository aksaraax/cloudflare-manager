import { ApiError, AuthError, ConfigError, RateLimitError, ValidationError } from './errors.js'

export interface RetryOptions {
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  jitter?: boolean
}

const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_BASE_DELAY_MS = 1000
const DEFAULT_MAX_DELAY_MS = 10000
const MAX_JITTER_MS = 200

function statusOf(value: unknown): number | undefined {
  if (value !== null && typeof value === 'object' && 'status' in value) {
    return typeof value.status === 'number' ? value.status : undefined
  }
  return undefined
}

function httpStatus(error: unknown): number | undefined {
  if (error instanceof ApiError) return error.statusCode ?? statusOf(error.cause)
  return statusOf(error)
}

function isNonRetryable(error: unknown): boolean {
  if (
    error instanceof ValidationError ||
    error instanceof AuthError ||
    error instanceof ConfigError
  ) {
    return true
  }
  const status = httpStatus(error)
  return status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429
}

function computeDelay(attempt: number, baseDelayMs: number, maxDelayMs: number, jitter: boolean): number {
  const exponential = baseDelayMs * Math.pow(2, attempt - 1)
  const capped = Math.min(exponential, maxDelayMs)
  const jitterMs = jitter ? Math.floor(Math.random() * (MAX_JITTER_MS + 1)) : 0
  return capped + jitterMs
}

function extractRetryAfterMs(error: unknown): number | null {
  if (error instanceof RateLimitError) {
    return error.retryAfterMs
  }
  if (
    error instanceof ApiError &&
    httpStatus(error) === 429 &&
    error.cause !== null &&
    error.cause !== undefined &&
    typeof error.cause === 'object' &&
    'headers' in error.cause
  ) {
    const headers = (error.cause as { headers: unknown }).headers
    if (headers !== null && typeof headers === 'object' && 'get' in headers) {
      const retryAfter = (headers as { get: (name: string) => string | null }).get('retry-after')
      if (retryAfter !== null) {
        const parsed = Number(retryAfter)
        if (!isNaN(parsed)) return parsed * 1000
      }
    }
  }
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const baseDelayMs = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS
  const maxDelayMs = options?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS
  const jitter = options?.jitter ?? true

  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      if (isNonRetryable(error)) throw error
      if (attempt === maxAttempts) break

      const retryAfterMs = extractRetryAfterMs(error)
      const delayMs =
        retryAfterMs !== null
          ? retryAfterMs
          : computeDelay(attempt, baseDelayMs, maxDelayMs, jitter)

      await sleep(delayMs)
    }
  }

  throw lastError
}
