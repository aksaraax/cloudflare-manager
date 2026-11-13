import { type Context } from 'telegraf'
import { listFirewallRules } from '../../core/api/firewall.js'
import { escapeHtml, formatTable, getApiToken, findZone } from '../utils.js'

export async function handleFirewall(ctx: Context): Promise<void> {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
  const parts = text.trim().split(/\s+/)
  const zoneQuery = parts[1]

  if (!zoneQuery) {
    await ctx.reply('Usage: /firewall &lt;zone_name&gt;', { parse_mode: 'HTML' })
    return
  }

  try {
    const token = getApiToken()
    const targetZone = await findZone(token, zoneQuery)

    if (!targetZone) {
      await ctx.reply(`Zone <b>${escapeHtml(zoneQuery)}</b> not found.`, {
        parse_mode: 'HTML',
      })
      return
    }

    const rules = await listFirewallRules(token, targetZone.id)
    if (rules.length === 0) {
      await ctx.reply(`No IP firewall rules found for <b>${escapeHtml(targetZone.name)}</b>.`, {
        parse_mode: 'HTML',
      })
      return
    }

    const table = formatTable(
      ['Mode', 'Target', 'Notes'],
      rules.map((r) => [
        r.mode.toUpperCase(),
        r.value.value,
        r.notes ? (r.notes.length > 20 ? r.notes.slice(0, 17) + '...' : r.notes) : '-',
      ]),
    )

    await ctx.reply(
      `<b>Firewall Rules for ${escapeHtml(targetZone.name)} (${rules.length})</b>\n${table}`,
      { parse_mode: 'HTML' },
    )
  } catch (err) {
    await ctx.reply(
      `❌ Error: ${escapeHtml(err instanceof Error ? err.message : 'Unknown error')}`,
      { parse_mode: 'HTML' },
    )
  }
}

