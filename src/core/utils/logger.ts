import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

type LogLevel = 'error' | 'warn' | 'info' | 'debug'

const LEVEL_RANK: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
}

function resolveLogLevel(): LogLevel {
  const raw = process.env['CFM_LOG_LEVEL']?.toLowerCase()
  if (raw === 'error' || raw === 'warn' || raw === 'info' || raw === 'debug') return raw
  return 'info'
}

const SENSITIVE_KEY_RE = /[^\s=]*(?:password|token|secret|apikey|api_key)[^\s=]*\s*=\s*\S+/gi
const BEARER_RE = /Bearer\s+[A-Za-z0-9_\-]{20,}/g
const EMAIL_RE = /([A-Za-z0-9._%+\-]+)@([A-Za-z0-9.\-]+\.[A-Za-z]{2,})/g

export function redactSensitive(text: string): string {
  let result = text.replace(BEARER_RE, 'Bearer [REDACTED]')
  result = result.replace(SENSITIVE_KEY_RE, (match) => {
    const eqIdx = match.indexOf('=')
    return match.slice(0, eqIdx + 1) + '[REDACTED]'
  })
  result = result.replace(EMAIL_RE, (_full, local: string, domain: string) => {
    const hash = createHash('sha256').update(domain).digest('hex').slice(0, 8)
    return `${local}@[${hash}]`
  })
  return result
}

function redactMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta)) {
    if (typeof v === 'string') {
      out[k] = redactSensitive(v)
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = redactMeta(v as Record<string, unknown>)
    } else {
      out[k] = v
    }
  }
  return out
}

const LOG_DIR = join(homedir(), '.cloudflare-manager', 'logs')
const IS_BOT_MODE = process.env['CFM_MODE'] === 'bot'
const RETENTION_DAYS = 14

let currentLogDate = ''
let currentLogPath = ''

function getDateString(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true })
  }
}

function purgeOldLogs(): void {
  const files = readdirSync(LOG_DIR)
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
  for (const file of files) {
    if (!file.startsWith('app-') || !file.endsWith('.log')) continue
    const datePart = file.slice(4, 12)
    const year = datePart.slice(0, 4)
    const month = datePart.slice(4, 6)
    const day = datePart.slice(6, 8)
    const fileDate = new Date(`${year}-${month}-${day}`).getTime()
    if (!isNaN(fileDate) && fileDate < cutoff) {
      unlinkSync(join(LOG_DIR, file))
    }
  }
}

function writeToFile(line: string): void {
  ensureLogDir()
  const today = getDateString()
  if (today !== currentLogDate) {
    currentLogDate = today
    currentLogPath = join(LOG_DIR, `app-${today}.log`)
    purgeOldLogs()
  }
  appendFileSync(currentLogPath, line + '\n', 'utf8')
}

function emit(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
  const configuredLevel = resolveLogLevel()
  if (LEVEL_RANK[level] > LEVEL_RANK[configuredLevel]) return

  const redactedMsg = redactSensitive(msg)
  const redactedMeta = meta ? redactMeta(meta) : undefined

  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg: redactedMsg,
    ...redactedMeta,
  }

  const line = JSON.stringify(entry)
  process.stderr.write(line + '\n')

  if (IS_BOT_MODE) {
    writeToFile(line)
  }
}

export const logger = {
  error(msg: string, meta?: Record<string, unknown>): void {
    emit('error', msg, meta)
  },
  warn(msg: string, meta?: Record<string, unknown>): void {
    emit('warn', msg, meta)
  },
  info(msg: string, meta?: Record<string, unknown>): void {
    emit('info', msg, meta)
  },
  debug(msg: string, meta?: Record<string, unknown>): void {
    emit('debug', msg, meta)
  },
}
