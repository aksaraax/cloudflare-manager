import React, { useEffect, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import {
  getSslSettings,
  setSslMode,
  setAlwaysUseHttps,
  SslSettings,
  SslMode,
} from '../../core/api/ssl.js'
import { Spinner } from '../components/Spinner.js'
import { Toast } from '../components/Toast.js'

interface SslProps {
  zoneId: string
  zoneName: string
  apiToken: string
  onBack: () => void
}

export function Ssl({ zoneId, zoneName, apiToken, onBack }: SslProps): React.ReactElement {
  const [settings, setSettings] = useState<SslSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [toastType, setToastType] = useState<'error' | 'success' | 'info'>('info')

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const data = await getSslSettings(apiToken, zoneId)
      setSettings(data)
    } catch (err) {
      setToastType('error')
      setToastMessage(err instanceof Error ? err.message : 'Failed to fetch SSL settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchSettings()
  }, [zoneId, apiToken])

  const handleSetMode = async (mode: SslMode) => {
    try {
      setLoading(true)
      await setSslMode(apiToken, zoneId, mode)
      setToastType('success')
      setToastMessage(`SSL mode updated to ${mode}`)
      await fetchSettings()
    } catch (err) {
      setToastType('error')
      setToastMessage(err instanceof Error ? err.message : 'Failed to update SSL mode')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleHttps = async () => {
    if (!settings) return
    try {
      setLoading(true)
      const next = !settings.alwaysUseHttps
      await setAlwaysUseHttps(apiToken, zoneId, next)
      setToastType('success')
      setToastMessage(`Always Use HTTPS is now ${next ? 'enabled' : 'disabled'}`)
      await fetchSettings()
    } catch (err) {
      setToastType('error')
      setToastMessage(err instanceof Error ? err.message : 'Failed to toggle HTTPS')
    } finally {
      setLoading(false)
    }
  }

  useInput((input, key) => {
    if (loading) return

    if (key.escape) {
      onBack()
      return
    }

    if (input === '1') void handleSetMode('off')
    if (input === '2') void handleSetMode('flexible')
    if (input === '3') void handleSetMode('full')
    if (input === '4') void handleSetMode('strict')
    if (input === 'h') void handleToggleHttps()
    if (input === 'r') void fetchSettings()
  })

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Box borderStyle="single" borderColor="cyan" paddingX={1} justifyContent="space-between">
        <Text bold color="cyan">SSL/TLS Settings: {zoneName}</Text>
        <Text dimColor>ID: {zoneId}</Text>
      </Box>

      {toastMessage && (
        <Toast
          message={toastMessage}
          type={toastType}
          onDismiss={() => setToastMessage(null)}
        />
      )}

      {loading || !settings ? (
        <Spinner label="Loading SSL settings..." />
      ) : (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column" borderStyle="round" borderColor="gray" padding={1} gap={1}>
            <Text bold color="cyan">Current SSL Configuration:</Text>
            <Text>  SSL Encryption Mode: <Text bold color="green">{settings.mode.toUpperCase()}</Text></Text>
            <Text>  Always Use HTTPS: <Text bold color={settings.alwaysUseHttps ? 'green' : 'yellow'}>{settings.alwaysUseHttps ? 'ON' : 'OFF'}</Text></Text>
            <Text>  Minimum TLS Version: <Text color="cyan">{settings.minTlsVersion}</Text></Text>
            <Text>  TLS 1.3: <Text color="cyan">{settings.tls13.toUpperCase()}</Text></Text>
          </Box>

          <Box flexDirection="column" gap={1}>
            <Text bold color="yellow">Change SSL Mode:</Text>
            <Text>  1: <Text color="red">off</Text> (No encryption)</Text>
            <Text>  2: <Text color="yellow">flexible</Text> (Browser to CF only)</Text>
            <Text>  3: <Text color="cyan">full</Text> (Self-signed origin cert allowed)</Text>
            <Text>  4: <Text color="green">strict</Text> (Valid CA origin cert required)</Text>
            <Text>  h: Toggle Always Use HTTPS</Text>
          </Box>
        </Box>
      )}

      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>Press 1/2/3/4 to change mode | h Toggle HTTPS | r Refresh | Esc Back</Text>
      </Box>
    </Box>
  )
}

