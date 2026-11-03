import { type Context } from 'telegraf'
import { sessionManager } from '../../core/auth/session.js'
import { accountManager } from '../../core/config/accounts.js'
import { listZones } from '../../core/api/zones.js'
import { listDnsRecords, bulkDeleteDnsRecords } from '../../core/api/dns.js'
import { confirmKeyboard } from '../keyboards/index.js'
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

export async function handleDns(ctx: Context): Promise<void> {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
  const parts = text.trim().split(/\s+/)
  const zoneQuery = parts[1]

  if (!zoneQuery) {
    await ctx.reply('Usage: /dns &lt;zone_name&gt;', { parse_mode: 'HTML' })
    return
  }

  try {
    const token = getApiToken()
    await ctx.reply(`⏳ Looking up DNS records for <b>${escapeHtml(zoneQuery)}</b>…`, {
      parse_mode: 'HTML',
    })

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

    const records = await listDnsRecords(token, targetZone.id)
    if (records.length === 0) {
      await ctx.reply(`No DNS records found for <b>${escapeHtml(targetZone.name)}</b>.`, {
        parse_mode: 'HTML',
      })
      return
    }

    const table = formatTable(
      ['Type', 'Name', 'Content', 'TTL'],
      records.map((r) => [
        r.type,
        r.name,
        r.content.length > 25 ? r.content.slice(0, 22) + '...' : r.content,
        r.ttl === 1 ? 'Auto' : String(r.ttl),
      ]),
    )

    await ctx.reply(
      `<b>DNS Records for ${escapeHtml(targetZone.name)} (${records.length})</b>\n${table}`,
      { parse_mode: 'HTML' },
    )
  } catch (err) {
    await ctx.reply(
      `❌ Error: ${escapeHtml(err instanceof Error ? err.message : 'Unknown error')}`,
      { parse_mode: 'HTML' },
    )
  }
}

interface DnsDeleteSessionState {
  zoneId: string
  zoneName: string
  filter: string
  recordIds: string[]
  count: number
}

const VALID_RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA']

