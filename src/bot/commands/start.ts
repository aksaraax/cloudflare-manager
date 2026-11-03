import { type Context } from 'telegraf'
import { escapeHtml } from '../utils.js'

export async function handleStart(ctx: Context): Promise<void> {
  const name = escapeHtml(ctx.from?.first_name ?? 'there')
  await ctx.reply(
    `👋 Hello, <b>${name}</b>! Welcome to <b>Cloudflare Manager</b>.\n\n` +
      `<b>Available commands:</b>\n` +
      `/zones — List all zones\n` +
      `/zone &lt;name&gt; — Zone details\n` +
      `/dns &lt;zone&gt; — View DNS records\n` +
      `/dns_delete &lt;zone&gt; &lt;all|type|search&gt; — Bulk delete DNS records in a zone\n` +
      `/bulk — Bulk DNS provisioning (MX/SPF/DMARC/DKIM)\n` +
      `/bulk_delete — Bulk delete DNS records by domain/email list\n` +
      `/cache &lt;zone&gt; — Cache management\n` +
      `/firewall &lt;zone&gt; — Firewall rules\n` +
      `/ssl &lt;zone&gt; — SSL settings\n` +
      `/workers — Workers overview\n` +
      `/account — Account management\n` +
      `/cancel — Cancel current operation\n` +
      `/lock — Lock your session\n` +
      `/unlock — Unlock your session`,
    { parse_mode: 'HTML' },
  )
}
