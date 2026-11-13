import { type Context } from 'telegraf'
import { type InlineKeyboardMarkup } from 'telegraf/types'
import { sessionManager } from '../../core/auth/session.js'
import { addZones, deleteZone, listZones } from '../../core/api/zones.js'
import { parseDomainList } from '../../core/validation/domain.js'
import { confirmKeyboard, zonePageKeyboard } from '../keyboards/index.js'
import {
  createProgress,
  escapeHtml,
  findZone,
  formatTable,
  getApiToken,
  truncate,
} from '../utils.js'

const ZONES_PAGE_SIZE = 20
const INLINE_RESULT_LIMIT = 10
const MAX_SHARED_NAMESERVERS = 4

interface ZoneAddState {
  step: 'awaiting-paste' | 'awaiting-confirm'
  domains?: string[]
}

interface ZoneDeleteState {
  zoneId: string
  zoneName: string
}

function errorText(err: unknown): string {
  return escapeHtml(err instanceof Error ? err.message : 'Unknown error')
}

function sanitizeKeyword(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '')
    .slice(0, 40)
}

async function renderZones(
  page: number,
  keyword: string,
): Promise<{ text: string; keyboard: InlineKeyboardMarkup }> {
  const zones = await listZones(getApiToken())
  const filtered = keyword ? zones.filter((z) => z.name.includes(keyword)) : zones

  if (filtered.length === 0) {
    return {
      text: keyword
        ? `Tidak ada zone yang cocok dengan <code>${escapeHtml(keyword)}</code>.`
        : 'No zones found.',
      keyboard: { inline_keyboard: [] },
    }
  }

  const pageCount = Math.ceil(filtered.length / ZONES_PAGE_SIZE)
  const current = Math.min(Math.max(page, 1), pageCount)
  const start = (current - 1) * ZONES_PAGE_SIZE
  const table = formatTable(
    ['#', 'Zone', 'Status'],
    filtered
      .slice(start, start + ZONES_PAGE_SIZE)
      .map((z, i) => [String(start + i + 1), z.name, z.status]),
  )
  const title = keyword ? `Zones "${escapeHtml(keyword)}"` : 'Zones'

  return {
    text: `<b>${title} (${filtered.length})</b> — hal. ${current}/${pageCount}\n${table}`,
    keyboard: zonePageKeyboard(current, pageCount, keyword),
  }
}

export async function handleZones(ctx: Context): Promise<void> {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
  const keyword = sanitizeKeyword(text.trim().split(/\s+/)[1] ?? '')

  try {
    await ctx.reply('⏳ Fetching zones…')
    const view = await renderZones(1, keyword)
    await ctx.reply(view.text, { parse_mode: 'HTML', reply_markup: view.keyboard })
  } catch (err) {
    await ctx.reply(`❌ Error: ${errorText(err)}`, { parse_mode: 'HTML' })
  }
}

export async function handleZonesPage(ctx: Context, data: string): Promise<void> {
  const [, pageRaw, keywordRaw] = data.split(':')
  try {
    const view = await renderZones(Number(pageRaw) || 1, sanitizeKeyword(keywordRaw ?? ''))
    await ctx.editMessageText(view.text, { parse_mode: 'HTML', reply_markup: view.keyboard })
    await ctx.answerCbQuery()
  } catch (err) {
    await ctx.answerCbQuery(truncate(err instanceof Error ? err.message : 'Unknown error', 180))
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

    const found = await findZone(getApiToken(), zoneName)

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
    await ctx.reply(`❌ Error: ${errorText(err)}`, { parse_mode: 'HTML' })
  }
}

