export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function formatTable(headers: string[], rows: string[][]): string {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)),
  )

  const separator = colWidths.map((w) => '-'.repeat(w)).join('-+-')
  const headerRow = headers.map((h, i) => h.padEnd(colWidths[i] ?? 0)).join(' | ')
  const dataRows = rows
    .map((row) => row.map((cell, i) => (cell ?? '').padEnd(colWidths[i] ?? 0)).join(' | '))
    .join('\n')

  return `<pre>${escapeHtml([headerRow, separator, dataRows].join('\n'))}</pre>`
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 1) + '…'
}
