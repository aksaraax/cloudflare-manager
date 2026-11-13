import { type Context } from 'telegraf'
import { escapeHtml } from '../utils.js'

export async function handleStart(ctx: Context): Promise<void> {
  const name = escapeHtml(ctx.from?.first_name ?? 'there')
  await ctx.reply(
    `👋 Hello, <b>${name}</b>! Welcome to <b>Cloudflare Manager</b>.\n\n` +
      `<b>Available commands:</b>\n` +
      `/zones [keyword] — List/search zones (paginated)\n` +
      `/zone &lt;name&gt; — Zone details\n` +
      `/zone_add [domains] — Add domains (text or .txt upload)\n` +
      `/zone_delete &lt;zone&gt; — Delete a zone\n` +
      `/dns &lt;zone&gt; — View DNS records\n` +
      `/dns_edit &lt;zone&gt; &lt;type&gt; &lt;name&gt; ... — Edit a DNS record\n` +
      `/dns_export &lt;zone&gt; — Export DNS records (BIND file)\n` +
      `/dns_delete &lt;zone&gt; &lt;all|type|search&gt; — Bulk delete DNS records in a zone\n` +
      `/bulk — Bulk DNS provisioning (MX/SPF/DMARC/DKIM), text or .txt upload\n` +
      `/bulk_delete — Bulk delete DNS records by domain/email list, text or .txt upload\n` +
      `/cache &lt;zone&gt; — Cache management\n` +
      `/firewall &lt;zone&gt; — Firewall rules\n` +
      `/ssl &lt;zone&gt; — SSL settings\n` +
      `/ssl_bulk &lt;mode&gt; — Set SSL mode on all zones\n` +
      `/workers — Workers overview\n` +
      `/account — Account management\n` +
      `/help — Show this list\n` +
      `/cancel — Cancel current operation\n` +
      `/lock — Lock your session\n` +
      `/unlock — Unlock your session`,
    { parse_mode: 'HTML' },
  )
}
