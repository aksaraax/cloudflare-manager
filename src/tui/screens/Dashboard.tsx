import React, { useEffect, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { listZones, refreshZones, ZoneInfo } from '../../core/api/zones.js'
import { Spinner } from '../components/Spinner.js'
import { Toast } from '../components/Toast.js'
import { Table } from '../components/Table.js'

interface DashboardProps {
  apiToken: string
  activeAccountName: string | null
  onSelectZone: (zoneId: string, zoneName: string) => void
  onGoToAccounts: () => void
  onQuit: () => void
}

export function Dashboard({
  apiToken,
  activeAccountName,
  onSelectZone,
  onGoToAccounts,
  onQuit,
}: DashboardProps): React.ReactElement {
  const [zones, setZones] = useState<ZoneInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [toastType, setToastType] = useState<'error' | 'success' | 'info'>('info')

  const fetchZones = async (forceRefresh = false) => {
    try {
      setLoading(true)
      const data = forceRefresh
        ? await refreshZones(apiToken)
        : await listZones(apiToken)
      setZones(data)
      if (selectedIndex >= data.length) {
        setSelectedIndex(Math.max(0, data.length - 1))
      }
    } catch (err) {
      setToastType('error')
      setToastMessage(err instanceof Error ? err.message : 'Failed to load zones')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchZones(false)
  }, [apiToken])

  useInput((input, key) => {
    if (loading) return

    if (input === 'q') {
      onQuit()
      return
    }

    if (input === 'a') {
      onGoToAccounts()
      return
    }

    if (input === 'r') {
      void fetchZones(true)
      return
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1))
      return
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(zones.length - 1, prev + 1))
      return
    }

    if (key.return) {
      const selected = zones[selectedIndex]
      if (selected) {
        onSelectZone(selected.id, selected.name)
      }
      return
    }
  })

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Spinner label="Loading Cloudflare zones..." />
      </Box>
    )
  }

  const headers = ['#', 'Zone Name', 'Status', 'Plan', 'Paused', 'Nameservers']
  const rows = zones.map((z, idx) => [
    idx === selectedIndex ? `> ${idx + 1}` : `  ${idx + 1}`,
    z.name,
    z.status,
    z.plan,
    z.paused ? 'Yes' : 'No',
    z.nameservers.join(', ') || '-',
  ])

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Box justifyContent="space-between" borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">
          Cloudflare Manager
        </Text>
        <Text>
          Account: <Text color="green" bold>{activeAccountName ?? 'default'}</Text>
        </Text>
        <Text dimColor>Zones: {zones.length}</Text>
      </Box>

      {toastMessage && (
        <Toast
          message={toastMessage}
          type={toastType}
          onDismiss={() => setToastMessage(null)}
        />
      )}

      {zones.length === 0 ? (
        <Box padding={1}>
          <Text dimColor>No zones found in this account.</Text>
        </Box>
      ) : (
        <Table headers={headers} rows={rows} />
      )}

      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>
          ↑/↓ Navigate | Enter Select Zone | a Accounts | r Refresh | q Quit
        </Text>
      </Box>
    </Box>
  )
}

