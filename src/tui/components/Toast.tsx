import React, { useEffect } from 'react'
import { Box, Text } from 'ink'

const DISMISS_AFTER_MS = 3000

type ToastType = 'error' | 'success' | 'info' | 'warning'

interface ToastProps {
  message: string
  type: ToastType
  onDismiss: () => void
}

const COLOR_MAP: Record<ToastType, string> = {
  error: 'red',
  success: 'green',
  info: 'cyan',
  warning: 'yellow',
}

const ICON_MAP: Record<ToastType, string> = {
  error: '✖',
  success: '✔',
  info: 'ℹ',
  warning: '⚠',
}

export function Toast({ message, type, onDismiss }: ToastProps): React.ReactElement | null {
  useEffect(() => {
    const timer = setTimeout(onDismiss, DISMISS_AFTER_MS)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <Box borderStyle="round" borderColor={COLOR_MAP[type]} paddingX={1}>
      <Text color={COLOR_MAP[type]}>
        {ICON_MAP[type]} {message}
      </Text>
    </Box>
  )
}
