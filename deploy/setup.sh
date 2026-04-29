#!/usr/bin/env bash
# Idempotent bootstrap for the promkep-tutra stack on the existing droplet.
# Assumes pwt-tx is already deployed (Docker, Caddy, swap, ufw all set).
# Run as root.
set -euo pipefail

APP_DIR="/opt/promkep-tutra"

echo "→ Ensuring app directory exists at $APP_DIR"
install -d -m 0755 "$APP_DIR"
install -d -m 0755 "$APP_DIR/data/api" "$APP_DIR/data/uploads" "$APP_DIR/data/cache"

echo "→ Verifying Docker is installed (should be — installed by pwt-tx setup)"
if ! command -v docker >/dev/null 2>&1; then
  echo "✗ Docker not found. Run /opt/pwt-tx/setup.sh first." >&2
  exit 1
fi

echo "→ Verifying shared docker network 'pwt-tx_app' exists"
if ! docker network inspect pwt-tx_app >/dev/null 2>&1; then
  echo "✗ Network 'pwt-tx_app' missing. Run pwt-tx stack first:" >&2
  echo "    cd /opt/pwt-tx && docker compose up -d" >&2
  exit 1
fi

cat <<'EOF'

✓ Bootstrap complete.

Next steps:
  1. scp deploy/docker-compose.yml deploy/.env.example root@<droplet>:/opt/promkep-tutra/
  2. ssh root@<droplet>:
       cd /opt/promkep-tutra
       cp .env.example .env
       nano .env                          # fill in real values
  3. Append deploy/Caddyfile.snippet to /opt/pwt-tx/Caddyfile, then:
       docker compose -f /opt/pwt-tx/docker-compose.yml restart caddy
  4. docker login ghcr.io -u <github-user>  # if private repo
  5. cd /opt/promkep-tutra && docker compose up -d
EOF
