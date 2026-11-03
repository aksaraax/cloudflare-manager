import { type Context } from 'telegraf'
import { accountManager } from '../../core/config/accounts.js'
import { accountListKeyboard } from '../keyboards/index.js'
import { escapeHtml } from '../utils.js'

export async function handleAccount(ctx: Context): Promise<void> {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
  const parts = text.trim().split(/\s+/)
  const subCommand = parts[1]

  if (!subCommand || subCommand === 'list') {
    await handleAccountList(ctx)
    return
  }

  if (subCommand === 'switch') {
    const name = parts.slice(2).join(' ')
    if (!name) {
      await ctx.reply('Usage: /account switch &lt;name&gt;', { parse_mode: 'HTML' })
      return
    }
    try {
      await accountManager.switchAccount(name)
      await ctx.reply(`✅ Active account switched to: <b>${escapeHtml(name)}</b>`, {
        parse_mode: 'HTML',
      })
    } catch (err) {
      await ctx.reply(
        `❌ Error: ${escapeHtml(err instanceof Error ? err.message : 'Switch failed')}`,
        { parse_mode: 'HTML' },
      )
    }
    return
  }

  await ctx.reply('Usage: /account list | /account switch &lt;name&gt;', {
    parse_mode: 'HTML',
  })
}

async function handleAccountList(ctx: Context): Promise<void> {
  if (accountManager.isLocked()) {
    const envName = process.env['CFM_ACCOUNT_NAME'] ?? 'default'
    await ctx.reply(
      `<b>Config is locked or using environment mode.</b>\nActive Account: <code>${escapeHtml(envName)}</code>`,
      { parse_mode: 'HTML' },
    )
    return
  }

  const accounts = accountManager.listAccounts()
  const activeName = accountManager.getActiveAccountName()

  if (accounts.length === 0) {
    await ctx.reply('No accounts found in configuration.')
    return
  }

  let text = `<b>Cloudflare Accounts (${accounts.length})</b>\n\n`
  for (const acc of accounts) {
    const isCurrent = acc.name === activeName ? ' ★ (Active)' : ''
    text += `• <b>${escapeHtml(acc.name)}</b>: <code>${escapeHtml(acc.maskedToken)}</code>${isCurrent}\n`
  }
  text += `\nTo switch, use <code>/account switch &lt;name&gt;</code>`

  const keyboard = accountListKeyboard(accounts)
  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  })
}