export async function handleZoneAdd(ctx: Context, inputText?: string): Promise<void> {
  const userId = ctx.from?.id
  if (!userId) return

  const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
  const raw =
    inputText ??
    (messageText.startsWith('/')
      ? messageText.trim().split(/\s+/).slice(1).join(' ')
      : messageText)

  if (!raw.trim()) {
    sessionManager.setPendingFlow(userId, 'zone-add', {
      step: 'awaiting-paste',
    } satisfies ZoneAddState as unknown as Record<string, unknown>)
    await ctx.reply(
      '<b>➕ Tambah Domain ke Cloudflare</b>\n\n' +
        'Kirim daftar domain (dipisah spasi, koma, atau baris baru), atau upload file <code>.txt</code>.\n' +
        'Hanya domain utama (apex) yang diterima, contoh: <code>example.com</code>.\n\n' +
        'Kirim /cancel untuk membatalkan.',
      { parse_mode: 'HTML' },
    )
    return
  }

  try {
    const token = getApiToken()
    const { domains, invalid } = parseDomainList(raw)
    const existing = new Set((await listZones(token)).map((z) => z.name))
    const fresh = domains.filter((d) => !existing.has(d))
    const alreadyAdded = domains.length - fresh.length

    const notes: string[] = []
    if (alreadyAdded > 0) notes.push(`Sudah ada di akun (dilewati): <b>${alreadyAdded}</b>`)
    if (invalid.length > 0) {
      const sample = invalid.slice(0, 5).map((d) => escapeHtml(truncate(d, 40))).join(', ')
      notes.push(`Tidak valid / bukan domain utama: <b>${invalid.length}</b> (${sample})`)
    }

    if (fresh.length === 0) {
      sessionManager.clearFlow(userId)
      await ctx.reply(['⚠️ Tidak ada domain baru untuk ditambahkan.', ...notes].join('\n'), {
        parse_mode: 'HTML',
      })
      return
    }

    sessionManager.setPendingFlow(userId, 'zone-add', {
      step: 'awaiting-confirm',
      domains: fresh,
    } satisfies ZoneAddState as unknown as Record<string, unknown>)

    const preview = fresh
      .slice(0, INLINE_RESULT_LIMIT)
      .map((d) => `• <code>${escapeHtml(d)}</code>`)
    if (fresh.length > INLINE_RESULT_LIMIT) {
      preview.push(`<i>...dan ${fresh.length - INLINE_RESULT_LIMIT} domain lainnya</i>`)
    }

    await ctx.reply(
      [
        `<b>➕ Konfirmasi Tambah Domain (${fresh.length})</b>`,
        '',
        ...preview,
        '',
        ...notes,
        'Tambahkan domain ini ke Cloudflare sekarang?',
      ].join('\n'),
      { parse_mode: 'HTML', reply_markup: confirmKeyboard('zone-add') },
    )
  } catch (err) {
    sessionManager.clearFlow(userId)
    await ctx.reply(`❌ Error: ${errorText(err)}`, { parse_mode: 'HTML' })
  }
}

