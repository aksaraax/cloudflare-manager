import { type InlineKeyboardMarkup } from 'telegraf/types'

export function confirmKeyboard(action: string, cancelLabel?: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✅ Confirm', callback_data: `confirm:${action}` },
        { text: cancelLabel ?? '❌ Cancel', callback_data: `cancel:${action}` },
      ],
    ],
  }
}

export function zoneSelectKeyboard(
  zones: Array<{ id: string; name: string }>,
): InlineKeyboardMarkup {
  return {
    inline_keyboard: zones.map((z) => [{ text: z.name, callback_data: `zone:${z.id}` }]),
  }
}

export function zonePageKeyboard(
  page: number,
  pageCount: number,
  keyword: string,
): InlineKeyboardMarkup {
  if (pageCount <= 1) return { inline_keyboard: [] }
  const target = (p: number): string => `zones:${p}:${keyword}`
  return {
    inline_keyboard: [
      [
        { text: '◀️', callback_data: target(page > 1 ? page - 1 : pageCount) },
        { text: `${page}/${pageCount}`, callback_data: 'noop' },
        { text: '▶️', callback_data: target(page < pageCount ? page + 1 : 1) },
      ],
    ],
  }
}

export function bundleSelectKeyboard(selection: {
  mx: boolean
  spf: boolean
  dmarc: boolean
  dkim: boolean
}): InlineKeyboardMarkup {
  const label = (name: string, enabled: boolean) => `${enabled ? '✅' : '☐'} ${name}`
  return {
    inline_keyboard: [
      [
        {
          text: label('MX', selection.mx),
          callback_data: 'bundle-toggle:mx',
        },
        {
          text: label('SPF', selection.spf),
          callback_data: 'bundle-toggle:spf',
        },
      ],
      [
        {
          text: label('DMARC', selection.dmarc),
          callback_data: 'bundle-toggle:dmarc',
        },
        {
          text: label('DKIM', selection.dkim),
          callback_data: 'bundle-toggle:dkim',
        },
      ],
      [{ text: '▶️ Lanjut Konfigurasi', callback_data: 'bundle-proceed' }],
      [{ text: '⚡ Pakai Default (MX + SPF + DMARC)', callback_data: 'bundle-defaults' }],
      [{ text: '❌ Batalkan', callback_data: 'cancel:bulk-import' }],
    ],
  }
}

export function bulkDeleteSelectKeyboard(counts?: {
  all?: number
  mx?: number
  txt?: number
}): InlineKeyboardMarkup {
  const allLabel = counts?.all !== undefined ? `🗑️ Hapus Semua (${counts.all})` : '🗑️ Hapus Semua Record'
  const mxLabel = counts?.mx !== undefined ? `🗑️ Hapus MX Saja (${counts.mx})` : '🗑️ Hapus MX Saja'
  const txtLabel = counts?.txt !== undefined ? `🗑️ Hapus SPF & DMARC (${counts.txt})` : '🗑️ Hapus SPF & DMARC (TXT) Saja'

  return {
    inline_keyboard: [
      [{ text: allLabel, callback_data: 'bulkdel-type:all' }],
      [{ text: mxLabel, callback_data: 'bulkdel-type:mx' }],
      [{ text: txtLabel, callback_data: 'bulkdel-type:txt' }],
      [{ text: '❌ Batalkan', callback_data: 'cancel:bulk-delete' }],
    ],
  }
}

export function accountListKeyboard(
  accounts: Array<{ name: string }>,
): InlineKeyboardMarkup {
  return {
    inline_keyboard: accounts.map((a) => [
      { text: a.name, callback_data: `switch-account:${a.name}` },
    ]),
  }
}
