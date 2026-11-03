import { type Context } from 'telegraf'
import { accountManager } from '../../core/config/accounts.js'
import { listZones } from '../../core/api/zones.js'
import { formatTable, escapeHtml } from '../utils.js'

function getApiToken(): string {
  const token =
    accountManager.getActiveToken() ??
    process.env['CFM_API_TOKEN'] ??
    process.env['CF_API_TOKEN'] ??
    process.env['CLOUDFLARE_API_TOKEN']
  if (!token) throw new Error('No Cloudflare API token configured (set CFM_API_TOKEN in .env or add an account)')
  return token
}

export async function handleZones(ctx: Context): Promise<void> {
  try {
    await ctx.reply('⏳ Fetching zones…')
    const token = getApiToken()
    const zones = await listZones(token)

    if (zones.length === 0) {
      await ctx.reply('No zones found.')
      return
    }

    const table = formatTable(
      ['Zone', 'Status'],
      zones.map((z) => [z.name, z.status]),
    )

    await ctx.reply(`<b>Zones (${zones.length})</b>\n${table}`, { parse_mode: 'HTML' })
  } catch (err) {
    await ctx.reply(
      `❌ Error: ${escapeHtml(err instanceof Error ? err.message : 'Unknown error')}`,
      { parse_mode: 'HTML' },
    )
  }
}

export async function handleZone(ctx: Context): Promise<void> {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
  const parts = text.trim().split(/\s+/)
  const zoneName = parts[1]

  if (!zoneName) {
    await ctx.reply('Usage: /zone &lt;name&gt;', { parse_mode: 'HTML' })
    return
  }

  try {
    await ctx.reply(`⏳ Looking up zone <b>${escapeHtml(zoneName)}</b>…`, { parse_mode: 'HTML' })

    const token = getApiToken()
    const zones = await listZones(token)
    const found = zones.find((z) => z.name.toLowerCase() === zoneName.toLowerCase())

    if (!found) {
      await ctx.reply(`Zone <b>${escapeHtml(zoneName)}</b> not found.`, { parse_mode: 'HTML' })
      return
    }

    const details = [
      `<b>Name:</b> ${escapeHtml(found.name)}`,
      `<b>ID:</b> <code>${escapeHtml(found.id)}</code>`,
      `<b>Status:</b> ${escapeHtml(found.status)}`,
      `<b>Plan:</b> ${escapeHtml(found.plan || 'N/A')}`,
      `<b>Name Servers:</b> ${(found.nameservers ?? []).map(escapeHtml).join(', ')}`,
    ].join('\n')

    await ctx.reply(details, { parse_mode: 'HTML' })
  } catch (err) {
    await ctx.reply(
      `❌ Error: ${escapeHtml(err instanceof Error ? err.message : 'Unknown error')}`,
      { parse_mode: 'HTML' },
    )
  }
}
