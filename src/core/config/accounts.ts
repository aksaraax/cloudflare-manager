import { verifyToken } from '../api/client.js'
import { ConfigError } from '../utils/errors.js'
import {
  type AccountEntry,
  type ConfigData,
  configExists,
  initConfig,
  loadConfig,
  saveConfig,
} from './store.js'

interface ActiveSession {
  data: ConfigData
  password: string
  unlockedAt: number
}

export class AccountManager {
  private session: ActiveSession | null = null
  private lastActivity: number = Date.now()

  private requireSession(): ActiveSession {
    if (!this.session) {
      throw new ConfigError('CONFIG_LOCKED', 'Account manager is locked. Call unlock() first.')
    }
    return this.session
  }

  async unlock(password: string): Promise<void> {
    if (!configExists()) {
      await initConfig(password)
    }
    const data = await loadConfig(password)
    this.session = { data, password, unlockedAt: Date.now() }
    this.lastActivity = Date.now()
  }

  lock(): void {
    this.session = null
  }

  isLocked(): boolean {
    return this.session === null
  }

  checkAutoLock(idleTimeoutMs: number): void {
    if (Date.now() - this.lastActivity > idleTimeoutMs) {
      this.lock()
    }
  }

  touch(): void {
    this.lastActivity = Date.now()
  }

  listAccounts(): Array<{ name: string; maskedToken: string; addedAt: string }> {
    const { data } = this.requireSession()
    this.touch()
    return data.accounts.map((acc) => ({
      name: acc.name,
      maskedToken: this.maskToken(acc.apiToken),
      addedAt: acc.addedAt,
    }))
  }

  async addAccount(name: string, apiToken: string): Promise<void> {
    const session = this.requireSession()
    this.touch()

    const exists = session.data.accounts.some((acc) => acc.name === name)
    if (exists) {
      throw new ConfigError('CONFIG_ACCOUNT_EXISTS', `Account '${name}' already exists`)
    }

    await verifyToken(apiToken)

    const entry: AccountEntry = { name, apiToken, addedAt: new Date().toISOString() }
    session.data.accounts.push(entry)

    if (session.data.activeAccount === null) {
      session.data.activeAccount = name
    }

    await saveConfig(session.data, session.password)
  }

  async removeAccount(name: string): Promise<void> {
    const session = this.requireSession()
    this.touch()

    const index = session.data.accounts.findIndex((acc) => acc.name === name)
    if (index === -1) {
      throw new ConfigError('CONFIG_ACCOUNT_NOT_FOUND', `Account '${name}' not found`)
    }

    session.data.accounts.splice(index, 1)

    if (session.data.activeAccount === name) {
      session.data.activeAccount = session.data.accounts[0]?.name ?? null
    }

    await saveConfig(session.data, session.password)
  }

  async switchAccount(name: string): Promise<void> {
    const session = this.requireSession()
    this.touch()

    const exists = session.data.accounts.some((acc) => acc.name === name)
    if (!exists) {
      throw new ConfigError('CONFIG_ACCOUNT_NOT_FOUND', `Account '${name}' not found`)
    }

    session.data.activeAccount = name
    await saveConfig(session.data, session.password)
  }

  getActiveToken(): string | null {
    const envToken = process.env['CFM_API_TOKEN'] ?? process.env['CLOUDFLARE_API_TOKEN']
    if (envToken) return envToken

    if (!this.session) return null
    this.touch()

    const { data } = this.session
    if (!data.activeAccount) return null

    const account = data.accounts.find((acc) => acc.name === data.activeAccount)
    return account?.apiToken ?? null
  }

  getActiveAccountName(): string | null {
    const envName = process.env['CFM_ACCOUNT_NAME']
    if (envName) return envName

    if (!this.session) return null
    this.touch()
    return this.session.data.activeAccount
  }

  maskToken(token: string): string {
    const last4 = token.slice(-4)
    return `****${last4}`
  }
}

export const accountManager = new AccountManager()
