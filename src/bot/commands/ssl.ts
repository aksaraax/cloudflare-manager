import { type Context } from 'telegraf'
import { sessionManager } from '../../core/auth/session.js'
import { bulkSetSslMode, getSslSettings, type SslMode } from '../../core/api/ssl.js'
import { listZones } from '../../core/api/zones.js'
import { confirmKeyboard } from '../keyboards/index.js'
import { createProgress, escapeHtml, getApiToken, findZone, truncate } from '../utils.js'

const SSL_MODES: readonly SslMode[] = ['off', 'flexible', 'full', 'strict']
const FAILURE_PREVIEW_LIMIT = 10

function toSslMode(raw: string | undefined): SslMode | undefined {
  return SSL_MODES.find((m) => m === raw?.toLowerCase())
}

export async function handleSslBulk(ctx: Context): Promise<void> {
  const userId = ctx.from?.id
  if (!userId) return

  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
  const mode = toSslMode(text.trim().split(/\s+/)[1])

  if (!mode) {
    await ctx.reply('Usage: /ssl_bulk &lt;off|flexible|full|strict&gt;', { parse_mode: 'HTML' })
    return
  }

  try {
    const zones = await listZones(getApiToken())
    if (zones.length === 0) {
      await ctx.reply('No zones found.')
      return
    }

    sessionManager.setPendingFlow(userId, 'ssl-bulk', { mode })
    await ctx.reply(
      `⚠️ <b>Konfirmasi Bulk SSL</b>\n\n` +
        `SSL mode <code>${mode.toUpperCase()}</code> akan diterapkan ke <b>${zones.length} zone</b> di akun aktif.`,
      { parse_mode: 'HTML', reply_markup: confirmKeyboard('ssl-bulk') },
    )
  } catch (err) {
    await ctx.reply(
      `❌ Error: ${escapeHtml(err instanceof Error ? err.message : 'Unknown error')}`,
      { parse_mode: 'HTML' },
    )
  }
}

export async function executeSslBulk(ctx: Context, userId: number): Promise<void> {
  const flowState = sessionManager.getFlowState(userId)
  const mode = flowState?.flow === 'ssl-bulk' ? toSslMode(String(flowState.state['mode'])) : undefined

  if (!mode) {
    await ctx.answerCbQuery('Tidak ada operasi bulk SSL aktif.')
    return
  }

  sessionManager.clearFlow(userId)
  await ctx.answerCbQuery('⏳ Menerapkan SSL mode…')
  const progress = createProgress(ctx, `Menerapkan SSL ${mode.toUpperCase()}`)

  try {
    const token = getApiToken()
    const zones = await listZones(token)
    progress.update(0, zones.length)
    const results = await bulkSetSslMode(token, zones, mode, progress.update)
    await progress.stop()

    const failed = results.filter((r) => r.error !== undefined)
    const lines = [
      `✅ <b>Bulk SSL Selesai</b>`,
      `Mode: <code>${mode.toUpperCase()}</code>`,
      `Berhasil: <b>${results.length - failed.length}</b> | Gagal: <b>${failed.length}</b>`,
    ]
    for (const f of failed.slice(0, FAILURE_PREVIEW_LIMIT)) {
      lines.push(`❌ <code>${escapeHtml(f.zoneName)}</code>: ${escapeHtml(truncate(f.error ?? '', 100))}`)
    }
    if (failed.length > FAILURE_PREVIEW_LIMIT) {
      lines.push(`<i>...dan ${failed.length - FAILURE_PREVIEW_LIMIT} lainnya</i>`)
    }

    await ctx.editMessageText(lines.join('\n'), { parse_mode: 'HTML' })
  } catch (err) {
    await progress.stop()
    await ctx.editMessageText(
      `❌ Bulk SSL gagal: ${escapeHtml(err instanceof Error ? err.message : 'Unknown error')}`,
      { parse_mode: 'HTML' },
    )
  }
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
    const targetZone = await findZone(token, zoneQuery)

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

