import { type Context } from 'telegraf'
import { sessionManager } from '../../core/auth/session.js'
import { accountManager } from '../../core/config/accounts.js'
import { listZones } from '../../core/api/zones.js'
import { listDnsRecords, DnsRecord } from '../../core/api/dns.js'
import { extractDomains } from '../../core/bulk/extractor.js'
import { matchDomains, type MatchResult } from '../../core/bulk/matcher.js'
import { buildBundles, DomainBundle, MxEntry } from '../../core/bulk/bundle.js'
import {
  executeBulk,
  bulkDeleteForMatchedDomains,
  matchesDomain,
} from '../../core/bulk/orchestrator.js'
import {
  confirmKeyboard,
  bundleSelectKeyboard,
  bulkDeleteSelectKeyboard,
} from '../keyboards/index.js'
import { escapeHtml } from '../utils.js'

export interface RecordSelectionState {
  mx: boolean
  spf: boolean
  dmarc: boolean
  dkim: boolean
}

export interface BotBulkFlowState {
  step:
    | 'awaiting-paste'
    | 'awaiting-records'
    | 'awaiting-mx'
    | 'awaiting-spf'
    | 'awaiting-dmarc'
    | 'awaiting-dkim'
    | 'awaiting-confirm'
  matched?: MatchResult['matched'] | undefined
  unmatched?: string[] | undefined
  selection?: RecordSelectionState | undefined
  useDefaults?: boolean | undefined
  mxEntries?: MxEntry[] | undefined
  spfContent?: string | undefined
  dmarcContent?: string | undefined
  dkimSelector?: string | undefined
  dkimValue?: string | undefined
  bundles?: DomainBundle[] | undefined
  summary?: { matched: number; unmatched: number } | undefined
}

export interface BotBulkDeleteFlowState {
  step: 'awaiting-paste' | 'awaiting-type' | 'awaiting-confirm'
  matched?: MatchResult['matched'] | undefined
  deleteType?: 'all' | 'mx' | 'txt' | undefined
  counts?: { all: number; mx: number; txt: number } | undefined
}

function getApiToken(): string {
  const token =
    accountManager.getActiveToken() ??
    process.env['CFM_API_TOKEN'] ??
    process.env['CF_API_TOKEN'] ??
    process.env['CLOUDFLARE_API_TOKEN']
  if (!token) throw new Error('No Cloudflare API token configured')
  return token
}

function getNextStep(
  selection: RecordSelectionState,
  current: 'records' | 'mx' | 'spf' | 'dmarc' | 'dkim',
  useDefaults?: boolean,
): 'mx' | 'spf' | 'dmarc' | 'dkim' | 'confirm' {
  if (current === 'records') {
    if (selection.mx) return 'mx'
    if (!useDefaults && selection.spf) return 'spf'
    if (!useDefaults && selection.dmarc) return 'dmarc'
    if (!useDefaults && selection.dkim) return 'dkim'
    return 'confirm'
  }
  if (current === 'mx') {
    if (!useDefaults && selection.spf) return 'spf'
    if (!useDefaults && selection.dmarc) return 'dmarc'
    if (!useDefaults && selection.dkim) return 'dkim'
    return 'confirm'
  }
  if (current === 'spf') {
    if (!useDefaults && selection.dmarc) return 'dmarc'
    if (!useDefaults && selection.dkim) return 'dkim'
    return 'confirm'
  }
  if (current === 'dmarc') {
    if (!useDefaults && selection.dkim) return 'dkim'
    return 'confirm'
  }
  return 'confirm'
}

