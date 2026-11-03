import { type Context } from 'telegraf'
import { accountManager } from '../../core/config/accounts.js'
import { listWorkers } from '../../core/api/workers.js'
import { escapeHtml, formatTable } from '../utils.js'

function getApiToken(): string {
  const token =
    accountManager.getActiveToken() ??
    process.env['CFM_API_TOKEN'] ??
    process.env['CF_API_TOKEN'] ??
    process.env['CLOUDFLARE_API_TOKEN']
  if (!token) throw new Error('No Cloudflare API token configured')
  return token
}

export async function handleWorkers(ctx: Context): Promise<void> {
  const accountId = process.env['CF_ACCOUNT_ID'] ?? process.env['CFM_ACCOUNT_ID']
  if (!accountId) {
    await ctx.reply(
      '⚠️ <code>CF_ACCOUNT_ID</code> is not configured. Workers management requires an Account ID.',
      { parse_mode: 'HTML' },
    )
    return
  }

  try {
    const token = getApiToken()
    await ctx.reply('⏳ Fetching Cloudflare Workers…')
    const workers = await listWorkers(token, accountId)

    if (workers.length === 0) {
      await ctx.reply('No Workers found in this account.')
      return
    }

    const table = formatTable(
      ['Worker', 'Routes', 'Modified'],
      workers.map((w) => [
        w.name,
        String(w.routes.length),
        w.modifiedOn ? w.modifiedOn.slice(0, 10) : '-',
      ]),
    )

    await ctx.reply(
      `<b>Cloudflare Workers (${workers.length})</b>\n${table}`,
      { parse_mode: 'HTML' },
    )
  } catch (err) {
    await ctx.reply(
      `❌ Error: ${escapeHtml(err instanceof Error ? err.message : 'Unknown error')}`,
      { parse_mode: 'HTML' },
    )
  }
}

