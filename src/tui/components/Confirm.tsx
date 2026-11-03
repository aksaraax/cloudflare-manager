import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'

interface ConfirmProps {
  message: string
  requireTyping?: string
  onConfirm: () => void
  onCancel: () => void
}

export function Confirm({
  message,
  requireTyping,
  onConfirm,
  onCancel,
}: ConfirmProps): React.ReactElement {
  const [typedValue, setTypedValue] = useState('')

  useInput((input, key) => {
    if (requireTyping !== undefined) {
      if (key.escape) {
        onCancel()
        return
      }
      if (key.return) {
        if (typedValue === requireTyping) {
          onConfirm()
        } else {
          onCancel()
        }
        return
      }
      if (key.backspace || key.delete) {
        setTypedValue((prev) => prev.slice(0, -1))
        return
      }
      if (input && !key.ctrl && !key.meta) {
        setTypedValue((prev) => prev + input)
      }
      return
    }

    if (key.escape || input === 'n' || input === 'N') {
      onCancel()
    } else if (input === 'y' || input === 'Y') {
      onConfirm()
    }
  })

  if (requireTyping !== undefined) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">⚠ {message}</Text>
        <Text>
          Type <Text color="red" bold>{requireTyping}</Text> and press Enter to confirm, or press Esc to cancel:
        </Text>
        <Box>
          <Text>{'> '}</Text>
          <Text color="cyan">{typedValue}</Text>
          <Text color="gray">_</Text>
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="yellow">⚠ {message}</Text>
      <Text dimColor>Press Y to confirm, N or Esc to cancel</Text>
    </Box>
  )
}