async function promptForStep(
  ctx: Context,
  userId: number,
  state: BotBulkFlowState,
  nextStep: 'mx' | 'spf' | 'dmarc' | 'dkim' | 'confirm',
): Promise<void> {
  if (nextStep === 'mx') {
    state.step = 'awaiting-mx'
    sessionManager.setPendingFlow(userId, 'bulk', state as unknown as Record<string, unknown>)
    await ctx.reply(
      '<b>Langkah: Masukkan MX Server</b>\n\n' +
        'Kirim hostname MX server Anda.\n' +
        'Contoh: <code>mail.myserver.com</code> atau <code>10 mail.myserver.com</code>\n' +
        '<i>(Bisa kirim beberapa MX, satu per baris)</i>\n\n' +
        'Ketik <b>/skip</b> jika ingin melewati / tidak membuat record MX.',
      { parse_mode: 'HTML' },
    )
    return
  }

  if (nextStep === 'spf') {
    state.step = 'awaiting-spf'
    sessionManager.setPendingFlow(userId, 'bulk', state as unknown as Record<string, unknown>)
    await ctx.reply(
      '<b>Langkah: Konfigurasi SPF Record</b>\n\n' +
        'Default: <code>v=spf1 mx ~all</code>\n\n' +
        'Kirim teks SPF custom Anda, atau:\n' +
        '• Ketik <b>/default</b> untuk memakai default di atas\n' +
        '• Ketik <b>/skip</b> untuk melewati / tidak membuat SPF.',
      { parse_mode: 'HTML' },
    )
    return
  }

  if (nextStep === 'dmarc') {
    state.step = 'awaiting-dmarc'
    sessionManager.setPendingFlow(userId, 'bulk', state as unknown as Record<string, unknown>)
    await ctx.reply(
      '<b>Langkah: Konfigurasi DMARC Record</b>\n\n' +
        'Default: <code>v=DMARC1; p=none; rua=mailto:dmarc@{domain}</code>\n\n' +
        'Kirim teks DMARC custom Anda, atau:\n' +
        '• Ketik <b>/default</b> untuk memakai default di atas\n' +
        '• Ketik <b>/skip</b> untuk melewati / tidak membuat DMARC.',
      { parse_mode: 'HTML' },
    )
    return
  }

  if (nextStep === 'dkim') {
    state.step = 'awaiting-dkim'
    sessionManager.setPendingFlow(userId, 'bulk', state as unknown as Record<string, unknown>)
    await ctx.reply(
      '<b>Langkah: Konfigurasi DKIM Record</b>\n\n' +
        'Kirim selector dan value DKIM dipisahkan spasi.\n' +
        'Contoh: <code>k1 v=DKIM1; k=rsa; p=MIGf...</code>\n\n' +
        'Ketik <b>/skip</b> untuk melewati / tidak membuat DKIM.',
      { parse_mode: 'HTML' },
    )
    return
  }

  if (nextStep === 'confirm') {
    await generateAndSendPlan(ctx, userId, state)
  }
}

