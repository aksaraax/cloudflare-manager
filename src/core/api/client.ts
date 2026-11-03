import Cloudflare from 'cloudflare'

const clientCache = new Map<string, Cloudflare>()

function maskToken(apiToken: string): string {
  return apiToken.slice(-8)
}

export function getClient(apiToken: string): Cloudflare {
  const key = maskToken(apiToken)
  const existing = clientCache.get(key)
  if (existing !== undefined) return existing
  const client = new Cloudflare({ apiToken })
  clientCache.set(key, client)
  return client
}

export function clearClients(): void {
  clientCache.clear()
}
