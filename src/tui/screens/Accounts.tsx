import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { accountManager } from '../../core/config/accounts.js'
import { Confirm } from '../components/Confirm.js'
import { Table } from '../components/Table.js'
import { Toast } from '../components/Toast.js'

interface AccountsProps {
  onBack: () => void
  onAccountChanged: () => void
}

type Mode = 'list' | 'add_name' | 'add_token' | 'confirm_delete'

export function Accounts({ onBack, onAccountChanged }: AccountsProps): React.ReactElement {
  const [mode, setMode] = useState<Mode>('list')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [newAccName, setNewAccName] = useState('')
  const [newAccToken, setNewAccToken] = useState('')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [toastType, setToastType] = useState<'error' | 'success' | 'info'>('info')
  const [accountToDelete, setAccountToDelete] = useState<string | null>(null)

  const accounts = accountManager.listAccounts()
  const activeName = accountManager.getActiveAccountName()

  useInput((input, key) => {
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
        setSelectedIndex((prev) => Math.min(accounts.length - 1, prev + 1))
        return
      }

      if (input === 'a') {
        setNewAccName('')
        setNewAccToken('')
        setMode('add_name')
        return
      }

      if (input === 's' || key.return) {
        const selected = accounts[selectedIndex]
        if (selected) {
          void (async () => {
            try {
              await accountManager.switchAccount(selected.name)
              setToastType('success')
              setToastMessage(`Switched active account to ${selected.name}`)
              onAccountChanged()
            } catch (err) {
              setToastType('error')
              setToastMessage(err instanceof Error ? err.message : 'Switch failed')
            }
          })()
        }
        return
      }

      if (input === 'd' || input === 'r') {
        const selected = accounts[selectedIndex]
        if (selected) {
          setAccountToDelete(selected.name)
          setMode('confirm_delete')
        }
        return
      }
      return
    }

    if (mode === 'add_name') {
      if (key.escape) {
        setMode('list')
        return
      }
      if (key.return) {
        if (newAccName.trim().length === 0) {
          setToastMessage('Account name cannot be empty')
          return
        }
        setMode('add_token')
        return
      }
      if (key.backspace || key.delete) {
        setNewAccName((prev) => prev.slice(0, -1))
        return
      }
      if (input && !key.ctrl && !key.meta) {
        setNewAccName((prev) => prev + input)
      }
      return
    }

    if (mode === 'add_token') {
      if (key.escape) {
        setMode('list')
        return
      }
      if (key.return) {
        if (newAccToken.trim().length === 0) {
          setToastMessage('API Token cannot be empty')
          return
        }
        void (async () => {
          try {
            await accountManager.addAccount(newAccName.trim(), newAccToken.trim())
            setToastType('success')
            setToastMessage(`Account ${newAccName} added successfully`)
            setMode('list')
            onAccountChanged()
          } catch (err) {
            setToastType('error')
            setToastMessage(err instanceof Error ? err.message : 'Failed to add account')
          }
        })()
        return
      }
      if (key.backspace || key.delete) {
        setNewAccToken((prev) => prev.slice(0, -1))
        return
      }
      if (input && !key.ctrl && !key.meta) {
        setNewAccToken((prev) => prev + input)
      }
      return
    }
  })

  if (mode === 'confirm_delete' && accountToDelete) {
    return (
      <Box flexDirection="column" padding={1}>
        <Confirm
          message={`Remove account ${accountToDelete}?`}
          onConfirm={() => {
            void (async () => {
              try {
                await accountManager.removeAccount(accountToDelete)
                setAccountToDelete(null)
                setMode('list')
                setToastType('success')
                setToastMessage(`Account ${accountToDelete} removed`)
                onAccountChanged()
              } catch (err) {
                setToastType('error')
                setToastMessage(err instanceof Error ? err.message : 'Failed to delete')
                setMode('list')
              }
            })()
          }}
          onCancel={() => {
            setAccountToDelete(null)
            setMode('list')
          }}
        />
      </Box>
    )
  }

  if (mode === 'add_name') {
    return (
      <Box flexDirection="column" padding={1} gap={1}>
        <Text bold color="cyan">Add New Cloudflare Account (Step 1/2):</Text>
        <Text>Enter Account Label / Name:</Text>
        <Box borderStyle="round" borderColor="cyan" paddingX={1}>
          <Text>{'> '}</Text>
          <Text color="green">{newAccName}</Text>
          <Text color="gray">_</Text>
        </Box>
        <Text dimColor>Press Enter to continue | Esc to cancel</Text>
      </Box>
    )
  }

  if (mode === 'add_token') {
    return (
      <Box flexDirection="column" padding={1} gap={1}>
        <Text bold color="cyan">Add New Cloudflare Account (Step 2/2):</Text>
        <Text>Enter Cloudflare API Token:</Text>
        <Box borderStyle="round" borderColor="cyan" paddingX={1}>
          <Text>{'> '}</Text>
          <Text color="green">{'*'.repeat(newAccToken.length)}</Text>
          <Text color="gray">_</Text>
        </Box>
        <Text dimColor>Press Enter to save account | Esc to cancel</Text>
      </Box>
    )
  }

  const headers = ['#', 'Name', 'API Token', 'Added At', 'Active']
  const rows = accounts.map((acc, idx) => [
    idx === selectedIndex ? `> ${idx + 1}` : `  ${idx + 1}`,
    acc.name,
    acc.maskedToken,
    acc.addedAt.slice(0, 10),
    acc.name === activeName ? '★ Active' : '',
  ])

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Box borderStyle="single" borderColor="cyan" paddingX={1} justifyContent="space-between">
        <Text bold color="cyan">Account Management</Text>
        <Text dimColor>Total: {accounts.length}</Text>
      </Box>

      {toastMessage && (
        <Toast
          message={toastMessage}
          type={toastType}
          onDismiss={() => setToastMessage(null)}
        />
      )}

      {accounts.length === 0 ? (
        <Box padding={1}>
          <Text dimColor>No accounts found. Press 'a' to add an account.</Text>
        </Box>
      ) : (
        <Table headers={headers} rows={rows} />
      )}

      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>
          ↑/↓ Navigate | s/Enter Switch | a Add | d Delete | Esc Back
        </Text>
      </Box>
    </Box>
  )
}