export async function handleDnsDelete(ctx: Context): Promise<void> {
  const userId = ctx.from?.id
  if (!userId) return

  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
  const parts = text.trim().split(/\s+/)
  const zoneQuery = parts[1]
  const filterQuery = parts[2]

  if (!zoneQuery) {
    let help = `<b>🗑️ Bulk Delete DNS Records</b>\n\n`
    help += `Penggunaan:\n`
    help += `• <code>/dns_delete &lt;zone&gt; all</code> - Hapus SEMUA DNS record di zone\n`
    help += `• <code>/dns_delete &lt;zone&gt; MX</code> - Hapus semua record MX\n`
    help += `• <code>/dns_delete &lt;zone&gt; TXT</code> - Hapus semua record TXT (SPF/DMARC)\n`
    help += `• <code>/dns_delete &lt;zone&gt; A</code> - Hapus semua record A\n`
    help += `• <code>/dns_delete &lt;zone&gt; &lt;nama/subdomain&gt;</code> - Hapus record berdasarkan nama\n\n`
    help += `<i>Contoh: <code>/dns_delete sampaikan.biz.id MX</code></i>\n\n`
    help += `💡 Untuk menghapus massal berdasarkan daftar email/domain yang di-paste, gunakan <code>/bulk_delete</code>.`
    await ctx.reply(help, { parse_mode: 'HTML' })
    return
  }

  if (!filterQuery) {
    await ctx.reply(
      `Tentukan apa yang ingin dihapus pada zone <b>${escapeHtml(zoneQuery)}</b>:\n\n` +
        `• <code>/dns_delete ${escapeHtml(zoneQuery)} all</code> (semua record)\n` +
        `• <code>/dns_delete ${escapeHtml(zoneQuery)} MX</code> (hanya MX)\n` +
        `• <code>/dns_delete ${escapeHtml(zoneQuery)} TXT</code> (hanya TXT / SPF / DMARC)\n` +
        `• <code>/dns_delete ${escapeHtml(zoneQuery)} &lt;keyword&gt;</code> (berdasarkan nama)`,
      { parse_mode: 'HTML' },
    )
    return
  }

  try {
    const token = getApiToken()
    await ctx.reply(`⏳ Mencari record di zone <b>${escapeHtml(zoneQuery)}</b>…`, {
      parse_mode: 'HTML',
    })

    const zones = await listZones(token)
    const targetZone = zones.find((z) => z.name.toLowerCase() === zoneQuery.toLowerCase())

    if (!targetZone) {
      await ctx.reply(`Zone <b>${escapeHtml(zoneQuery)}</b> tidak ditemukan.`, {
        parse_mode: 'HTML',
      })
      return
    }

    const allRecords = await listDnsRecords(token, targetZone.id)
    const filterUpper = filterQuery.toUpperCase()

    let matchedRecords = allRecords
    if (filterUpper === 'ALL') {
      matchedRecords = allRecords
    } else if (VALID_RECORD_TYPES.includes(filterUpper)) {
      matchedRecords = allRecords.filter((r) => r.type === filterUpper)
    } else {
      const q = filterQuery.toLowerCase()
      matchedRecords = allRecords.filter(
        (r) => r.name.toLowerCase() === q || r.name.toLowerCase().includes(q),
      )
    }

    if (matchedRecords.length === 0) {
      await ctx.reply(
        `ℹ️ Tidak ditemukan record yang cocok dengan filter <code>${escapeHtml(filterQuery)}</code> pada zone <b>${escapeHtml(targetZone.name)}</b>.`,
        { parse_mode: 'HTML' },
      )
      return
    }

    const state: DnsDeleteSessionState = {
      zoneId: targetZone.id,
      zoneName: targetZone.name,
      filter: filterQuery,
      recordIds: matchedRecords.map((r) => r.id),
      count: matchedRecords.length,
    }

    sessionManager.setPendingFlow(
      userId,
      'dns-delete',
      state as unknown as Record<string, unknown>,
    )

    let msg = `⚠️ <b>Konfirmasi Hapus DNS Record</b>\n\n`
    msg += `Zone: <code>${escapeHtml(targetZone.name)}</code>\n`
    msg += `Filter: <code>${escapeHtml(filterQuery)}</code>\n`
    msg += `Jumlah record ditemukan: <b>${matchedRecords.length} record</b>\n\n`
    msg += `Contoh record yang akan dihapus:\n`
    msg += matchedRecords
      .slice(0, 5)
      .map((r) => `• [${r.type}] <code>${escapeHtml(r.name)}</code> → <code>${escapeHtml(r.content.slice(0, 30))}</code>`)
      .join('\n')
    if (matchedRecords.length > 5) {
      msg += `\n<i>...dan ${matchedRecords.length - 5} record lainnya</i>`
    }
    msg += `\n\n<b>PERINGATAN: Tindakan ini permanen dan tidak dapat dibatalkan!</b>\n`
    msg += `Apakah Anda yakin ingin menghapus ${matchedRecords.length} record ini sekarang?`

    await ctx.reply(msg, {
      parse_mode: 'HTML',
      reply_markup: confirmKeyboard('dns-delete'),
    })
  } catch (err) {
    await ctx.reply(
      `❌ Error: ${escapeHtml(err instanceof Error ? err.message : 'Unknown error')}`,
      { parse_mode: 'HTML' },
    )
  }
}

export async function executeDnsDelete(ctx: Context, userId: number): Promise<void> {
  const flowState = sessionManager.getFlowState(userId)
  if (!flowState || flowState.flow !== 'dns-delete') {
    await ctx.answerCbQuery('Tidak ada operasi hapus DNS aktif.')
    return
  }

  const state = flowState.state as unknown as DnsDeleteSessionState
  if (!state.recordIds || state.recordIds.length === 0) {
    await ctx.answerCbQuery('Tidak ada record untuk dihapus.')
    sessionManager.clearFlow(userId)
    return
  }

  await ctx.answerCbQuery('⏳ Menghapus record DNS…')
  await ctx.editMessageText('⏳ Menghapus record DNS di Cloudflare…')

  try {
    const token = getApiToken()
    const result = await bulkDeleteDnsRecords(token, state.zoneId, {
      recordIds: state.recordIds,
      concurrency: 5,
    })

    sessionManager.clearFlow(userId)

    let msg = `✅ <b>Berhasil Menghapus DNS Record</b>\n\n`
    msg += `Zone: <code>${escapeHtml(state.zoneName)}</code>\n`
    msg += `Total Dihapus: <b>${result.deleted} record</b>\n`
    if (result.failed > 0) {
      msg += `Gagal: <b>${result.failed} record</b>\n`
    }

    await ctx.editMessageText(msg, { parse_mode: 'HTML' })
  } catch (err) {
    sessionManager.clearFlow(userId)
    await ctx.editMessageText(
      `❌ Gagal menghapus DNS: ${escapeHtml(err instanceof Error ? err.message : 'Unknown error')}`,
      { parse_mode: 'HTML' },
    )
  }
}

