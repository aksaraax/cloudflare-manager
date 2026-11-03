import React, { useEffect, useState } from 'react'
import { render, Box, Text, useInput, useApp } from 'ink'
import { accountManager } from '../core/config/accounts.js'
import { Dashboard } from './screens/Dashboard.js'
import { ZoneMenu, ZoneScreenType } from './screens/ZoneMenu.js'
import { Dns } from './screens/Dns.js'
import { BulkDns } from './screens/BulkDns.js'
import { Cache } from './screens/Cache.js'
import { Firewall } from './screens/Firewall.js'
import { Ssl } from './screens/Ssl.js'
import { Workers } from './screens/Workers.js'
import { Accounts } from './screens/Accounts.js'
import { Toast } from './components/Toast.js'

type Screen =
  | 'unlock'
  | 'dashboard'
  | 'accounts'
  | 'zone-menu'
  | ZoneScreenType

export function App(): React.ReactElement {
  const { exit } = useApp()
  const [screen, setScreen] = useState<Screen>(() => {
    if (process.env['CFM_API_TOKEN']) {
      return 'dashboard'
    }
    return 'unlock'
  })

  const [passwordInput, setPasswordInput] = useState('')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [selectedZone, setSelectedZone] = useState<{ id: string; name: string } | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  const activeToken = accountManager.getActiveToken()
  const activeAccountName = accountManager.getActiveAccountName()

  useEffect(() => {
    const IDLE_TIMEOUT_MS = 30 * 60 * 1000
    const interval = setInterval(() => {
      accountManager.checkAutoLock(IDLE_TIMEOUT_MS)
      if (accountManager.isLocked() && !process.env['CFM_API_TOKEN']) {
        setScreen('unlock')
      }
    }, 30_000)
    return () => clearInterval(interval)
  }, [])

  useInput((input, key) => {
    if (screen !== 'unlock') return

    if (key.return) {
      if (passwordInput.length === 0) {
        setToastMessage('Password cannot be empty')
        return
      }
      void (async () => {
        try {
          await accountManager.unlock(passwordInput)
          setPasswordInput('')
          setToastMessage(null)
          setScreen('dashboard')
        } catch (err) {
          setToastMessage(err instanceof Error ? err.message : 'Invalid password or decrypt error')
        }
      })()
      return
    }

    if (key.backspace || key.delete) {
      setPasswordInput((prev) => prev.slice(0, -1))
      return
    }

    if (input && !key.ctrl && !key.meta) {
      setPasswordInput((prev) => prev + input)
    }
  })

  if (screen === 'unlock') {
    return (
      <Box flexDirection="column" padding={2} gap={1} borderStyle="round" borderColor="cyan">
        <Text bold color="cyan">
          Cloudflare Manager (TUI)
        </Text>
        <Text>Enter Master Password to unlock encrypted configuration:</Text>
        {toastMessage && (
          <Toast
            message={toastMessage}
            type="error"
            onDismiss={() => setToastMessage(null)}
          />
        )}
        <Box borderStyle="single" borderColor="gray" paddingX={1}>
          <Text>{'> '}</Text>
          <Text color="green">{'*'.repeat(passwordInput.length)}</Text>
          <Text color="gray">_</Text>
        </Box>
        <Text dimColor>Type password and press Enter to unlock | Ctrl+C to exit</Text>
      </Box>
    )
  }

  if (!activeToken) {
    return (
      <Box flexDirection="column" padding={1} gap={1}>
        <Text bold color="yellow">No active Cloudflare account configured.</Text>
        <Text>Please configure an account to proceed.</Text>
        <Accounts
          onBack={() => setScreen('unlock')}
          onAccountChanged={() => {
            setRefreshToken((p) => p + 1)
            setScreen('dashboard')
          }}
        />
      </Box>
    )
  }

  if (screen === 'dashboard') {
    return (
      <Dashboard
        key={refreshToken}
        apiToken={activeToken}
        activeAccountName={activeAccountName}
        onSelectZone={(id, name) => {
          setSelectedZone({ id, name })
          setScreen('zone-menu')
        }}
        onGoToAccounts={() => setScreen('accounts')}
        onQuit={() => exit()}
      />
    )
  }

  if (screen === 'accounts') {
    return (
      <Accounts
        onBack={() => setScreen('dashboard')}
        onAccountChanged={() => setRefreshToken((p) => p + 1)}
      />
    )
  }

  if (!selectedZone) {
    return (
      <Dashboard
        apiToken={activeToken}
        activeAccountName={activeAccountName}
        onSelectZone={(id, name) => {
          setSelectedZone({ id, name })
          setScreen('zone-menu')
        }}
        onGoToAccounts={() => setScreen('accounts')}
        onQuit={() => exit()}
      />
    )
  }

  if (screen === 'zone-menu') {
    return (
      <ZoneMenu
        zoneId={selectedZone.id}
        zoneName={selectedZone.name}
        apiToken={activeToken}
        onNavigate={(targetScreen) => setScreen(targetScreen)}
        onBack={() => setScreen('dashboard')}
      />
    )
  }

  if (screen === 'dns') {
    return (
      <Dns
        zoneId={selectedZone.id}
        zoneName={selectedZone.name}
        apiToken={activeToken}
        onBack={() => setScreen('zone-menu')}
      />
    )
  }

  if (screen === 'bulk') {
    return (
      <BulkDns
        zoneId={selectedZone.id}
        apiToken={activeToken}
        onBack={() => setScreen('zone-menu')}
      />
    )
  }

  if (screen === 'cache') {
    return (
      <Cache
        zoneId={selectedZone.id}
        zoneName={selectedZone.name}
        apiToken={activeToken}
        onBack={() => setScreen('zone-menu')}
      />
    )
  }

  if (screen === 'firewall') {
    return (
      <Firewall
        zoneId={selectedZone.id}
        zoneName={selectedZone.name}
        apiToken={activeToken}
        onBack={() => setScreen('zone-menu')}
      />
    )
  }

  if (screen === 'ssl') {
    return (
      <Ssl
        zoneId={selectedZone.id}
        zoneName={selectedZone.name}
        apiToken={activeToken}
        onBack={() => setScreen('zone-menu')}
      />
    )
  }

  if (screen === 'workers') {
    return (
      <Workers
        apiToken={activeToken}
        onBack={() => setScreen('zone-menu')}
      />
    )
  }

  return <Box />
}

export function startTui(): void {
  render(<App />)
}

