import { ApiError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { withRetry } from '../utils/retry.js'
import { getClient } from './client.js'

export type FirewallMode = 'block' | 'allow' | 'challenge' | 'js_challenge'

export interface FirewallRule {
  id: string
  mode: FirewallMode
  value: { target: 'ip' | 'ip_range' | 'cidr'; value: string }
  notes: string
  createdOn: string
  modifiedOn: string
}

export interface CreateFirewallRule {
  mode: FirewallMode
  value: { target: 'ip' | 'ip_range' | 'cidr'; value: string }
  notes?: string
}

function toFirewallMode(raw: string): FirewallMode {
  if (raw === 'block' || raw === 'allow' || raw === 'challenge' || raw === 'js_challenge') {
    return raw
  }
  return 'block'
}

function toTargetType(raw: string): 'ip' | 'ip_range' | 'cidr' {
  if (raw === 'ip' || raw === 'ip_range' || raw === 'cidr') return raw
  return 'ip'
}

function mapFirewallRule(r: Record<string, unknown>): FirewallRule {
  const cfg = (r['configuration'] as Record<string, unknown> | undefined) ?? {}
  return {
    id: String(r['id'] ?? ''),
    mode: toFirewallMode(String(r['mode'] ?? '')),
    value: {
      target: toTargetType(String(cfg['target'] ?? 'ip')),
      value: String(cfg['value'] ?? ''),
    },
    notes: String(r['notes'] ?? ''),
    createdOn: String(r['created_on'] ?? ''),
    modifiedOn: String(r['modified_on'] ?? ''),
  }
}

export async function listFirewallRules(
  apiToken: string,
  zoneId: string,
): Promise<FirewallRule[]> {
  return withRetry(async () => {
    try {
      const client = getClient(apiToken)
      const result = await (client as unknown as {
        firewallAccessRules: {
          rules: {
            list: (params: Record<string, unknown>) => Promise<{ result: unknown[] }>
          }
        }
      }).firewallAccessRules.rules.list({ zone_id: zoneId })
      const raw = result.result ?? []
      return (raw as Record<string, unknown>[]).map(mapFirewallRule)
    } catch (err) {
      throw new ApiError(
        'FIREWALL_LIST_FAILED',
        `Failed to list firewall rules for zone ${zoneId}`,
        undefined,
        undefined,
        err,
      )
    }
  })
}

export async function createFirewallRule(
  apiToken: string,
  zoneId: string,
  data: CreateFirewallRule,
): Promise<FirewallRule> {
  return withRetry(async () => {
    try {
      const client = getClient(apiToken)
      const result = await (client as unknown as {
        firewallAccessRules: {
          rules: {
            create: (params: Record<string, unknown>) => Promise<{ result: unknown }>
          }
        }
      }).firewallAccessRules.rules.create({
        zone_id: zoneId,
        mode: data.mode,
        configuration: { target: data.value.target, value: data.value.value },
        notes: data.notes ?? '',
      })
      logger.info('firewall rule created', { zoneId })
      return mapFirewallRule(result.result as Record<string, unknown>)
    } catch (err) {
      throw new ApiError(
        'FIREWALL_CREATE_FAILED',
        `Failed to create firewall rule for zone ${zoneId}`,
        undefined,
        undefined,
        err,
      )
    }
  })
}

export async function updateFirewallRule(
  apiToken: string,
  zoneId: string,
  ruleId: string,
  mode: FirewallMode,
): Promise<FirewallRule> {
  return withRetry(async () => {
    try {
      const client = getClient(apiToken)
      const result = await (client as unknown as {
        firewallAccessRules: {
          rules: {
            edit: (id: string, params: Record<string, unknown>) => Promise<{ result: unknown }>
          }
        }
      }).firewallAccessRules.rules.edit(ruleId, { zone_id: zoneId, mode })
      logger.info('firewall rule updated', { zoneId, ruleId, mode })
      return mapFirewallRule(result.result as Record<string, unknown>)
    } catch (err) {
      throw new ApiError(
        'FIREWALL_UPDATE_FAILED',
        `Failed to update firewall rule ${ruleId}`,
        undefined,
        undefined,
        err,
      )
    }
  })
}

export async function deleteFirewallRule(
  apiToken: string,
  zoneId: string,
  ruleId: string,
): Promise<void> {
  await withRetry(async () => {
    try {
      const client = getClient(apiToken)
      await (client as unknown as {
        firewallAccessRules: {
          rules: {
            delete: (id: string, params: Record<string, unknown>) => Promise<unknown>
          }
        }
      }).firewallAccessRules.rules.delete(ruleId, { zone_id: zoneId })
      logger.info('firewall rule deleted', { zoneId, ruleId })
    } catch (err) {
      throw new ApiError(
        'FIREWALL_DELETE_FAILED',
        `Failed to delete firewall rule ${ruleId}`,
        undefined,
        undefined,
        err,
      )
    }
  })
}
