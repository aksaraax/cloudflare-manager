import React, { useEffect, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import {
  listFirewallRules,
  createFirewallRule,
  deleteFirewallRule,
  FirewallRule,
  FirewallMode,
} from '../../core/api/firewall.js'
import { validateFirewallTarget } from '../../core/validation/dns.js'
import { Table } from '../components/Table.js'
import { Spinner } from '../components/Spinner.js'
import { Confirm } from '../components/Confirm.js'
import { Toast } from '../components/Toast.js'

interface FirewallProps {
  zoneId: string
  zoneName: string
  apiToken: string
  onBack: () => void
}

type Mode = 'list' | 'add_ip' | 'add_mode' | 'confirm_delete'

export function Firewall({ zoneId, zoneName, apiToken, onBack }: FirewallProps): React.ReactElement {
  const [rules, setRules] = useState<FirewallRule[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [mode, setMode] = useState<Mode>('list')
  const [newTarget, setNewTarget] = useState('')
  const [selectedRule, setSelectedRule] = useState<FirewallRule | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [toastType, setToastType] = useState<'error' | 'success' | 'info'>('info')

  const fetchRules = async () => {
    try {
      setLoading(true)
      const data = await listFirewallRules(apiToken, zoneId)
      setRules(data)
      if (selectedIndex >= data.length) {
        setSelectedIndex(Math.max(0, data.length - 1))
      }
    } catch (err) {
      setToastType('error')
      setToastMessage(err instanceof Error ? err.message : 'Failed to fetch firewall rules')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchRules()
  }, [zoneId, apiToken])

  useInput((input, key) => {
    if (loading) return
    if (mode === 'confirm_delete') return

    if (mode === 'list') {
      if (key.escape) {
        onBack()
        return
      }
      if (key.upArrow) {
        setSelectedIndex((prev) => Math.max(0, prev - 1))
        return
      }
      if (key.downArrow) {
        setSelectedIndex((prev) => Math.min(rules.length - 1, prev + 1))
        return
      }
      if (input === 'a') {
        setNewTarget('')
        setMode('add_ip')
        return
      }
      if (input === 'd') {
        const item = rules[selectedIndex]
        if (item) {
          setSelectedRule(item)
          setMode('confirm_delete')
        }
        return
      }
      if (input === 'r') {
        void fetchRules()
        return
      }
      return
    }

    if (mode === 'add_ip') {
      if (key.escape) {
        setMode('list')
        return
      }
      if (key.return) {
        try {
          validateFirewallTarget(newTarget.trim())
          setMode('add_mode')
        } catch (err) {
          setToastType('error')
          setToastMessage(err instanceof Error ? err.message : 'Invalid IP format')
        }
        return
      }
      if (key.backspace || key.delete) {
        setNewTarget((prev) => prev.slice(0, -1))
        return
      }
      if (input && !key.ctrl && !key.meta) {
        setNewTarget((prev) => prev + input)
      }
      return
    }

    if (mode === 'add_mode') {
      if (key.escape) {
        setMode('list')
        return
      }
      let chosenMode: FirewallMode | null = null
      if (input === '1') chosenMode = 'block'
      if (input === '2') chosenMode = 'challenge'
      if (input === '3') chosenMode = 'js_challenge'
      if (input === '4') chosenMode = 'allow'

      if (chosenMode) {
        void (async () => {
          try {
            setLoading(true)
            const targetObj = validateFirewallTarget(newTarget.trim())
            await createFirewallRule(apiToken, zoneId, {
              mode: chosenMode,
              value: targetObj,
              notes: 'Added via Cloudflare Manager TUI',
            })
            setToastType('success')
            setToastMessage(`Rule created for ${newTarget}`)
            setMode('list')
            await fetchRules()
          } catch (err) {
            setToastType('error')
            setToastMessage(err instanceof Error ? err.message : 'Failed to create rule')
            setMode('list')
          } finally {
            setLoading(false)
          }
        })()
      }
      return
    }
  })

  if (mode === 'confirm_delete' && selectedRule) {
    return (
      <Box flexDirection="column" padding={1}>
        <Confirm
          message={`Delete rule ${selectedRule.mode.toUpperCase()} for ${selectedRule.value.value}?`}
          onConfirm={() => {
            void (async () => {
              try {
                setLoading(true)
                await deleteFirewallRule(apiToken, zoneId, selectedRule.id)
                setToastType('success')
                setToastMessage(`Deleted rule for ${selectedRule.value.value}`)
                setSelectedRule(null)
                setMode('list')
                await fetchRules()
              } catch (err) {
                setToastType('error')
                setToastMessage(err instanceof Error ? err.message : 'Failed to delete rule')
                setMode('list')
              } finally {
                setLoading(false)
              }
            })()
          }}
          onCancel={() => {
            setSelectedRule(null)
            setMode('list')
          }}
        />
      </Box>
    )
  }

  if (mode === 'add_ip') {
    return (
      <Box flexDirection="column" padding={1} gap={1}>
        <Text bold color="cyan">Add Firewall IP Access Rule (Step 1/2):</Text>
        <Text>Enter IP, CIDR (e.g. 1.2.3.4/24), or IP range:</Text>
        <Box borderStyle="round" borderColor="cyan" paddingX={1}>
          <Text>{'> '}</Text>
          <Text color="green">{newTarget}</Text>
          <Text color="gray">_</Text>
        </Box>
        <Text dimColor>Press Enter to continue | Esc to cancel</Text>
      </Box>
    )
  }

  if (mode === 'add_mode') {
    return (
      <Box flexDirection="column" padding={1} gap={1}>
        <Text bold color="cyan">Select Rule Mode for {newTarget} (Step 2/2):</Text>
        <Text>1. <Text color="red" bold>block</Text></Text>
        <Text>2. <Text color="yellow" bold>challenge</Text></Text>
        <Text>3. <Text color="yellow" bold>js_challenge</Text></Text>
        <Text>4. <Text color="green" bold>allow</Text></Text>
        <Text dimColor>Press 1, 2, 3, or 4 | Esc to cancel</Text>
      </Box>
    )
  }

  const headers = ['#', 'Mode', 'Target', 'Type', 'Notes', 'Created']
  const rows = rules.map((r, idx) => [
    idx === selectedIndex ? `> ${idx + 1}` : `  ${idx + 1}`,
    r.mode.toUpperCase(),
    r.value.value,
    r.value.target,
    r.notes || '-',
    r.createdOn.slice(0, 10),
  ])

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Box borderStyle="single" borderColor="cyan" paddingX={1} justifyContent="space-between">
        <Text bold color="cyan">Firewall Rules: {zoneName}</Text>
        <Text dimColor>Rules: {rules.length}</Text>
      </Box>

      {toastMessage && (
        <Toast
          message={toastMessage}
          type={toastType}
          onDismiss={() => setToastMessage(null)}
        />
      )}

      {loading ? (
        <Spinner label="Loading firewall rules..." />
      ) : rules.length === 0 ? (
        <Box padding={1}>
          <Text dimColor>No IP access rules found for this zone.</Text>
        </Box>
      ) : (
        <Table headers={headers} rows={rows} />
      )}

      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>↑/↓ Navigate | a Add Rule | d Delete Rule | r Refresh | Esc Back</Text>
      </Box>
    </Box>
  )
}

