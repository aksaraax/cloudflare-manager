import { type Context } from 'telegraf'
import { sessionManager } from '../../core/auth/session.js'
import {
  listDnsRecords,
  bulkDeleteDnsRecords,
  updateDnsRecord,
  exportDnsZone,
} from '../../core/api/dns.js'
import { ValidationError } from '../../core/utils/errors.js'
import { canBeProxied, validateDnsRecord } from '../../core/validation/dns.js'
import { confirmKeyboard } from '../keyboards/index.js'
import { createProgress, escapeHtml, formatTable, getApiToken, findZone } from '../utils.js'

const DNS_TABLE_LIMIT = 30
const EDITABLE_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS']
const MIN_TTL = 60
const MAX_TTL = 86400

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

    const targetZone = await findZone(token, zoneQuery)

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
      records.slice(0, DNS_TABLE_LIMIT).map((r) => [
        r.type,
        r.name,
        r.content.length > 25 ? r.content.slice(0, 22) + '...' : r.content,
        r.ttl === 1 ? 'Auto' : String(r.ttl),
      ]),
    )

    const more =
      records.length > DNS_TABLE_LIMIT
        ? `\n<i>Menampilkan ${DNS_TABLE_LIMIT} dari ${records.length} record. Daftar lengkap: /dns_export ${escapeHtml(targetZone.name)}</i>`
        : ''

    await ctx.reply(
      `<b>DNS Records for ${escapeHtml(targetZone.name)} (${records.length})</b>\n${table}${more}`,
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

    const targetZone = await findZone(token, zoneQuery)

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
  const progress = createProgress(ctx, 'Menghapus record DNS')

  try {
    const token = getApiToken()
    const result = await bulkDeleteDnsRecords(token, state.zoneId, {
      recordIds: state.recordIds,
      concurrency: 5,
      onProgress: progress.update,
    })
    await progress.stop()

    sessionManager.clearFlow(userId)

    let msg = `✅ <b>Berhasil Menghapus DNS Record</b>\n\n`
    msg += `Zone: <code>${escapeHtml(state.zoneName)}</code>\n`
    msg += `Total Dihapus: <b>${result.deleted} record</b>\n`
    if (result.failed > 0) {
      msg += `Gagal: <b>${result.failed} record</b>\n`
    }

    await ctx.editMessageText(msg, { parse_mode: 'HTML' })
  } catch (err) {
    await progress.stop()
    sessionManager.clearFlow(userId)
    await ctx.editMessageText(
      `❌ Gagal menghapus DNS: ${escapeHtml(err instanceof Error ? err.message : 'Unknown error')}`,
      { parse_mode: 'HTML' },
    )
  }
}


function parseTtl(raw: string): number {
  if (raw.toLowerCase() === 'auto') return 1
  const ttl = Number(raw)
  if (!Number.isInteger(ttl) || ttl < MIN_TTL || ttl > MAX_TTL) {
    throw new ValidationError('INVALID_TTL', `TTL must be "auto" or ${MIN_TTL}-${MAX_TTL} seconds`, 'ttl')
  }
  return ttl
}

function parseProxied(raw: string, type: string): boolean {
  const value = raw.toLowerCase()
  if (!canBeProxied(type)) {
    throw new ValidationError('PROXY_UNSUPPORTED', `${type} records cannot be proxied`, 'proxied')
  }
  if (value === 'on' || value === 'true') return true
  if (value === 'off' || value === 'false') return false
  throw new ValidationError('INVALID_PROXIED', 'proxied must be "on" or "off"', 'proxied')
}

