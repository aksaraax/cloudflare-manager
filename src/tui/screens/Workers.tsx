import React, { useEffect, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import {
  listWorkers,
  deleteWorker,
  WorkerInfo,
} from '../../core/api/workers.js'
import { Spinner } from '../components/Spinner.js'
import { Table } from '../components/Table.js'
import { Toast } from '../components/Toast.js'
import { Confirm } from '../components/Confirm.js'

interface WorkersProps {
  apiToken: string
  accountId?: string
  onBack: () => void
}

export function Workers({ apiToken, accountId, onBack }: WorkersProps): React.ReactElement {
  const [workers, setWorkers] = useState<WorkerInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [workerToDelete, setWorkerToDelete] = useState<WorkerInfo | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [toastType, setToastType] = useState<'error' | 'success' | 'info' | 'warning'>('info')

  const targetAccountId = accountId ?? ''

  const fetchWorkers = async () => {
    if (!targetAccountId) {
      setLoading(false)
      setToastType('warning')
      setToastMessage('Account ID is required to list Workers')
      return
    }
    try {
      setLoading(true)
      const data = await listWorkers(apiToken, targetAccountId)
      setWorkers(data)
      if (selectedIndex >= data.length) {
        setSelectedIndex(Math.max(0, data.length - 1))
      }
    } catch (err) {
      setToastType('error')
      setToastMessage(err instanceof Error ? err.message : 'Failed to fetch workers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchWorkers()
  }, [apiToken, targetAccountId])

  useInput((input, key) => {
    if (loading) return
    if (workerToDelete !== null) return

    if (key.escape) {
      onBack()
      return
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1))
      return
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(workers.length - 1, prev + 1))
      return
    }

    if (input === 'd') {
      const selected = workers[selectedIndex]
      if (selected) {
        setWorkerToDelete(selected)
      }
      return
    }

    if (input === 'r') {
      void fetchWorkers()
      return
    }
  })

  if (workerToDelete !== null) {
    return (
      <Box flexDirection="column" padding={1}>
        <Confirm
          message={`Delete Cloudflare Worker ${workerToDelete.name}?`}
          requireTyping={workerToDelete.name}
          onConfirm={() => {
            void (async () => {
              try {
                setLoading(true)
                await deleteWorker(apiToken, targetAccountId, workerToDelete.name)
                setToastType('success')
                setToastMessage(`Deleted Worker ${workerToDelete.name}`)
                setWorkerToDelete(null)
                await fetchWorkers()
              } catch (err) {
                setToastType('error')
                setToastMessage(err instanceof Error ? err.message : 'Failed to delete worker')
                setWorkerToDelete(null)
              } finally {
                setLoading(false)
              }
            })()
          }}
          onCancel={() => setWorkerToDelete(null)}
        />
      </Box>
    )
  }

  const headers = ['#', 'Worker Name', 'Created', 'Modified', 'Routes Count']
  const rows = workers.map((w, idx) => [
    idx === selectedIndex ? `> ${idx + 1}` : `  ${idx + 1}`,
    w.name,
    w.createdOn ? w.createdOn.slice(0, 10) : '-',
    w.modifiedOn ? w.modifiedOn.slice(0, 10) : '-',
    String(w.routes.length),
  ])

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Box borderStyle="single" borderColor="cyan" paddingX={1} justifyContent="space-between">
        <Text bold color="cyan">Cloudflare Workers</Text>
        <Text dimColor>Count: {workers.length}</Text>
      </Box>

      {toastMessage && (
        <Toast
          message={toastMessage}
          type={toastType}
          onDismiss={() => setToastMessage(null)}
        />
      )}

      {loading ? (
        <Spinner label="Loading Cloudflare Workers..." />
      ) : workers.length === 0 ? (
        <Box padding={1}>
          <Text dimColor>No workers found or account ID not set.</Text>
        </Box>
      ) : (
        <Table headers={headers} rows={rows} />
      )}

      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>↑/↓ Navigate | d Delete Worker | r Refresh | Esc Back</Text>
      </Box>
    </Box>
  )
}

