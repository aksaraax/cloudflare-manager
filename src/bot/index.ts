import { Telegraf } from 'telegraf'
import { authMiddleware } from './middleware/auth.js'
import { rateLimitMiddleware } from './middleware/rateLimit.js'
import { sessionManager } from '../core/auth/session.js'
import { logger } from '../core/utils/logger.js'
import { handleStart } from './commands/start.js'
import { handleZones, handleZone } from './commands/zones.js'
import { handleDns, handleDnsDelete, executeDnsDelete } from './commands/dns.js'
import {
  handleBulk,
  handleBundleToggle,
  handleBundleProceed,
  handleBundleDefaults,
  executeBulkImport,
  handleBulkDelete,
  handleBulkDeleteTypeSelect,
  executeBulkDelete,
} from './commands/bulk.js'
import { handleCache } from './commands/cache.js'
import { handleFirewall } from './commands/firewall.js'
import { handleSsl } from './commands/ssl.js'
import { handleWorkers } from './commands/workers.js'
import { handleAccount } from './commands/account.js'
import { accountManager } from '../core/config/accounts.js'

export async function startBot(): Promise<void> {
  const token = process.env['TELEGRAM_BOT_TOKEN']
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN environment variable is required in bot mode')
  }

  const bot = new Telegraf(token)

  bot.catch(async (err, ctx) => {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('Bot error', { message })
    try {
      await ctx.reply(`❌ Terjadi error: ${message}`)
    } catch {
      // Ignore if reply fails (e.g. chat was deleted)
    }
  })

  bot.use(authMiddleware)
  bot.use(rateLimitMiddleware)

  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id
    if (userId) {
      sessionManager.touch(userId)
    }
    await next()
  })

  bot.command('start', handleStart)
  bot.command('zones', handleZones)
  bot.command('zone', handleZone)
  bot.command('dns', handleDns)
  bot.command('dns_delete', handleDnsDelete)
  bot.command('dnsdelete', handleDnsDelete)
  bot.command('bulk', handleBulk)
  bot.command('bulk_delete', handleBulkDelete)
  bot.command('bulkdelete', handleBulkDelete)
  bot.command('cache', handleCache)
  bot.command('firewall', handleFirewall)
  bot.command('ssl', handleSsl)
  bot.command('workers', handleWorkers)
  bot.command('account', handleAccount)

  bot.command('cancel', async (ctx) => {
    const userId = ctx.from?.id
    if (userId) {
      sessionManager.clearFlow(userId)
    }
    await ctx.reply('🚫 Current operation cancelled.')
  })

  bot.command('lock', async (ctx) => {
    const userId = ctx.from?.id
    if (userId) {
      sessionManager.lock(userId)
    }
    await ctx.reply('🔒 Session locked.')
  })

  bot.command('unlock', async (ctx) => {
    const userId = ctx.from?.id
    if (userId) {
      sessionManager.unlock(userId)
    }
    await ctx.reply('🔓 Session unlocked.')
  })

  bot.on('text', async (ctx, next) => {
    const userId = ctx.from?.id
    if (userId) {
      const flowState = sessionManager.getFlowState(userId)
      if (flowState?.flow === 'bulk') {
        await handleBulk(ctx)
        return
      }
      if (flowState?.flow === 'bulk-delete') {
        await handleBulkDelete(ctx)
        return
      }
    }
    await next()
  })

  bot.on('callback_query', async (ctx) => {
    const userId = ctx.from?.id
    if (!userId) return

    const data = 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : ''
    if (!data) return

    if (data.startsWith('bundle-toggle:')) {
      await handleBundleToggle(ctx, userId, data)
      return
    }

    if (data === 'bundle-proceed') {
      await handleBundleProceed(ctx, userId)
      return
    }

    if (data === 'bundle-defaults') {
      await handleBundleDefaults(ctx, userId)
      return
    }

    if (data === 'confirm:bulk-import') {
      await executeBulkImport(ctx, userId)
      return
    }

    if (data === 'cancel:bulk-import') {
      sessionManager.clearFlow(userId)
      await ctx.answerCbQuery('Operation cancelled.')
      await ctx.editMessageText('🚫 Bulk import cancelled.')
      return
    }

    if (data.startsWith('bulkdel-type:')) {
      await handleBulkDeleteTypeSelect(ctx, userId, data)
      return
    }

    if (data === 'confirm:bulk-delete') {
      await executeBulkDelete(ctx, userId)
      return
    }

    if (data === 'cancel:bulk-delete') {
      sessionManager.clearFlow(userId)
      await ctx.answerCbQuery('Operation cancelled.')
      await ctx.editMessageText('🚫 Bulk delete cancelled.')
      return
    }

    if (data === 'confirm:dns-delete') {
      await executeDnsDelete(ctx, userId)
      return
    }

    if (data === 'cancel:dns-delete') {
      sessionManager.clearFlow(userId)
      await ctx.answerCbQuery('Operation cancelled.')
      await ctx.editMessageText('🚫 DNS delete cancelled.')
      return
    }

    if (data.startsWith('switch-account:')) {
      const targetName = data.slice('switch-account:'.length)
      try {
        await accountManager.switchAccount(targetName)
        await ctx.answerCbQuery(`Switched to ${targetName}`)
        await ctx.reply(`✅ Switched active account to: <b>${targetName}</b>`, {
          parse_mode: 'HTML',
        })
      } catch (err) {
        await ctx.answerCbQuery('Failed to switch')
        await ctx.reply(`❌ Switch failed: ${err instanceof Error ? err.message : 'Unknown'}`)
      }
      return
    }

    await ctx.answerCbQuery()
  })

  const IDLE_TIMEOUT_MS = 15 * 60 * 1000
  setInterval(() => {
    sessionManager.checkIdleTimeout(IDLE_TIMEOUT_MS)
  }, 60_000)

  logger.info('Starting Cloudflare Manager Telegram Bot...')

  const webhookUrl = process.env['CFM_WEBHOOK_URL']
  if (webhookUrl) {
    const port = parseInt(process.env['PORT'] ?? '3000', 10)
    await bot.telegram.setWebhook(webhookUrl)
    logger.info(`Bot webhook enabled on ${webhookUrl} (port ${port})`)
  } else {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true })
    void bot.launch()
    logger.info('Bot polling started successfully')
  }

  process.once('SIGINT', () => bot.stop('SIGINT'))
  process.once('SIGTERM', () => bot.stop('SIGTERM'))
}

