import { type Context } from 'telegraf'
import { accountManager } from '../../core/config/accounts.js'
import { listZones } from '../../core/api/zones.js'
import { getSslSettings } from '../../core/api/ssl.js'
import { escapeHtml } from '../utils.js'

function getApiToken(): string {
  const token =
    accountManager.getActiveToken() ??
    process.env['CFM_API_TOKEN'] ??
    process.env['CF_API_TOKEN'] ??
    process.env['CLOUDFLARE_API_TOKEN']
  if (!token) throw new Error('No Cloudflare API token configured')
  return token
}

export async function handleSsl(ctx: Context): Promise<void> {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
  const parts = text.trim().split(/\s+/)
  const zoneQuery = parts[1]

  if (!zoneQuery) {
    await ctx.reply('Usage: /ssl &lt;zone_name&gt;', { parse_mode: 'HTML' })
    return
  }

  try {
    const token = getApiToken()
    const zones = await listZones(token)
    const targetZone = zones.find(
      (z) => z.name.toLowerCase() === zoneQuery.toLowerCase(),
    )

    if (!targetZone) {
      await ctx.reply(`Zone <b>${escapeHtml(zoneQuery)}</b> not found.`, {
        parse_mode: 'HTML',
      })
      return
    }

    const settings = await getSslSettings(token, targetZone.id)
    const details = [
      `<b>SSL/TLS Settings for ${escapeHtml(targetZone.name)}</b>`,
      `<b>SSL Mode:</b> <code>${escapeHtml(settings.mode.toUpperCase())}</code>`,
      `<b>Always Use HTTPS:</b> ${settings.alwaysUseHttps ? '✅ ON' : '❌ OFF'}`,
      `<b>Min TLS Version:</b> ${escapeHtml(settings.minTlsVersion)}`,
      `<b>TLS 1.3:</b> ${escapeHtml(settings.tls13.toUpperCase())}`,
    ].join('\n')

    await ctx.reply(details, { parse_mode: 'HTML' })
  } catch (err) {
    await ctx.reply(
      `❌ Error: ${escapeHtml(err instanceof Error ? err.message : 'Unknown error')}`,
      { parse_mode: 'HTML' },
    )
  }
}

