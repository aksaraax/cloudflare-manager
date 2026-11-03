import React, { useEffect, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import {
  listDnsRecords,
  deleteDnsRecord,
  bulkDeleteDnsRecords,
  exportDnsZone,
  DnsRecord,
} from '../../core/api/dns.js'
import { Spinner } from '../components/Spinner.js'
import { Table } from '../components/Table.js'
import { Toast } from '../components/Toast.js'
import { Confirm } from '../components/Confirm.js'

interface DnsProps {
  zoneId: string
  zoneName: string
  apiToken: string
  onBack: () => void
}

interface BulkConfirmAction {
  message: string
  recordIds?: string[] | undefined
  all?: boolean | undefined
}

export function Dns({ zoneId, zoneName, apiToken, onBack }: DnsProps): React.ReactElement {
  const [records, setRecords] = useState<DnsRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set())
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [toastType, setToastType] = useState<'error' | 'success' | 'info'>('info')
  const [confirmDelete, setConfirmDelete] = useState<DnsRecord | null>(null)
  const [bulkConfirm, setBulkConfirm] = useState<BulkConfirmAction | null>(null)
  const [exportedBind, setExportedBind] = useState<string | null>(null)

  const fetchRecords = async () => {
    try {
      setLoading(true)
      const data = await listDnsRecords(apiToken, zoneId)
      setRecords(data)
      if (selectedIndex >= data.length) {
        setSelectedIndex(Math.max(0, data.length - 1))
      }
    } catch (err) {
      setToastType('error')
      setToastMessage(err instanceof Error ? err.message : 'Failed to fetch DNS records')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchRecords()
  }, [zoneId, apiToken])

  const handleDelete = async (record: DnsRecord) => {
    try {
      setLoading(true)
      await deleteDnsRecord(apiToken, zoneId, record.id)
      setConfirmDelete(null)
      setSelectedRecordIds((prev) => {
        const next = new Set(prev)
        next.delete(record.id)
        return next
      })
      setToastType('success')
      setToastMessage(`Deleted ${record.type} record ${record.name}`)
      await fetchRecords()
    } catch (err) {
      setToastType('error')
      setToastMessage(err instanceof Error ? err.message : 'Failed to delete record')
    } finally {
      setLoading(false)
    }
  }

  const handleBulkDelete = async (action: BulkConfirmAction) => {
    try {
      setLoading(true)
      const filter = action.all ? { all: true } : { recordIds: action.recordIds }
      const res = await bulkDeleteDnsRecords(apiToken, zoneId, filter)
      setBulkConfirm(null)
      setSelectedRecordIds(new Set())
      setToastType(res.failed > 0 ? 'error' : 'success')
      setToastMessage(`Bulk delete: ${res.deleted} deleted, ${res.failed} failed`)
      await fetchRecords()
    } catch (err) {
      setToastType('error')
      setToastMessage(err instanceof Error ? err.message : 'Failed to bulk delete')
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    try {
      setLoading(true)
      const bind = await exportDnsZone(apiToken, zoneId)
      setExportedBind(bind)
    } catch (err) {
      setToastType('error')
      setToastMessage(err instanceof Error ? err.message : 'Failed to export zone')
    } finally {
      setLoading(false)
    }
  }

  useInput((input, key) => {
    if (loading) return

    if (exportedBind !== null) {
      if (key.escape || key.return) {
        setExportedBind(null)
      }
      return
    }

    if (confirmDelete !== null || bulkConfirm !== null) return

    if (key.escape) {
      onBack()
      return
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1))
      return
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(records.length - 1, prev + 1))
      return
    }

    if (input === ' ') {
      const current = records[selectedIndex]
      if (current) {
        setSelectedRecordIds((prev) => {
          const next = new Set(prev)
          if (next.has(current.id)) {
            next.delete(current.id)
          } else {
            next.add(current.id)
          }
          return next
        })
      }
      return
    }

    if (input === 'a') {
      if (selectedRecordIds.size === records.length) {
        setSelectedRecordIds(new Set())
      } else {
        setSelectedRecordIds(new Set(records.map((r) => r.id)))
      }
      return
    }

    if (input === 'd') {
      const selected = records[selectedIndex]
      if (selected) {
        setConfirmDelete(selected)
      }
      return
    }

    if (input === 'D') {
      if (selectedRecordIds.size > 0) {
        setBulkConfirm({
          message: `Delete ${selectedRecordIds.size} selected DNS records?`,
          recordIds: Array.from(selectedRecordIds),
        })
      } else {
        setToastType('info')
        setToastMessage('No records selected for bulk deletion (use Space to select).')
      }
      return
    }

    if (input === 'c') {
      if (records.length > 0) {
        setBulkConfirm({
          message: `DANGER: Delete ALL ${records.length} DNS records in zone "${zoneName}"?`,
          all: true,
        })
      }
      return
    }

    if (input === 'x') {
      void handleExport()
      return
    }

    if (input === 'r') {
      void fetchRecords()
      return
    }
  })

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Spinner label="Loading DNS records..." />
      </Box>
    )
  }

  if (confirmDelete !== null) {
    return (
      <Box flexDirection="column" padding={1}>
        <Confirm
          message={`Delete DNS record: ${confirmDelete.type} ${confirmDelete.name} -> ${confirmDelete.content}?`}
          onConfirm={() => void handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      </Box>
    )
  }

  if (bulkConfirm !== null) {
    return (
      <Box flexDirection="column" padding={1}>
        <Confirm
          message={bulkConfirm.message}
          onConfirm={() => void handleBulkDelete(bulkConfirm)}
          onCancel={() => setBulkConfirm(null)}
        />
      </Box>
    )
  }

  if (exportedBind !== null) {
    return (
      <Box flexDirection="column" padding={1} gap={1}>
        <Text bold color="green">Exported BIND Format ({zoneName}):</Text>
        <Box borderStyle="single" borderColor="gray" padding={1}>
          <Text>{exportedBind}</Text>
        </Box>
        <Text dimColor>Press Enter or Esc to return</Text>
      </Box>
    )
  }

  const headers = ['Sel', '#', 'Type', 'Name', 'Content', 'TTL', 'Proxy', 'Priority']
  const rows = records.map((r, idx) => [
    selectedRecordIds.has(r.id) ? '[x]' : '[ ]',
    idx === selectedIndex ? `> ${idx + 1}` : `  ${idx + 1}`,
    r.type,
    r.name,
    r.content,
    r.ttl === 1 ? 'Auto' : String(r.ttl),
    r.proxied ? 'Proxied' : 'DNS only',
    r.priority !== undefined ? String(r.priority) : '-',
  ])

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Box borderStyle="single" borderColor="cyan" paddingX={1} justifyContent="space-between">
        <Text bold color="cyan">
          DNS Records: {zoneName}
        </Text>
        <Text dimColor>
          Count: {records.length} | Selected: {selectedRecordIds.size}
        </Text>
      </Box>

      {toastMessage && (
        <Toast
          message={toastMessage}
          type={toastType}
          onDismiss={() => setToastMessage(null)}
        />
      )}

      {records.length === 0 ? (
        <Box padding={1}>
          <Text dimColor>No DNS records found.</Text>
        </Box>
      ) : (
        <Table headers={headers} rows={rows} />
      )}

      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>
          Space Select | a All | d Delete | D Bulk Delete | c Clear All | x Export | r Refresh | Esc Back
        </Text>
      </Box>
    </Box>
  )
}
