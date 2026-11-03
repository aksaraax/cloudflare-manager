import React from 'react'
import { Box, Text } from 'ink'

const DEFAULT_MAX_WIDTH = 100

interface TableProps {
  headers: string[]
  rows: string[][]
  maxWidth?: number
}

function clamp(value: string, width: number): string {
  if (value.length <= width) return value.padEnd(width)
  return value.slice(0, width - 1) + '…'
}

function computeColWidths(headers: string[], rows: string[][], maxWidth: number): number[] {
  const colCount = headers.length
  const widths = headers.map((h) => h.length)
  for (const row of rows) {
    for (let i = 0; i < colCount; i++) {
      const cell = row[i] ?? ''
      if (cell.length > (widths[i] ?? 0)) widths[i] = cell.length
    }
  }
  const separators = colCount + 1
  const available = maxWidth - separators
  const total = widths.reduce((a, b) => a + b, 0)
  if (total <= available) return widths
  const ratio = available / total
  return widths.map((w) => Math.max(3, Math.floor(w * ratio)))
}

export function Table({ headers, rows, maxWidth = DEFAULT_MAX_WIDTH }: TableProps): React.ReactElement {
  const widths = computeColWidths(headers, rows, maxWidth)
  const separator = widths.map((w) => '─'.repeat(w)).join('─┼─')
  const topBar = widths.map((w) => '─'.repeat(w)).join('─┬─')
  const botBar = widths.map((w) => '─'.repeat(w)).join('─┴─')

  return (
    <Box flexDirection="column">
      <Text>{'┌─' + topBar + '─┐'}</Text>
      <Text>
        {'│ '}
        {widths.map((w, i) => clamp(headers[i] ?? '', w)).join(' │ ')}
        {' │'}
      </Text>
      <Text>{'├─' + separator + '─┤'}</Text>
      {rows.map((row, ri) => (
        <Text key={ri}>
          {'│ '}
          {widths.map((w, i) => clamp(row[i] ?? '', w)).join(' │ ')}
          {' │'}
        </Text>
      ))}
      <Text>{'└─' + botBar + '─┘'}</Text>
    </Box>
  )
}
