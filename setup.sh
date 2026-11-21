#!/usr/bin/env bash
# Setup Cloudflare Manager (mode bot) di VPS Ubuntu/Debian dan daftarkan sebagai service systemd.
# Pakai: sudo bash setup.sh   (aman dijalankan ulang, misal setelah update kode)
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE=cf-manager
RUN_USER="${SUDO_USER:-root}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Jalankan dengan sudo: sudo bash setup.sh"
  exit 1
fi

cd "$APP_DIR"

# 1. Node.js >= 20
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  echo "==> Install Node.js 20"
  apt-get update
  apt-get install -y curl ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# 2. pnpm
if ! command -v pnpm >/dev/null; then
  echo "==> Install pnpm"
  npm install -g pnpm
fi

# 3. .env
if [ ! -f .env ]; then
  cp .env.example .env
  chown "$RUN_USER" .env
  echo "==> .env dibuat dari .env.example. Isi dulu, lalu jalankan ulang: sudo bash setup.sh"
  exit 1
fi
chmod 600 .env
if ! grep -qE '^TELEGRAM_BOT_TOKEN=.+' .env || ! grep -qE '^TELEGRAM_ALLOWED_IDS=.+' .env; then
  echo "TELEGRAM_BOT_TOKEN dan TELEGRAM_ALLOWED_IDS wajib diisi di .env"
  exit 1
fi
if ! grep -qE '^CFM_API_TOKEN=.+' .env; then
  echo "PERINGATAN: CFM_API_TOKEN kosong, command bot yang butuh Cloudflare API akan gagal."
fi

# 4. Dependency + build
echo "==> Install dependency"
chown -R "$RUN_USER" "$APP_DIR"
sudo -u "$RUN_USER" pnpm install --frozen-lockfile

echo "==> Build"
# tsc masih tetap menghasilkan dist/ walaupun ada type error, jadi yang dicek adalah hasil build-nya.
sudo -u "$RUN_USER" pnpm run build || echo "PERINGATAN: build melaporkan type error (lihat di atas)."
if [ ! -f dist/index.js ]; then
  echo "Build gagal: dist/index.js tidak ada."
  exit 1
fi

# 5. Service systemd
echo "==> Daftarkan service $SERVICE"
cat > "/etc/systemd/system/$SERVICE.service" <<EOF
[Unit]
Description=Cloudflare Manager Telegram Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$APP_DIR
Environment=CFM_MODE=bot
ExecStart=$(command -v node) dist/index.js
Restart=always
RestartSec=5
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE"
systemctl restart "$SERVICE"
sleep 3
systemctl --no-pager status "$SERVICE" || true

echo
echo "Selesai. Log: journalctl -u $SERVICE -f"
