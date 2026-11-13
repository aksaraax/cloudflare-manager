import { mapConcurrent } from '../utils/concurrency.js'
import { ApiError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { withRetry } from '../utils/retry.js'
import { getClient } from './client.js'

export type SslMode = 'off' | 'flexible' | 'full' | 'strict'

export interface SslSettings {
  mode: SslMode
  alwaysUseHttps: boolean
  minTlsVersion: '1.0' | '1.1' | '1.2' | '1.3'
  tls13: 'on' | 'off' | 'zrt'
}

function toSslMode(raw: string): SslMode {
  if (raw === 'off' || raw === 'flexible' || raw === 'full' || raw === 'strict') return raw
  return 'off'
}

function toMinTlsVersion(raw: string): '1.0' | '1.1' | '1.2' | '1.3' {
  if (raw === '1.0' || raw === '1.1' || raw === '1.2' || raw === '1.3') return raw
  return '1.0'
}

function toTls13Value(raw: string): 'on' | 'off' | 'zrt' {
  if (raw === 'on' || raw === 'off' || raw === 'zrt') return raw
  return 'off'
}

function extractSettingValue(raw: unknown): string {
  if (raw !== null && typeof raw === 'object' && 'value' in raw) {
    return String((raw as Record<string, unknown>)['value'] ?? '')
  }
  return String(raw ?? '')
}

export async function getSslSettings(apiToken: string, zoneId: string): Promise<SslSettings> {
  return withRetry(async () => {
    try {
      const client = getClient(apiToken)
      const [sslResult, httpsResult, minTlsResult, tls13Result] = await Promise.all([
        client.zones.settings.get('ssl', { zone_id: zoneId }),
        client.zones.settings.get('always_use_https', { zone_id: zoneId }),
        client.zones.settings.get('min_tls_version', { zone_id: zoneId }),
        client.zones.settings.get('tls_1_3', { zone_id: zoneId }),
      ])
      return {
        mode: toSslMode(extractSettingValue(sslResult)),
        alwaysUseHttps: extractSettingValue(httpsResult) === 'on',
        minTlsVersion: toMinTlsVersion(extractSettingValue(minTlsResult)),
        tls13: toTls13Value(extractSettingValue(tls13Result)),
      }
    } catch (err) {
      throw new ApiError(
        'SSL_GET_SETTINGS_FAILED',
        `Failed to get SSL settings for zone ${zoneId}`,
        undefined,
        undefined,
        err,
      )
    }
  })
}

export async function setSslMode(apiToken: string, zoneId: string, mode: SslMode): Promise<void> {
  await withRetry(async () => {
    try {
      const client = getClient(apiToken)
      await client.zones.settings.edit('ssl', { zone_id: zoneId, value: mode })
      logger.info('ssl mode set', { zoneId, mode })
    } catch (err) {
      throw new ApiError(
        'SSL_SET_MODE_FAILED',
        `Failed to set SSL mode for zone ${zoneId}`,
        undefined,
        undefined,
        err,
      )
    }
  })
}

export async function setAlwaysUseHttps(
  apiToken: string,
  zoneId: string,
  enabled: boolean,
): Promise<void> {
  await withRetry(async () => {
    try {
      const client = getClient(apiToken)
      await client.zones.settings.edit('always_use_https', {
        zone_id: zoneId,
        value: enabled ? ('on' as const) : ('off' as const),
      })
      logger.info('always use https set', { zoneId, enabled })
    } catch (err) {
      throw new ApiError(
        'SSL_SET_ALWAYS_HTTPS_FAILED',
        `Failed to set always use HTTPS for zone ${zoneId}`,
        undefined,
        undefined,
        err,
      )
    }
  })
}

export async function setMinTlsVersion(
  apiToken: string,
  zoneId: string,
  version: SslSettings['minTlsVersion'],
): Promise<void> {
  await withRetry(async () => {
    try {
      const client = getClient(apiToken)
      await client.zones.settings.edit('min_tls_version', { zone_id: zoneId, value: version })
      logger.info('min tls version set', { zoneId, version })
    } catch (err) {
      throw new ApiError(
        'SSL_SET_MIN_TLS_FAILED',
        `Failed to set min TLS version for zone ${zoneId}`,
        undefined,
        undefined,
        err,
      )
    }
  })
}

export async function setTls13(
  apiToken: string,
  zoneId: string,
  value: SslSettings['tls13'],
): Promise<void> {
  await withRetry(async () => {
    try {
      const client = getClient(apiToken)
      await client.zones.settings.edit('tls_1_3', { zone_id: zoneId, value })
      logger.info('tls 1.3 set', { zoneId, value })
    } catch (err) {
      throw new ApiError(
        'SSL_SET_TLS13_FAILED',
        `Failed to set TLS 1.3 for zone ${zoneId}`,
        undefined,
        undefined,
        err,
      )
    }
  })
}

export interface BulkSslResult {
  zoneName: string
  error?: string
}

const BULK_SSL_CONCURRENCY = 5

export async function bulkSetSslMode(
  apiToken: string,
  zones: ReadonlyArray<{ id: string; name: string }>,
  mode: SslMode,
  onProgress?: (done: number, total: number) => void,
): Promise<BulkSslResult[]> {
  let done = 0

  return mapConcurrent(zones, BULK_SSL_CONCURRENCY, async (zone) => {
    let result: BulkSslResult
    try {
      await setSslMode(apiToken, zone.id, mode)
      result = { zoneName: zone.name }
    } catch (err) {
      result = { zoneName: zone.name, error: err instanceof Error ? err.message : String(err) }
    }
    onProgress?.(++done, zones.length)
    return result
  })
}
