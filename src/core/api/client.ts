import { createHash } from 'node:crypto'
import Cloudflare from 'cloudflare'
import { AuthError, causeDetail } from '../utils/errors.js'

const clientCache = new Map<string, Cloudflare>()

export function tokenKey(apiToken: string): string {
  return createHash('sha256').update(apiToken).digest('hex').slice(0, 16)
}

export function getClient(apiToken: string): Cloudflare {
  const key = tokenKey(apiToken)
  const existing = clientCache.get(key)
  if (existing !== undefined) return existing
  const client = new Cloudflare({ apiToken })
  clientCache.set(key, client)
  return client
}

export function clearClients(): void {
  clientCache.clear()
}

export async function verifyToken(apiToken: string): Promise<void> {
  let status: string | undefined
  try {
    const result = await new Cloudflare({ apiToken }).user.tokens.verify()
    status = (result as unknown as { status?: string } | undefined)?.status
  } catch (err) {
    throw new AuthError('TOKEN_VERIFY_FAILED', `API token verification failed: ${causeDetail(err)}`, err)
  }
  if (status !== 'active') {
    throw new AuthError('TOKEN_NOT_ACTIVE', `API token is not active (status: ${status ?? 'unknown'})`)
  }
}
