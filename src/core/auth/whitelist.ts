import { createHash } from 'node:crypto'

function parseAllowedIds(): Set<number> {
  const raw = process.env['TELEGRAM_ALLOWED_IDS'] ?? ''
  const ids = new Set<number>()
  for (const part of raw.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const parsed = parseInt(trimmed, 10)
    if (!isNaN(parsed)) ids.add(parsed)
  }
  return ids
}

export function getAllowedUserIds(): Set<number> {
  return parseAllowedIds()
}

export function hashUserId(userId: number): string {
  return createHash('sha256').update(String(userId)).digest('hex').slice(0, 12)
}

export function isAllowed(userId: number): boolean {
  return getAllowedUserIds().has(userId)
}
