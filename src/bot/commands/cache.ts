import { type Context } from 'telegraf'
import { accountManager } from '../../core/config/accounts.js'
import { listZones } from '../../core/api/zones.js'
import { purgeEverything } from '../../core/api/cache.js'
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

export async function handleCache(ctx: Context): Promise<void> {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
  const parts = text.trim().split(/\s+/)
  const zoneQuery = parts[1]
  const action = parts[2]

  if (!zoneQuery) {
    await ctx.reply('Usage: /cache &lt;zone_name&gt; [purge_all]', { parse_mode: 'HTML' })
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

    if (action === 'purge_all' || action === 'all') {
      await ctx.reply(`⏳ Purging all cache for <b>${escapeHtml(targetZone.name)}</b>…`, {
        parse_mode: 'HTML',
      })
      const res = await purgeEverything(token, targetZone.id)
      await ctx.reply(
        `✅ Cache purged successfully for <b>${escapeHtml(targetZone.name)}</b>!\nRequest ID: <code>${escapeHtml(res.requestId)}</code>`,
        { parse_mode: 'HTML' },
      )
      return
    }

    await ctx.reply(
      `<b>Cache Management: ${escapeHtml(targetZone.name)}</b>\n\nTo purge all cache for this zone, run:\n<code>/cache ${escapeHtml(targetZone.name)} purge_all</code>`,
      { parse_mode: 'HTML' },
    )
  } catch (err) {
    await ctx.reply(
      `❌ Error: ${escapeHtml(err instanceof Error ? err.message : 'Unknown error')}`,
      { parse_mode: 'HTML' },
    )
  }
}

