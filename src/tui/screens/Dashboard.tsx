import React, { useEffect, useMemo, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import {
  addZones,
  deleteZone,
  listZones,
  refreshZones,
  type AddZoneResult,
  ZoneInfo,
} from '../../core/api/zones.js'
import { parseDomainList } from '../../core/validation/domain.js'
import { Confirm } from '../components/Confirm.js'
import { Spinner } from '../components/Spinner.js'
import { Toast } from '../components/Toast.js'
import { Table } from '../components/Table.js'

const VISIBLE_ROWS = 15

type Mode = 'list' | 'search' | 'add' | 'adding' | 'added' | 'confirm_delete'

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
  const [mode, setMode] = useState<Mode>('list')
  const [filter, setFilter] = useState('')
  const [addInput, setAddInput] = useState('')
  const [addResults, setAddResults] = useState<AddZoneResult[]>([])
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  const visible = useMemo(() => {
    const query = filter.toLowerCase()
    return query ? zones.filter((z) => z.name.includes(query)) : zones
  }, [zones, filter])
  const selected = visible[selectedIndex]

  const showError = (err: unknown, fallback: string): void => {
    setToastType('error')
    setToastMessage(err instanceof Error ? err.message : fallback)
  }

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
      showError(err, 'Failed to load zones')
    } finally {
      setLoading(false)
    }
  }

  const submitAdd = async (): Promise<void> => {
    try {
      const parsed = parseDomainList(addInput)
      const existing = new Set(zones.map((z) => z.name))
      const fresh = parsed.domains.filter((d) => !existing.has(d))
      const skipped: AddZoneResult[] = [
        ...parsed.domains
          .filter((d) => existing.has(d))
          .map((name) => ({ name, error: 'Already exists in this account' })),
        ...parsed.invalid.map((name) => ({ name, error: 'Invalid or not an apex domain' })),
      ]

      if (fresh.length === 0 && skipped.length === 0) {
        setToastType('error')
        setToastMessage('Enter at least one domain')
        return
      }

      setProgress({ done: 0, total: fresh.length })
      setMode('adding')
      const results =
        fresh.length > 0
          ? await addZones(apiToken, fresh, (done, total) => setProgress({ done, total }))
          : []
      setAddResults([...results, ...skipped])
      setMode('added')
      if (results.some((r) => r.zone !== undefined)) {
        setZones(await refreshZones(apiToken))
      }
    } catch (err) {
      showError(err, 'Failed to add domains')
      setMode('list')
    }
  }

  const removeZone = async (zone: ZoneInfo): Promise<void> => {
    setMode('list')
    try {
      setLoading(true)
      await deleteZone(apiToken, zone.id)
      setToastType('success')
      setToastMessage(`Zone ${zone.name} deleted`)
      await fetchZones(true)
    } catch (err) {
      showError(err, 'Failed to delete zone')
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchZones(false)
  }, [apiToken])

  useInput((input, key) => {
    if (loading || mode === 'adding' || mode === 'confirm_delete') return

    if (mode === 'added') {
      setMode('list')
      return
    }

    if (mode === 'search' || mode === 'add') {
      const setValue = mode === 'search' ? setFilter : setAddInput

      if (key.escape) {
        if (mode === 'search') setFilter('')
        setMode('list')
      } else if (key.return) {
        if (mode === 'add') void submitAdd()
        else setMode('list')
      } else if (key.backspace || key.delete) {
        setValue((prev) => prev.slice(0, -1))
      } else if (input && !key.ctrl && !key.meta) {
        setValue((prev) => prev + input)
      }
      if (mode === 'search') setSelectedIndex(0)
      return
    }

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

    if (input === '/') {
      setMode('search')
      return
    }

    if (input === 'n') {
      setAddInput('')
      setMode('add')
      return
    }

    if (input === 'd') {
      if (selected) setMode('confirm_delete')
      return
    }

    if (key.escape) {
      setFilter('')
      setSelectedIndex(0)
      return
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1))
      return
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(visible.length - 1, prev + 1))
      return
    }

    if (key.pageUp) {
      setSelectedIndex((prev) => Math.max(0, prev - VISIBLE_ROWS))
      return
    }

    if (key.pageDown) {
      setSelectedIndex((prev) => Math.max(0, Math.min(visible.length - 1, prev + VISIBLE_ROWS)))
      return
    }

    if (key.return) {
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

  if (mode === 'adding') {
    return (
      <Box flexDirection="column" padding={1}>
        <Spinner label={`Adding domains to Cloudflare... ${progress.done}/${progress.total}`} />
      </Box>
    )
  }

  if (mode === 'added') {
    return (
      <Box flexDirection="column" padding={1} gap={1}>
        <Text bold color="cyan">Add Domain Results</Text>
        <Table
          headers={['Domain', 'Status', 'Nameservers / Reason']}
          rows={addResults.map((r) => [
            r.name,
            r.zone !== undefined ? 'Added' : 'Skipped',
            r.zone !== undefined ? r.zone.nameservers.join(', ') : (r.error ?? ''),
          ])}
        />
        <Text dimColor>Point each added domain to its nameservers at your registrar. Press any key to continue.</Text>
      </Box>
    )
  }

  if (mode === 'confirm_delete' && selected) {
    return (
      <Box flexDirection="column" padding={1}>
        <Confirm
          message={`Delete zone ${selected.name} with ALL of its DNS records and settings? This cannot be undone.`}
          requireTyping={selected.name}
          onConfirm={() => {
            void removeZone(selected)
          }}
          onCancel={() => setMode('list')}
        />
      </Box>
    )
  }

  if (mode === 'add') {
    return (
      <Box flexDirection="column" padding={1} gap={1}>
        <Text bold color="cyan">Add Domains to Cloudflare</Text>
        <Text>Enter one or more apex domains, separated by spaces or commas:</Text>
        {toastMessage && (
          <Toast
            message={toastMessage}
            type={toastType}
            onDismiss={() => setToastMessage(null)}
          />
        )}
        <Box borderStyle="round" borderColor="cyan" paddingX={1}>
          <Text>{'> '}</Text>
          <Text color="green">{addInput}</Text>
          <Text color="gray">_</Text>
        </Box>
        <Text dimColor>Press Enter to add | Esc to cancel</Text>
      </Box>
    )
  }

  const start = Math.max(
    0,
    Math.min(selectedIndex - Math.floor(VISIBLE_ROWS / 2), visible.length - VISIBLE_ROWS),
  )
  const headers = ['#', 'Zone Name', 'Status', 'Plan', 'Paused', 'Nameservers']
  const rows = visible.slice(start, start + VISIBLE_ROWS).map((z, i) => {
    const idx = start + i
    return [
      idx === selectedIndex ? `> ${idx + 1}` : `  ${idx + 1}`,
      z.name,
      z.status,
      z.plan,
      z.paused ? 'Yes' : 'No',
      z.nameservers.join(', ') || '-',
    ]
  })

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Box justifyContent="space-between" borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">
          Cloudflare Manager
        </Text>
        <Text>
          Account: <Text color="green" bold>{activeAccountName ?? 'default'}</Text>
        </Text>
        <Text dimColor>
          Zones: {visible.length === zones.length ? zones.length : `${visible.length}/${zones.length}`}
        </Text>
      </Box>

      {toastMessage && (
        <Toast
          message={toastMessage}
          type={toastType}
          onDismiss={() => setToastMessage(null)}
        />
      )}

      {(mode === 'search' || filter !== '') && (
        <Box>
          <Text color="cyan">Search: </Text>
          <Text>{filter}</Text>
          {mode === 'search' && <Text color="gray">_</Text>}
        </Box>
      )}

      {zones.length === 0 ? (
        <Box padding={1}>
          <Text dimColor>No zones found in this account. Press 'n' to add a domain.</Text>
        </Box>
      ) : visible.length === 0 ? (
        <Box padding={1}>
          <Text dimColor>No zones match the search.</Text>
        </Box>
      ) : (
        <Table headers={headers} rows={rows} />
      )}

      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>
          {mode === 'search'
            ? 'Type to filter | Enter Apply | Esc Clear'
            : '↑/↓ PgUp/PgDn Navigate | Enter Select | / Search | n Add Domain | d Delete Zone | a Accounts | r Refresh | q Quit'}
        </Text>
      </Box>
    </Box>
  )
}