async function generateAndSendPlan(
  ctx: Context,
  userId: number,
  state: BotBulkFlowState,
): Promise<void> {
  const token = getApiToken()
  await ctx.reply('⏳ Menyiapkan rencana DNS record…')

  const matchedList = state.matched ?? []
  const selection = state.selection ?? { mx: true, spf: true, dmarc: true, dkim: false }

  const existingMap = new Map<string, DnsRecord[]>()
  for (const m of matchedList) {
    const records = await listDnsRecords(token, m.zoneId)
    existingMap.set(m.zoneId, records)
  }

  const bundles = await buildBundles(
    matchedList,
    {
      mx: selection.mx && (state.mxEntries?.length ?? 0) > 0,
      spf: selection.spf,
      dmarc: selection.dmarc,
      dkim: selection.dkim,
      mxEntries: state.mxEntries ?? [],
      spfContent: state.spfContent,
      dmarcContent: state.dmarcContent,
      dkimSelector: state.dkimSelector,
      dkimValue: state.dkimValue,
    },
    existingMap,
  )

  state.step = 'awaiting-confirm'
  state.bundles = bundles
  state.summary = {
    matched: matchedList.length,
    unmatched: (state.unmatched ?? []).length,
  }

  sessionManager.setPendingFlow(userId, 'bulk', state as unknown as Record<string, unknown>)

  let preview = `<b>Bulk DNS Auto-Detect Plan</b>\n\n`
  preview += `✅ <b>Target Domains (${matchedList.length}):</b>\n`
  preview += matchedList.slice(0, 10).map((m) => `• <code>${escapeHtml(m.domain)}</code>`).join('\n')
  if (matchedList.length > 10) {
    preview += `\n<i>...dan ${matchedList.length - 10} domain lainnya</i>`
  }

  preview += `\n\n<b>Records to Provision:</b>\n`
  if (selection.mx && state.mxEntries && state.mxEntries.length > 0) {
    for (const mx of state.mxEntries) {
      preview += `• MX: ${mx.priority} <code>${escapeHtml(mx.host)}</code>\n`
    }
  } else {
    preview += `• MX: <i>(Dilewati / Tidak dibuat)</i>\n`
  }

  if (selection.spf) {
    preview += `• SPF: <code>${escapeHtml(state.spfContent ?? 'v=spf1 mx ~all')}</code>\n`
  } else {
    preview += `• SPF: <i>(Dilewati / Tidak dibuat)</i>\n`
  }

  if (selection.dmarc) {
    preview += `• DMARC: <code>${escapeHtml(state.dmarcContent ?? 'v=DMARC1; p=none; rua=mailto:dmarc@{domain}')}</code>\n`
  } else {
    preview += `• DMARC: <i>(Dilewati / Tidak dibuat)</i>\n`
  }

  if (selection.dkim && state.dkimSelector && state.dkimValue) {
    preview += `• DKIM: <code>${escapeHtml(state.dkimSelector)}._domainkey</code>\n`
  } else {
    preview += `• DKIM: <i>(Dilewati / Tidak dibuat)</i>\n`
  }

  preview += `\nEksekusi bulk provision ini?`

  await ctx.reply(preview, {
    parse_mode: 'HTML',
    reply_markup: confirmKeyboard('bulk-import'),
  })
}

