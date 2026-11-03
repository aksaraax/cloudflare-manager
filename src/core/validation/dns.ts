import { z } from 'zod'
import { ValidationError } from '../utils/errors.js'

const IPV4_REGEX =
  /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/

const IPV6_REGEX = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::$|^(([0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4})?::(([0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4})?$/

const FQDN_REGEX = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z0-9-]{1,63})*\.?$/

const CIDR_REGEX = /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)\/(3[0-2]|[12]?\d)$/

const IP_RANGE_REGEX =
  /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)-((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/

export const dnsRecordSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('A'),
    name: z.string().min(1),
    content: z.string().regex(IPV4_REGEX, 'Invalid IPv4 address'),
    ttl: z.number().int().min(1).optional(),
    proxied: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('AAAA'),
    name: z.string().min(1),
    content: z.string().regex(IPV6_REGEX, 'Invalid IPv6 address'),
    ttl: z.number().int().min(1).optional(),
    proxied: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('CNAME'),
    name: z.string().min(2),
    content: z.string().regex(FQDN_REGEX, 'Invalid hostname'),
    ttl: z.number().int().min(1).optional(),
    proxied: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('MX'),
    name: z.string().min(1),
    content: z.string().regex(FQDN_REGEX, 'Invalid mail server hostname'),
    priority: z.number().int().min(0).max(65535),
    ttl: z.number().int().min(1).optional(),
    proxied: z.literal(false).optional(),
  }),
  z.object({
    type: z.literal('TXT'),
    name: z.string().min(1),
    content: z.string().min(1).max(2048),
    ttl: z.number().int().min(1).optional(),
    proxied: z.literal(false).optional(),
  }),
  z.object({
    type: z.literal('NS'),
    name: z.string().min(1),
    content: z.string().regex(FQDN_REGEX, 'Invalid nameserver hostname'),
    ttl: z.number().int().min(1).optional(),
    proxied: z.literal(false).optional(),
  }),
])

export type ValidDnsRecord = z.infer<typeof dnsRecordSchema>

export function validateDnsRecord(data: unknown): ValidDnsRecord {
  const result = dnsRecordSchema.safeParse(data)
  if (!result.success) {
    const firstError = result.error.errors[0]
    const field = firstError?.path.join('.') ?? 'unknown'
    const message = firstError?.message ?? 'Invalid DNS record'
    throw new ValidationError('DNS_VALIDATION_FAILED', message, field)
  }
  return result.data
}

export function canBeProxied(type: string): boolean {
  return type === 'A' || type === 'AAAA' || type === 'CNAME'
}

export function validateFirewallTarget(value: string): {
  target: 'ip' | 'ip_range' | 'cidr'
  value: string
} {
  if (IPV4_REGEX.test(value)) {
    return { target: 'ip', value }
  }
  if (CIDR_REGEX.test(value)) {
    return { target: 'cidr', value }
  }
  if (IP_RANGE_REGEX.test(value)) {
    return { target: 'ip_range', value }
  }
  throw new ValidationError(
    'INVALID_FIREWALL_TARGET',
    `Invalid IP address, CIDR, or range: ${value}`,
    'value',
  )
}