export async function executeZoneAdd(ctx: Context, userId: number): Promise<void> {
  const flowState = sessionManager.getFlowState(userId)
  const domains =
    flowState?.flow === 'zone-add'
      ? (flowState.state as unknown as ZoneAddState).domains
      : undefined

  if (!domains || domains.length === 0) {
    await ctx.answerCbQuery('Tidak ada operasi tambah domain aktif.')
    return
  }

  sessionManager.clearFlow(userId)
  await ctx.answerCbQuery('⏳ Menambahkan domain…')
  const progress = createProgress(ctx, 'Menambahkan domain ke Cloudflare')
  progress.update(0, domains.length)

  try {
    const results = await addZones(getApiToken(), domains, progress.update)
    await progress.stop()

    const added = results.filter((r) => r.zone !== undefined)
    const nameservers = [...new Set(added.flatMap((r) => r.zone?.nameservers ?? []))]
    const sharedNameservers = nameservers.length > 0 && nameservers.length <= MAX_SHARED_NAMESERVERS

    const lines = [
      '<b>➕ Tambah Domain Selesai</b>',
      `Berhasil: <b>${added.length}</b> | Gagal: <b>${results.length - added.length}</b>`,
    ]
    if (sharedNameservers) {
      lines.push('', '<b>Arahkan nameserver di registrar ke:</b>')
      lines.push(...nameservers.map((ns) => `<code>${escapeHtml(ns)}</code>`))
    }
    lines.push('')
    for (const r of results.slice(0, INLINE_RESULT_LIMIT)) {
      lines.push(
        r.zone !== undefined
          ? `✅ <code>${escapeHtml(r.name)}</code>`
          : `❌ <code>${escapeHtml(r.name)}</code>: ${escapeHtml(truncate(r.error ?? '', 120))}`,
      )
    }
    const needsReport = results.length > INLINE_RESULT_LIMIT || (added.length > 0 && !sharedNameservers)
    if (needsReport) lines.push('<i>Detail lengkap ada di file laporan.</i>')

    await ctx.editMessageText(lines.join('\n'), { parse_mode: 'HTML' })

    if (needsReport) {
      const report = results
        .map((r) =>
          r.zone !== undefined
            ? `${r.name}\tOK\t${r.zone.nameservers.join(', ')}`
            : `${r.name}\tFAILED\t${r.error ?? ''}`,
        )
        .join('\n')
      await ctx.replyWithDocument({
        source: Buffer.from(report, 'utf8'),
        filename: 'zone-add-report.txt',
      })
    }
  } catch (err) {
    await progress.stop()
    await ctx.editMessageText(`❌ Gagal menambahkan domain: ${errorText(err)}`, {
      parse_mode: 'HTML',
    })
  }
}

export async function handleZoneDelete(ctx: Context): Promise<void> {
  const userId = ctx.from?.id
  if (!userId) return

  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
  const zoneQuery = text.trim().split(/\s+/)[1]

  if (!zoneQuery) {
    await ctx.reply('Usage: /zone_delete &lt;zone_name&gt;', { parse_mode: 'HTML' })
    return
  }

  try {
    const zone = await findZone(getApiToken(), zoneQuery)
    if (!zone) {
      await ctx.reply(`Zone <b>${escapeHtml(zoneQuery)}</b> tidak ditemukan.`, {
        parse_mode: 'HTML',
      })
      return
    }

    sessionManager.setPendingFlow(userId, 'zone-delete', {
      zoneId: zone.id,
      zoneName: zone.name,
    } satisfies ZoneDeleteState as unknown as Record<string, unknown>)

    await ctx.reply(
      `⚠️ <b>Konfirmasi Hapus Zone</b>\n\n` +
        `Zone: <code>${escapeHtml(zone.name)}</code>\n\n` +
        `<b>PERINGATAN: Zone beserta seluruh DNS record dan pengaturannya akan dihapus permanen!</b>`,
      { parse_mode: 'HTML', reply_markup: confirmKeyboard('zone-delete') },
    )
  } catch (err) {
    await ctx.reply(`❌ Error: ${errorText(err)}`, { parse_mode: 'HTML' })
  }
}

export async function executeZoneDelete(ctx: Context, userId: number): Promise<void> {
  const flowState = sessionManager.getFlowState(userId)
  if (!flowState || flowState.flow !== 'zone-delete') {
    await ctx.answerCbQuery('Tidak ada operasi hapus zone aktif.')
    return
  }

  const state = flowState.state as unknown as ZoneDeleteState
  sessionManager.clearFlow(userId)
  await ctx.answerCbQuery('⏳ Menghapus zone…')

  try {
    await deleteZone(getApiToken(), state.zoneId)
    await ctx.editMessageText(`✅ Zone <code>${escapeHtml(state.zoneName)}</code> berhasil dihapus.`, {
      parse_mode: 'HTML',
    })
  } catch (err) {
    await ctx.editMessageText(`❌ Gagal menghapus zone: ${errorText(err)}`, { parse_mode: 'HTML' })
  }
}
