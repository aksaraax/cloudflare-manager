export class AppError extends Error {
  readonly code: string
  override readonly message: string
  override readonly cause?: unknown | undefined

  constructor(code: string, message: string, cause?: unknown) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.message = message
    this.cause = cause
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class ApiError extends AppError {
  readonly statusCode?: number | undefined
  readonly requestId?: string | undefined

  constructor(
    code: string,
    message: string,
    statusCode?: number,
    requestId?: string,
    cause?: unknown,
  ) {
    super(code, message, cause)
    this.statusCode = statusCode
    this.requestId = requestId
  }
}

export class ValidationError extends AppError {
  readonly field?: string | undefined

  constructor(code: string, message: string, field?: string, cause?: unknown) {
    super(code, message, cause)
    this.field = field
  }
}

export class ConfigError extends AppError {
  constructor(code: string, message: string, cause?: unknown) {
    super(code, message, cause)
  }
}

export class AuthError extends AppError {
  constructor(code: string, message: string, cause?: unknown) {
    super(code, message, cause)
  }
}

export class BulkError extends AppError {
  readonly domainErrors: Map<string, string>

  constructor(
    code: string,
    message: string,
    domainErrors: Map<string, string>,
    cause?: unknown,
  ) {
    super(code, message, cause)
    this.domainErrors = domainErrors
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterMs: number

  constructor(code: string, message: string, retryAfterMs: number, cause?: unknown) {
    super(code, message, cause)
    this.retryAfterMs = retryAfterMs
  }
}

export function causeDetail(cause: unknown): string {
  if (cause !== null && typeof cause === 'object' && 'errors' in cause && Array.isArray(cause.errors)) {
    const first: unknown = cause.errors[0]
    if (
      first !== null &&
      typeof first === 'object' &&
      'message' in first &&
      typeof first.message === 'string'
    ) {
      return first.message
    }
  }
  return cause instanceof Error ? cause.message : String(cause)
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError
}
