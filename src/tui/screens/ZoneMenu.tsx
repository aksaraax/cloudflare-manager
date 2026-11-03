import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { Spinner } from '../components/Spinner.js'
import { Toast } from '../components/Toast.js'

export type ZoneScreenType =
  | 'dns'
  | 'bulk'
  | 'cache'
  | 'firewall'
  | 'ssl'
  | 'workers'

interface ZoneMenuProps {
  zoneId: string
  zoneName: string
  apiToken: string
  onNavigate: (screen: ZoneScreenType) => void
  onBack: () => void
}

interface MenuItem {
  id: ZoneScreenType | 'toggle_pause'
  title: string
  description: string
}

const MENU_ITEMS: MenuItem[] = [
  { id: 'dns', title: '1. DNS Management', description: 'List, create, edit, delete, and export records' },
  { id: 'bulk', title: '2. Bulk DNS Auto-Detect', description: 'Extract emails/domains and setup MX/SPF/DMARC' },
  { id: 'cache', title: '3. Cache Purge', description: 'Purge everything, by URLs, or by tags/hostnames' },
  { id: 'firewall', title: '4. Firewall (IP Access Rules)', description: 'Manage IP allow/block/challenge rules' },
  { id: 'ssl', title: '5. SSL/TLS Settings', description: 'Configure SSL modes, HTTPS redirects, and TLS' },
  { id: 'workers', title: '6. Workers Management', description: 'List, inspect, and manage Cloudflare Workers' },
]

export function ZoneMenu({
  zoneId,
  zoneName,
  apiToken: _apiToken,
  onNavigate,
  onBack,
}: ZoneMenuProps): React.ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [toastType] = useState<'error' | 'success' | 'info'>('info')

  useInput((_input, key) => {
    if (loading) return

    if (key.escape) {
      onBack()
      return
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1))
      return
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(MENU_ITEMS.length - 1, prev + 1))
      return
    }

    if (key.return) {
      const selected = MENU_ITEMS[selectedIndex]
      if (selected && selected.id !== 'toggle_pause') {
        onNavigate(selected.id)
      }
      return
    }
  })

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Box borderStyle="single" borderColor="cyan" paddingX={1} justifyContent="space-between">
        <Text bold color="cyan">
          Zone: {zoneName}
        </Text>
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
        <Spinner label="Processing operation..." />
      ) : (
        <Box flexDirection="column" gap={1}>
          {MENU_ITEMS.map((item, idx) => {
            const isSelected = idx === selectedIndex
            return (
              <Box key={item.id} flexDirection="column">
                <Box gap={1}>
                  {isSelected ? (
                    <Text color="cyan" bold>
                      ▶ {item.title}
                    </Text>
                  ) : (
                    <Text>
                      {'  '}{item.title}
                    </Text>
                  )}
                </Box>
                <Box paddingLeft={4}>
                  <Text dimColor>{item.description}</Text>
                </Box>
              </Box>
            )
          })}
        </Box>
      )}

      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>↑/↓ Navigate | Enter Select | Esc Back to Dashboard</Text>
      </Box>
    </Box>
  )
}

