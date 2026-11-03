import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { purgeEverything, purgeByUrls } from '../../core/api/cache.js'
import { Confirm } from '../components/Confirm.js'
import { Spinner } from '../components/Spinner.js'
import { Toast } from '../components/Toast.js'

interface CacheProps {
  zoneId: string
  zoneName: string
  apiToken: string
  onBack: () => void
}

type Mode = 'menu' | 'confirm_purge_all' | 'input_urls'

export function Cache({ zoneId, zoneName, apiToken, onBack }: CacheProps): React.ReactElement {
  const [mode, setMode] = useState<Mode>('menu')
  const [loading, setLoading] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [toastType, setToastType] = useState<'error' | 'success' | 'info'>('info')

  useInput((input, key) => {
    if (loading) return
    if (mode === 'confirm_purge_all') return

    if (mode === 'menu') {
      if (key.escape) {
        onBack()
        return
      }
      if (input === '1') {
        setMode('confirm_purge_all')
        return
      }
      if (input === '2') {
        setUrlInput('')
        setMode('input_urls')
        return
      }
      return
    }

    if (mode === 'input_urls') {
      if (key.escape) {
        setMode('menu')
        return
      }
      if (key.return) {
        const urls = urlInput
          .split('\n')
          .map((u) => u.trim())
          .filter((u) => u.length > 0)
        if (urls.length === 0) {
          setToastMessage('No URLs entered')
          return
        }
        void (async () => {
          try {
            setLoading(true)
            const res = await purgeByUrls(apiToken, zoneId, urls)
            setToastType('success')
            setToastMessage(`Purged ${res.purgedCount} URL(s) (Request ID: ${res.requestId})`)
            setMode('menu')
          } catch (err) {
            setToastType('error')
            setToastMessage(err instanceof Error ? err.message : 'Purge URLs failed')
          } finally {
            setLoading(false)
          }
        })()
        return
      }
      if (key.backspace || key.delete) {
        setUrlInput((prev) => prev.slice(0, -1))
        return
      }
      if (input && !key.ctrl && !key.meta) {
        setUrlInput((prev) => prev + input)
      }
      return
    }
  })

  if (mode === 'confirm_purge_all') {
    return (
      <Box flexDirection="column" padding={1}>
        <Confirm
          message={`Purge EVERYTHING for zone ${zoneName}? This cannot be undone.`}
          requireTyping={zoneName}
          onConfirm={() => {
            void (async () => {
              try {
                setLoading(true)
                const res = await purgeEverything(apiToken, zoneId)
                setToastType('success')
                setToastMessage(`Purged entire zone cache! (Request ID: ${res.requestId})`)
                setMode('menu')
              } catch (err) {
                setToastType('error')
                setToastMessage(err instanceof Error ? err.message : 'Purge everything failed')
                setMode('menu')
              } finally {
                setLoading(false)
              }
            })()
          }}
          onCancel={() => setMode('menu')}
        />
      </Box>
    )
  }

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Box borderStyle="single" borderColor="cyan" paddingX={1} justifyContent="space-between">
        <Text bold color="cyan">Cache Management: {zoneName}</Text>
        <Text dimColor>ID: {zoneId}</Text>
      </Box>

      {toastMessage && (
        <Toast
          message={toastMessage}
          type={toastType}
          onDismiss={() => setToastMessage(null)}
        />
      )}

      {loading ? (
        <Spinner label="Executing cache purge..." />
      ) : mode === 'input_urls' ? (
        <Box flexDirection="column" gap={1}>
          <Text bold>Enter URLs to purge (comma-separated or single URL):</Text>
          <Box borderStyle="round" borderColor="cyan" paddingX={1}>
            <Text>{'> '}</Text>
            <Text color="green">{urlInput}</Text>
            <Text color="gray">_</Text>
          </Box>
          <Text dimColor>Press Enter to purge | Esc to cancel</Text>
        </Box>
      ) : (
        <Box flexDirection="column" gap={1}>
          <Text bold color="cyan">Select Purge Operation:</Text>
          <Text>1. <Text bold color="yellow">Purge Everything</Text> (Requires typing zone name)</Text>
          <Text>2. <Text bold color="green">Purge by URL</Text> (Purge specific URL resources)</Text>
        </Box>
      )}

      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>Press 1 or 2 | Esc Back</Text>
      </Box>
    </Box>
  )
}

