import { type Context } from 'telegraf'
import { findZoneByName, type ZoneInfo } from '../core/api/zones.js'
import { accountManager } from '../core/config/accounts.js'
import { ValidationError } from '../core/utils/errors.js'
import { normalizeDomain } from '../core/validation/domain.js'

const MAX_UPLOAD_BYTES = 512 * 1024
const DOWNLOAD_TIMEOUT_MS = 15_000
const PROGRESS_INTERVAL_MS = 2000

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function formatTable(headers: string[], rows: string[][]): string {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)),
  )

  const separator = colWidths.map((w) => '-'.repeat(w)).join('-+-')
  const headerRow = headers.map((h, i) => h.padEnd(colWidths[i] ?? 0)).join(' | ')
  const dataRows = rows
    .map((row) => row.map((cell, i) => (cell ?? '').padEnd(colWidths[i] ?? 0)).join(' | '))
    .join('\n')

  return `<pre>${escapeHtml([headerRow, separator, dataRows].join('\n'))}</pre>`
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 1) + '…'
}

export function getApiToken(): string {
  const token =
    accountManager.getActiveToken() ??
    process.env['CFM_API_TOKEN'] ??
    process.env['CF_API_TOKEN'] ??
    process.env['CLOUDFLARE_API_TOKEN']
  if (!token) {
    throw new Error('No Cloudflare API token configured (set CFM_API_TOKEN in .env or add an account)')
  }
  return token
}

export async function findZone(apiToken: string, query: string): Promise<ZoneInfo | undefined> {
  return findZoneByName(apiToken, normalizeDomain(query))
}

export async function readTextDocument(ctx: Context): Promise<string> {
  const doc = ctx.message && 'document' in ctx.message ? ctx.message.document : undefined
  if (!doc) throw new ValidationError('UPLOAD_MISSING', 'No file attached', 'document')

  const name = (doc.file_name ?? '').toLowerCase()
  if (!name.endsWith('.txt') && !name.endsWith('.csv') && doc.mime_type !== 'text/plain') {
    throw new ValidationError('UPLOAD_UNSUPPORTED', 'Only .txt or .csv files are supported', 'document')
  }
  if ((doc.file_size ?? 0) > MAX_UPLOAD_BYTES) {
    throw new ValidationError('UPLOAD_TOO_LARGE', 'File exceeds the 512 KB limit', 'document')
  }

  const link = await ctx.telegram.getFileLink(doc.file_id)
  const response = await fetch(link, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`File download failed (HTTP ${response.status})`)

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new ValidationError('UPLOAD_TOO_LARGE', 'File exceeds the 512 KB limit', 'document')
  }
  return buffer.toString('utf8').replace(/^\uFEFF/, '')
}

export interface ProgressReporter {
  update: (done: number, total: number) => void
  stop: () => Promise<void>
}

export function createProgress(ctx: Context, label: string): ProgressReporter {
  let lastSentAt = 0
  let pending: Promise<unknown> = Promise.resolve()

  return {
    update(done, total): void {
      const now = Date.now()
      if (now - lastSentAt < PROGRESS_INTERVAL_MS) return
      lastSentAt = now
      pending = pending
        .then(() => ctx.editMessageText(`⏳ ${label}… ${done}/${total}`))
        .catch(() => undefined)
    },
    stop: async (): Promise<void> => {
      await pending
    },
  }
}
