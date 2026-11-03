#!/usr/bin/env node
import 'dotenv/config'
import { logger } from './core/utils/logger.js'
import { redactSensitive } from './core/utils/logger.js'

process.on('unhandledRejection', (reason: unknown) => {
  const message = reason instanceof Error ? redactSensitive(reason.message) : String(reason)
  logger.error('Unhandled rejection', { message })
  process.exit(1)
})

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception', { message: redactSensitive(error.message) })
  process.exit(1)
})

const mode = process.env['CFM_MODE'] ?? 'tui'

if (mode === 'bot') {
  const { startBot } = await import('./bot/index.js')
  await startBot()
} else {
  const { startTui } = await import('./tui/App.js')
  startTui()
}

