import { existsSync, readFileSync, writeFileSync } from 'fs'
import { chmod, mkdir } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { decrypt, encrypt } from './cipher.js'
import { ConfigError } from '../utils/errors.js'

export interface AccountEntry {
  name: string
  apiToken: string
  addedAt: string
}

export interface ConfigData {
  version: 1
  accounts: AccountEntry[]
  activeAccount: string | null
}

export function getConfigPath(): string {
  const envPath = process.env['CFM_CONFIG_PATH']
  if (envPath) return envPath
  return join(homedir(), '.cloudflare-manager', 'config.enc')
}

export async function loadConfig(password: string): Promise<ConfigData> {
  const configPath = getConfigPath()
  if (!existsSync(configPath)) {
    throw new ConfigError('CONFIG_NOT_FOUND', `Config file not found at ${configPath}`)
  }

  let raw: string
  try {
    raw = readFileSync(configPath, 'utf8')
  } catch (cause) {
    throw new ConfigError('CONFIG_READ_ERROR', 'Failed to read config file', cause)
  }

  const plaintext = await decrypt(raw.trim(), password)

  let parsed: unknown
  try {
    parsed = JSON.parse(plaintext)
  } catch (cause) {
    throw new ConfigError('CONFIG_PARSE_ERROR', 'Config file contains invalid JSON', cause)
  }

  return parsed as ConfigData
}

export async function saveConfig(data: ConfigData, password: string): Promise<void> {
  const configPath = getConfigPath()
  const dir = dirname(configPath)

  await mkdir(dir, { recursive: true })

  const plaintext = JSON.stringify(data)
  const encrypted = await encrypt(plaintext, password)

  try {
    writeFileSync(configPath, encrypted, 'utf8')
  } catch (cause) {
    throw new ConfigError('CONFIG_WRITE_ERROR', 'Failed to write config file', cause)
  }

  try {
    await chmod(configPath, 0o600)
  } catch {
  }
}

export function configExists(): boolean {
  return existsSync(getConfigPath())
}

export async function initConfig(password: string): Promise<void> {
  const freshConfig: ConfigData = {
    version: 1,
    accounts: [],
    activeAccount: null,
  }
  await saveConfig(freshConfig, password)
}