export async function handleBulk(ctx: Context): Promise<void> {
  const userId = ctx.from?.id
  if (!userId) return

  const flowState = sessionManager.getFlowState(userId)

  if (!flowState || flowState.flow !== 'bulk') {
    sessionManager.setPendingFlow(userId, 'bulk', {
      step: 'awaiting-paste',
    } satisfies BotBulkFlowState as unknown as Record<string, unknown>)

    await ctx.reply(
      '<b>Bulk DNS Auto-Detect</b>\n\n' +
        'Paste teks dengan daftar email/domain Anda di bawah ini (e.g. <code>email|password</code>, <code>email:password</code>, CSV, atau daftar domain).\n' +
        'Sistem akan otomatis mendeteksi domain/subdomain, mencocokkan ke Cloudflare Zones, dan mengatur record DNS pilihan Anda.\n\n' +
        'Kirim /cancel untuk membatalkan.',
      { parse_mode: 'HTML' },
    )
    return
  }

  const state = flowState.state as unknown as BotBulkFlowState

  if (state.step === 'awaiting-paste') {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
    if (!text || text.startsWith('/')) {
      await ctx.reply('Silakan paste teks berisi email atau domain.')
      return
    }

    try {
      const token = getApiToken()
      await ctx.reply('⏳ Menganalisis dan mengekstrak domain…')

      const extracted = extractDomains(text)
      const zones = await listZones(token)
      const matched = matchDomains(extracted.domains, zones)

      if (matched.matched.length === 0) {
        await ctx.reply(
          `⚠️ Berhasil mengekstrak ${extracted.domains.size} domain, namun tidak ada yang cocok dengan Zone aktif Cloudflare Anda.\n\n` +
            `Unmatched: ${matched.unmatched.map(escapeHtml).join(', ')}`,
          { parse_mode: 'HTML' },
        )
        sessionManager.clearFlow(userId)
        return
      }

      const defaultSelection: RecordSelectionState = {
        mx: true,
        spf: true,
        dmarc: true,
        dkim: false,
      }

      const newState: BotBulkFlowState = {
        step: 'awaiting-records',
        matched: matched.matched,
        unmatched: matched.unmatched,
        selection: defaultSelection,
      }

      sessionManager.setPendingFlow(
        userId,
        'bulk',
        newState as unknown as Record<string, unknown>,
      )

      let msg = `<b>Bulk DNS - Domain Terdeteksi</b>\n\n`
      msg += `✅ <b>Matched (${matched.matched.length}):</b>\n`
      msg += matched.matched
        .slice(0, 15)
        .map((m) => `• <code>${escapeHtml(m.domain)}</code> → Zone: <code>${escapeHtml(m.zoneName)}</code>`)
        .join('\n')
      if (matched.matched.length > 15) {
        msg += `\n<i>...dan ${matched.matched.length - 15} domain lainnya</i>`
      }

      if (matched.unmatched.length > 0) {
        msg += `\n\n⚠️ <b>Unmatched (${matched.unmatched.length}):</b>\n`
        msg += matched.unmatched.slice(0, 5).map((u) => `• <code>${escapeHtml(u)}</code>`).join('\n')
        if (matched.unmatched.length > 5) {
          msg += `\n<i>...dan ${matched.unmatched.length - 5} lainnya</i>`
        }
      }

      msg += `\n\n<b>Langkah 2: Pilih Record yang Ingin Dibuat</b>\n`
      msg += `Klik tombol di bawah untuk memilih record yang ingin dibuat.\n`
      msg += `Anda dapat memilih untuk membuat atau melewati (skip) MX, SPF, DMARC, dan DKIM.`

      await ctx.reply(msg, {
        parse_mode: 'HTML',
        reply_markup: bundleSelectKeyboard(defaultSelection),
      })
    } catch (err) {
      await ctx.reply(
        `❌ Error: ${escapeHtml(err instanceof Error ? err.message : 'Unknown error')}`,
        { parse_mode: 'HTML' },
      )
      sessionManager.clearFlow(userId)
    }
    return
  }

  if (state.step === 'awaiting-records') {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
    const lower = text.trim().toLowerCase()

    if (lower === '/cancel') {
      sessionManager.clearFlow(userId)
      await ctx.reply('🚫 Operasi bulk dibatalkan.')
      return
    }

    if (lower === 'default' || lower === '/default') {
      const selection: RecordSelectionState = { mx: true, spf: true, dmarc: true, dkim: false }
      state.selection = selection
      state.useDefaults = true
      const next = getNextStep(selection, 'records', true)
      await promptForStep(ctx, userId, state, next)
      return
    }

    if (lower === '/next' || lower === 'next' || lower === '/lanjut' || lower === 'lanjut') {
      const selection = state.selection ?? { mx: true, spf: true, dmarc: true, dkim: false }
      const next = getNextStep(selection, 'records', state.useDefaults)
      await promptForStep(ctx, userId, state, next)
      return
    }

    const hasMx = lower.includes('mx') || lower.includes('semua') || lower.includes('all')
    const hasSpf = lower.includes('spf') || lower.includes('semua') || lower.includes('all')
    const hasDmarc = lower.includes('dmarc') || lower.includes('semua') || lower.includes('all')
    const hasDkim = lower.includes('dkim')

    if (hasMx || hasSpf || hasDmarc || hasDkim) {
      const selection: RecordSelectionState = {
        mx: hasMx,
        spf: hasSpf,
        dmarc: hasDmarc,
        dkim: hasDkim,
      }
      state.selection = selection
      state.useDefaults = false
      const next = getNextStep(selection, 'records', false)
      await promptForStep(ctx, userId, state, next)
      return
    }

    await ctx.reply('Gunakan tombol di atas untuk memilih record atau ketik record yang diinginkan (e.g. <code>mx, spf</code>).', {
      parse_mode: 'HTML',
    })
    return
  }

  if (state.step === 'awaiting-mx') {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
    if (!text) {
      await ctx.reply('Silakan kirim host MX atau ketik /skip.')
      return
    }

    const selection = state.selection ?? { mx: true, spf: true, dmarc: true, dkim: false }

    if (text.trim() === '/skip') {
      selection.mx = false
      state.selection = selection
      state.mxEntries = []
    } else {
      const mxEntries: MxEntry[] = []
      const lines = text.trim().split('\n')
      for (const l of lines) {
        const trimmed = l.trim()
        if (!trimmed) continue
        const parts = trimmed.split(/\s+/)
        if (parts.length >= 2 && /^\d+$/.test(parts[0]!)) {
          mxEntries.push({ host: parts.slice(1).join(' '), priority: parseInt(parts[0]!, 10) })
        } else {
          mxEntries.push({ host: trimmed, priority: 10 })
        }
      }
      selection.mx = true
      state.selection = selection
      state.mxEntries = mxEntries
    }

    const next = getNextStep(selection, 'mx', state.useDefaults)
    await promptForStep(ctx, userId, state, next)
    return
  }

  if (state.step === 'awaiting-spf') {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
    if (!text) {
      await ctx.reply('Silakan kirim teks SPF, ketik /default, atau ketik /skip.')
      return
    }

    const selection = state.selection ?? { mx: true, spf: true, dmarc: true, dkim: false }
    const trimmed = text.trim()

    if (trimmed === '/skip') {
      selection.spf = false
      state.selection = selection
      state.spfContent = undefined
    } else if (trimmed === '/default' || trimmed === '/ok' || trimmed.toLowerCase() === 'default') {
      selection.spf = true
      state.selection = selection
      state.spfContent = undefined
    } else {
      selection.spf = true
      state.selection = selection
      state.spfContent = trimmed
    }

    const next = getNextStep(selection, 'spf', state.useDefaults)
    await promptForStep(ctx, userId, state, next)
    return
  }

  if (state.step === 'awaiting-dmarc') {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
    if (!text) {
      await ctx.reply('Silakan kirim teks DMARC, ketik /default, atau ketik /skip.')
      return
    }

    const selection = state.selection ?? { mx: true, spf: true, dmarc: true, dkim: false }
    const trimmed = text.trim()

    if (trimmed === '/skip') {
      selection.dmarc = false
      state.selection = selection
      state.dmarcContent = undefined
    } else if (trimmed === '/default' || trimmed === '/ok' || trimmed.toLowerCase() === 'default') {
      selection.dmarc = true
      state.selection = selection
      state.dmarcContent = undefined
    } else {
      selection.dmarc = true
      state.selection = selection
      state.dmarcContent = trimmed
    }

    const next = getNextStep(selection, 'dmarc', state.useDefaults)
    await promptForStep(ctx, userId, state, next)
    return
  }

  if (state.step === 'awaiting-dkim') {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
    if (!text) {
      await ctx.reply('Silakan kirim selector dan value DKIM, atau ketik /skip.')
      return
    }

    const selection = state.selection ?? { mx: true, spf: true, dmarc: true, dkim: false }
    const trimmed = text.trim()

    if (trimmed === '/skip') {
      selection.dkim = false
      state.selection = selection
      state.dkimSelector = undefined
      state.dkimValue = undefined
    } else {
      const parts = trimmed.split(/\s+/)
      selection.dkim = true
      state.selection = selection
      state.dkimSelector = parts[0]
      state.dkimValue = parts.slice(1).join(' ')
    }

    const next = getNextStep(selection, 'dkim', state.useDefaults)
    await promptForStep(ctx, userId, state, next)
    return
  }

  if (state.step === 'awaiting-confirm') {
    await ctx.reply('Gunakan tombol inline di atas untuk mengonfirmasi atau membatalkan.')
  }
}

