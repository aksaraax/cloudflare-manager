# Cloudflare Manager

Cloudflare Manager is an enterprise-grade operational tool written in TypeScript for managing one or multiple Cloudflare accounts through two unified interfaces: **Terminal User Interface (TUI)** and **Telegram Bot**. Both interfaces share an identical core engine, ensuring consistent validation, rate-limiting, and audit trails across all operations.

---

## Key Features

- **Bulk DNS Auto-Detect (Flagship)**: Paste multi-line raw text (e.g. `email|password`, `email:password`, CSV spreadsheets), automatically extract root domains using Public Suffix List (`tldts`), deduplicate, match against Cloudflare zones, and provision email DNS records (MX, SPF, DMARC, DKIM) with preview and exponential backoff retry.
- **Multi-Account Switching**: Manage multiple Cloudflare accounts with fast switching, stored encrypted at rest with AES-256-GCM.
- **Zone Overview**: Inspect zone status, nameservers, plans, and pause/resume zones.
- **DNS Record Management**: CRUD records (A, AAAA, CNAME, MX, TXT, NS), proxy toggles, and BIND format export.
- **Cache Purge**: Purge everything (with double confirmation) or purge specific URLs with automatic chunking.
- **Firewall Rules**: Manage IP access rules (block, allow, challenge, js_challenge) with strict IPv4/IPv6/CIDR validation.
- **SSL/TLS Configuration**: Configure SSL mode (`off`, `flexible`, `full`, `strict`), Always Use HTTPS, and TLS version settings.
- **Cloudflare Workers**: Inspect worker scripts, routes, bindings, and delete with safety confirmation.
- **Zero-Trust Security**: AES-256-GCM encrypted local store, strict Telegram user ID whitelisting, silent drop for unauthorized requests, and automatic secret redaction in all logs.

---

## Prerequisites

- **Node.js**: >= 20.0.0 LTS
- **Package Manager**: `pnpm` (recommended) or `npm`

---

## Installation

```bash
git clone https://github.com/your-org/cloudflare-manager.git
cd cloudflare-manager
pnpm install
cp .env.example .env
```

---

## Configuration

Edit `.env` or set environment variables:

| Variable | Required | Description |
|---|---|---|
| `CFM_MODE` | No | Interface mode: `tui` (default) or `bot` |
| `TELEGRAM_BOT_TOKEN` | Required for bot | Telegram bot token from @BotFather |
| `TELEGRAM_ALLOWED_IDS` | Required for bot | Comma-separated allowed Telegram user IDs |
| `CFM_ACCOUNT_NAME` | No | Override active account name |
| `CFM_API_TOKEN` | No | Override API token directly (bypasses encrypted store) |
| `CFM_CONFIG_PATH` | No | Custom encrypted config file path |
| `CFM_LOG_LEVEL` | No | Log level: `error`, `warn`, `info`, `debug` (default: `info`) |
| `CFM_DRY_RUN` | No | Set to `true` to simulate all write operations |

---

## Usage

### 1. Terminal User Interface (TUI) Mode

```bash
pnpm start
# or explicitly:
pnpm run start:tui
```

- When starting for the first time, you will be prompted to set a Master Password.
- If `CFM_API_TOKEN` is set in your `.env`, it automatically opens the dashboard without prompt.
- **Navigation Controls**:
  - `↑` / `↓`: Navigate items
  - `Enter`: Select or submit
  - `Esc`: Go back to previous screen
  - `q`: Quit application
  - `a`: Add account / Add entry
  - `d`: Delete selected entry (with confirmation)
  - `r`: Refresh data

### 2. Telegram Bot Mode

```bash
pnpm run start:bot
```

Available commands for whitelisted users:
- `/start` — Welcome menu and commands list
- `/zones` — List all zones in the active account
- `/zone <name>` — Detailed zone overview
- `/dns <zone>` — List DNS records
- `/bulk` — Interactive multi-step Bulk DNS provisioning
- `/cache <zone> [purge_all]` — Purge zone cache
- `/firewall <zone>` — List IP access firewall rules
- `/ssl <zone>` — Inspect and configure SSL/TLS settings
- `/workers` — Overview of Cloudflare Workers
- `/account [list|switch <name>]` — Switch active account
- `/lock` / `/unlock` — Manual session lock controls
- `/cancel` — Cancel ongoing flow

---

## Bulk DNS Auto-Detect Workflow

1. **Input**: Paste raw text containing emails in any format:
   ```text
   user1@domain1.com|secret123
   admin@sub.domain2.co.uk:pass456
   contact@domain1.com,extra_data
   ```
2. **Extraction & Deduplication**: Extracts unique root domains (`domain1.com`, `domain2.co.uk`), aggregates email counts, and ignores non-email lines.
3. **Zone Matching**: Matches root domains against active Cloudflare zones.
4. **Bundle Customization**: Select records to create (MX, SPF, DMARC, DKIM) and specify mail server hostname and priority.
5. **Preview & Confirmation**: Review planned actions (`create`, `skipped-exists`, `replace`).
6. **Concurrent Execution**: Executes parallel requests with automatic retry (exponential backoff) and generates an execution report.

---

## Security Architecture

- **Encrypted Storage**: Credentials stored in `~/.cloudflare-manager/config.enc` encrypted using AES-256-GCM with PBKDF2-SHA512 (100,000 iterations), unique 16-byte salt, and 12-byte IV per write.
- **Memory Protection**: Secrets are masked (`****abcd`) on all screens and never persisted in plaintext.
- **Log Redaction**: Automatic redaction of Bearer tokens, passwords, API tokens, and hashed email domains.
- **Bot Whitelist**: All incoming Telegram updates are verified against `TELEGRAM_ALLOWED_IDS`. Non-whitelisted requests are logged with hashed user IDs and silently dropped.

---

## Development

```bash
# Typecheck
pnpm run typecheck

# Run tests
pnpm test

# Test coverage
pnpm run test:coverage

# Lint
pnpm run lint

# Format code
pnpm run format
```