export async function handleDnsEdit(ctx: Context): Promise<void> {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
  const [, zoneQuery, typeRaw, nameRaw, ...rest] = text.trim().split(/\s+/)

  if (!zoneQuery || !typeRaw || !nameRaw || rest.length === 0) {
    await ctx.reply(
      '<b>✏️ Edit DNS Record</b>\n\n' +
        'Usage: <code>/dns_edit &lt;zone&gt; &lt;type&gt; &lt;name&gt; [content] [ttl=auto|detik] [proxied=on|off]</code>\n\n' +
        'Contoh:\n' +
        '• <code>/dns_edit example.com A @ 203.0.113.10</code>\n' +
        '• <code>/dns_edit example.com A www proxied=on</code>\n' +
        '• <code>/dns_edit example.com TXT _dmarc v=DMARC1; p=reject ttl=3600</code>',
      { parse_mode: 'HTML' },
    )
    return
  }

  try {
    const type = typeRaw.toUpperCase()
    if (!EDITABLE_TYPES.includes(type)) {
      throw new ValidationError('UNSUPPORTED_TYPE', `Editable types: ${EDITABLE_TYPES.join(', ')}`, 'type')
    }

    const token = getApiToken()
    const zone = await findZone(token, zoneQuery)
    if (!zone) {
      await ctx.reply(`Zone <b>${escapeHtml(zoneQuery)}</b> tidak ditemukan.`, { parse_mode: 'HTML' })
      return
    }

    const lowered = nameRaw.toLowerCase()
    const fqdn =
      lowered === '@'
        ? zone.name
        : lowered === zone.name || lowered.endsWith(`.${zone.name}`)
          ? lowered
          : `${lowered}.${zone.name}`

    const matches = (await listDnsRecords(token, zone.id)).filter(
      (r) => r.type === type && r.name.toLowerCase() === fqdn,
    )
    const record = matches[0]

    if (!record) {
      await ctx.reply(
        `Record <code>${type} ${escapeHtml(fqdn)}</code> tidak ditemukan di zone <b>${escapeHtml(zone.name)}</b>.`,
        { parse_mode: 'HTML' },
      )
      return
    }
    if (matches.length > 1) {
      await ctx.reply(
        `Ada <b>${matches.length}</b> record <code>${type} ${escapeHtml(fqdn)}</code>. Edit record ganda lewat TUI agar tidak salah sasaran.`,
        { parse_mode: 'HTML' },
      )
      return
    }

    let ttl = record.ttl
    let proxied = record.proxied
    const contentParts: string[] = []
    for (const arg of rest) {
      const option = /^(ttl|proxied)=(.+)$/i.exec(arg)
      if (!option) contentParts.push(arg)
      else if (option[1]?.toLowerCase() === 'ttl') ttl = parseTtl(option[2] ?? '')
      else proxied = parseProxied(option[2] ?? '', type)
    }

    const next = validateDnsRecord({
      type,
      name: record.name,
      content: contentParts.join(' ') || record.content,
      ttl,
      ...(canBeProxied(type) ? { proxied } : {}),
      ...(record.priority !== undefined ? { priority: record.priority } : {}),
    })
    const updated = await updateDnsRecord(token, zone.id, record.id, next)

    const describe = (r: { content: string; ttl: number; proxied: boolean }): string =>
      `<code>${escapeHtml(r.content)}</code> | TTL ${r.ttl === 1 ? 'Auto' : r.ttl} | Proxy ${r.proxied ? 'ON' : 'OFF'}`

    await ctx.reply(
      `✅ <b>Record diperbarui:</b> <code>${type} ${escapeHtml(updated.name)}</code>\n\n` +
        `Sebelum: ${describe(record)}\n` +
        `Sesudah: ${describe(updated)}`,
      { parse_mode: 'HTML' },
    )
  } catch (err) {
    await ctx.reply(
      `❌ Error: ${escapeHtml(err instanceof Error ? err.message : 'Unknown error')}`,
      { parse_mode: 'HTML' },
    )
  }
}

export async function handleDnsExport(ctx: Context): Promise<void> {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
  const zoneQuery = text.trim().split(/\s+/)[1]

  if (!zoneQuery) {
    await ctx.reply('Usage: /dns_export &lt;zone_name&gt;', { parse_mode: 'HTML' })
    return
  }

  try {
    const token = getApiToken()
    const zone = await findZone(token, zoneQuery)
    if (!zone) {
      await ctx.reply(`Zone <b>${escapeHtml(zoneQuery)}</b> tidak ditemukan.`, { parse_mode: 'HTML' })
      return
    }

    const data = await exportDnsZone(token, zone.id)
    await ctx.replyWithDocument(
      { source: Buffer.from(data, 'utf8'), filename: `${zone.name}.zone.txt` },
      { caption: `DNS export (BIND): ${zone.name}` },
    )
  } catch (err) {
    await ctx.reply(
      `❌ Error: ${escapeHtml(err instanceof Error ? err.message : 'Unknown error')}`,
      { parse_mode: 'HTML' },
    )
  }
}