export async function handleBundleToggle(
  ctx: Context,
  userId: number,
  data: string,
): Promise<void> {
  const flowState = sessionManager.getFlowState(userId)
  if (!flowState || flowState.flow !== 'bulk') {
    await ctx.answerCbQuery('Tidak ada operasi bulk aktif.')
    return
  }

  const state = flowState.state as unknown as BotBulkFlowState
  if (state.step !== 'awaiting-records') {
    await ctx.answerCbQuery('Record sudah dikonfirmasi.')
    return
  }

  const selection = state.selection ?? { mx: true, spf: true, dmarc: true, dkim: false }
  const field = data.replace('bundle-toggle:', '') as keyof RecordSelectionState

  if (field in selection) {
    selection[field] = !selection[field]
    state.selection = selection
    sessionManager.setPendingFlow(userId, 'bulk', state as unknown as Record<string, unknown>)

    await ctx.answerCbQuery(`${field.toUpperCase()}: ${selection[field] ? 'ON' : 'OFF'}`)
    try {
      await ctx.editMessageReplyMarkup(bundleSelectKeyboard(selection))
    } catch {
      // Ignore if markup hasn't changed
    }
  }
}

export async function handleBundleProceed(ctx: Context, userId: number): Promise<void> {
  const flowState = sessionManager.getFlowState(userId)
  if (!flowState || flowState.flow !== 'bulk') {
    await ctx.answerCbQuery('Tidak ada operasi bulk aktif.')
    return
  }

  const state = flowState.state as unknown as BotBulkFlowState
  const selection = state.selection ?? { mx: true, spf: true, dmarc: true, dkim: false }

  if (!selection.mx && !selection.spf && !selection.dmarc && !selection.dkim) {
    await ctx.answerCbQuery('Pilih minimal satu record!', { show_alert: true })
    return
  }

  await ctx.answerCbQuery('Melanjutkan ke konfigurasi…')
  state.useDefaults = false
  const next = getNextStep(selection, 'records', false)
  await promptForStep(ctx, userId, state, next)
}

export async function handleBundleDefaults(ctx: Context, userId: number): Promise<void> {
  const flowState = sessionManager.getFlowState(userId)
  if (!flowState || flowState.flow !== 'bulk') {
    await ctx.answerCbQuery('Tidak ada operasi bulk aktif.')
    return
  }

  const state = flowState.state as unknown as BotBulkFlowState
  const selection: RecordSelectionState = { mx: true, spf: true, dmarc: true, dkim: false }
  state.selection = selection
  state.useDefaults = true

  await ctx.answerCbQuery('Menggunakan default record.')
  const next = getNextStep(selection, 'records', true)
  await promptForStep(ctx, userId, state, next)
}

export async function executeBulkImport(ctx: Context, userId: number): Promise<void> {
  const flowState = sessionManager.getFlowState(userId)
  if (!flowState || flowState.flow !== 'bulk') {
    await ctx.answerCbQuery('No active bulk operation.')
    return
  }

  const state = flowState.state as unknown as BotBulkFlowState
  if (!state.bundles || state.bundles.length === 0) {
    await ctx.answerCbQuery('No bundles to execute.')
    sessionManager.clearFlow(userId)
    return
  }

  await ctx.answerCbQuery('⏳ Executing bulk provisioning…')
  await ctx.editMessageText('⏳ Provisioning DNS records across matched zones…')

  try {
    const token = getApiToken()
    const summary = await executeBulk(state.bundles, token, {
      dryRun: false,
      concurrency: 5,
    })

    sessionManager.clearFlow(userId)

    const lines: string[] = [
      `<b>Bulk DNS Execution Completed in ${(summary.durationMs / 1000).toFixed(1)}s</b>\n`,
      `Matched: ${summary.matched} | Created: ${summary.created} | Skipped: ${summary.skipped} | Replaced: ${summary.replaced} | Errors: ${summary.errors}\n`,
    ]

    for (const dr of summary.domainResults) {
      lines.push(`<b>${escapeHtml(dr.domain)}:</b>`)
      for (const rec of dr.records) {
        const icon = rec.status === 'error' ? '❌' : '✅'
        lines.push(`  ${icon} ${rec.type} ${escapeHtml(rec.name)}: ${rec.status}`)
      }
    }

    await ctx.editMessageText(lines.join('\n'), { parse_mode: 'HTML' })
  } catch (err) {
    sessionManager.clearFlow(userId)
    await ctx.editMessageText(
      `❌ Bulk execution failed: ${escapeHtml(err instanceof Error ? err.message : 'Unknown error')}`,
      { parse_mode: 'HTML' },
    )
  }
}

export async function handleBulkDelete(ctx: Context): Promise<void> {
  const userId = ctx.from?.id
  if (!userId) return

  const flowState = sessionManager.getFlowState(userId)

  if (!flowState || flowState.flow !== 'bulk-delete') {
    sessionManager.setPendingFlow(userId, 'bulk-delete', {
      step: 'awaiting-paste',
    } satisfies BotBulkDeleteFlowState as unknown as Record<string, unknown>)

    await ctx.reply(
      '<b>🗑️ Bulk Delete DNS by List</b>\n\n' +
        'Paste teks dengan daftar domain atau email (seperti format bulk: <code>email|password</code>, CSV, atau daftar domain).\n' +
        'Bot akan mencocokkan ke Zone Cloudflare dan mencari DNS record yang ada untuk dihapus secara massal.\n\n' +
        'Ketik /cancel untuk membatalkan.',
      { parse_mode: 'HTML' },
    )
    return
  }

  const state = flowState.state as unknown as BotBulkDeleteFlowState

  if (state.step === 'awaiting-paste') {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
    if (!text || text.startsWith('/')) {
      await ctx.reply('Silakan paste teks berisi domain atau email.')
      return
    }

    try {
      const token = getApiToken()
      await ctx.reply('⏳ Menganalisis domain dan memindai DNS record…')

      const extracted = extractDomains(text)
      const zones = await listZones(token)
      const matched = matchDomains(extracted.domains, zones)

      if (matched.matched.length === 0) {
        await ctx.reply(
          `⚠️ Tidak ada domain yang cocok dengan zone Cloudflare aktif Anda.\n\n` +
            `Unmatched: ${matched.unmatched.map(escapeHtml).join(', ')}`,
          { parse_mode: 'HTML' },
        )
        sessionManager.clearFlow(userId)
        return
      }

      let countAll = 0
      let countMx = 0
      let countTxt = 0

      const zoneMap = new Map<string, { zoneName: string; domains: string[] }>()
      for (const m of matched.matched) {
        const entry = zoneMap.get(m.zoneId) ?? { zoneName: m.zoneName, domains: [] }
        entry.domains.push(m.domain)
        zoneMap.set(m.zoneId, entry)
      }

      for (const [zoneId, { zoneName, domains }] of zoneMap.entries()) {
        const records = await listDnsRecords(token, zoneId)
        for (const d of domains) {
          for (const r of records) {
            if (matchesDomain(r.name, d, zoneName)) {
              countAll++
              if (r.type === 'MX') countMx++
              if (r.type === 'TXT') countTxt++
            }
          }
        }
      }

      if (countAll === 0) {
        await ctx.reply(
          `ℹ️ Tidak ditemukan DNS record yang ada pada zone untuk ${matched.matched.length} domain tersebut.`,
        )
        sessionManager.clearFlow(userId)
        return
      }

      const newState: BotBulkDeleteFlowState = {
        step: 'awaiting-type',
        matched: matched.matched,
        counts: { all: countAll, mx: countMx, txt: countTxt },
      }

      sessionManager.setPendingFlow(
        userId,
        'bulk-delete',
        newState as unknown as Record<string, unknown>,
      )

      let msg = `<b>🗑️ Bulk Delete DNS - Record Ditemukan</b>\n\n`
      msg += `Ditemukan total <b>${countAll}</b> DNS record pada <b>${matched.matched.length}</b> domain target:\n`
      msg += `• MX Record: <b>${countMx}</b>\n`
      msg += `• TXT Record (SPF/DMARC/DKIM): <b>${countTxt}</b>\n`
      msg += `• Record lainnya: <b>${countAll - countMx - countTxt}</b>\n\n`
      msg += `Silakan pilih jenis record yang ingin dihapus massal:`

      await ctx.reply(msg, {
        parse_mode: 'HTML',
        reply_markup: bulkDeleteSelectKeyboard({ all: countAll, mx: countMx, txt: countTxt }),
      })
    } catch (err) {
      await ctx.reply(
        `❌ Error: ${escapeHtml(err instanceof Error ? err.message : 'Unknown error')}`,
        { parse_mode: 'HTML' },
      )
      sessionManager.clearFlow(userId)
    }
  }
}

export async function handleBulkDeleteTypeSelect(
  ctx: Context,
  userId: number,
  data: string,
): Promise<void> {
  const flowState = sessionManager.getFlowState(userId)
  if (!flowState || flowState.flow !== 'bulk-delete') {
    await ctx.answerCbQuery('Tidak ada operasi bulk delete aktif.')
    return
  }

  const state = flowState.state as unknown as BotBulkDeleteFlowState
  const type = data.replace('bulkdel-type:', '') as 'all' | 'mx' | 'txt'

  const count =
    type === 'all'
      ? state.counts?.all
      : type === 'mx'
        ? state.counts?.mx
        : state.counts?.txt

  if (!count || count === 0) {
    await ctx.answerCbQuery(`Tidak ada record ${type.toUpperCase()} untuk dihapus.`, {
      show_alert: true,
    })
    return
  }

  state.deleteType = type
  state.step = 'awaiting-confirm'
  sessionManager.setPendingFlow(userId, 'bulk-delete', state as unknown as Record<string, unknown>)

  await ctx.answerCbQuery(`Pilihan: Hapus ${type.toUpperCase()}`)

  const typeLabel =
    type === 'all'
      ? 'SEMUA RECORD'
      : type === 'mx'
        ? 'RECORD MX'
        : 'RECORD TXT (SPF/DMARC)'

  let msg = `⚠️ <b>Konfirmasi Hapus Massal DNS</b>\n\n`
  msg += `Tipe record: <b>${typeLabel}</b>\n`
  msg += `Jumlah record akan dihapus: <b>${count} record</b>\n`
  msg += `Target domain: <b>${state.matched?.length ?? 0} domain</b>\n\n`
  msg += `<b>PERINGATAN: Tindakan ini permanen dan tidak dapat dibatalkan!</b>\n`
  msg += `Apakah Anda yakin ingin menghapus record ini sekarang?`

  await ctx.editMessageText(msg, {
    parse_mode: 'HTML',
    reply_markup: confirmKeyboard('bulk-delete'),
  })
}

export async function executeBulkDelete(ctx: Context, userId: number): Promise<void> {
  const flowState = sessionManager.getFlowState(userId)
  if (!flowState || flowState.flow !== 'bulk-delete') {
    await ctx.answerCbQuery('Tidak ada operasi bulk delete aktif.')
    return
  }

  const state = flowState.state as unknown as BotBulkDeleteFlowState
  if (!state.matched || state.matched.length === 0) {
    await ctx.answerCbQuery('Tidak ada domain untuk dihapus.')
    sessionManager.clearFlow(userId)
    return
  }

  await ctx.answerCbQuery('⏳ Menghapus record DNS…')
  await ctx.editMessageText('⏳ Menghapus record DNS di Cloudflare secara massal…')

  try {
    const token = getApiToken()
    const summary = await bulkDeleteForMatchedDomains(state.matched, token, {
      filterType: state.deleteType ?? 'all',
      concurrency: 5,
    })

    sessionManager.clearFlow(userId)

    let msg = `✅ <b>Bulk Delete DNS Selesai dalam ${(summary.durationMs / 1000).toFixed(1)}s</b>\n\n`
    msg += `Total Domain: <b>${summary.totalMatchedDomains}</b>\n`
    msg += `Record Ditemukan: <b>${summary.totalRecordsFound}</b>\n`
    msg += `Record Terhapus: <b>${summary.totalDeleted}</b>\n`
    if (summary.totalFailed > 0) {
      msg += `Gagal: <b>${summary.totalFailed}</b>\n`
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
