# promkep-tutra — Production deploy

Co-tenant on the same DigitalOcean droplet as `pwt-tx`. Reuses the existing
Docker engine, swap, ufw, and Caddy reverse proxy installed by pwt-tx's
setup. No second Caddy or second swap file.

## Files

```
deploy/docker-compose.yml     — promkep stack (api + web), joins pwt-tx_app network
deploy/Caddyfile.snippet      — appended to /opt/pwt-tx/Caddyfile
deploy/.env.example           — runtime config template
deploy/setup.sh               — idempotent one-time bootstrap (mkdir + checks)
.github/workflows/release.yml — tag → build to GHCR → ssh deploy
```

## Subdomains

Two A records on z.com (or whatever DNS provider) pointing at the existing droplet IP:

- `promkep-api.alizoft.site → 139.59.239.35`
- `promkep-web.alizoft.site → 139.59.239.35`

## One-time droplet setup

```bash
# Bootstrap (idempotent)
scp deploy/setup.sh root@139.59.239.35:/tmp/promkep-setup.sh
ssh root@139.59.239.35 'bash /tmp/promkep-setup.sh'

# Stage compose + env on droplet
scp deploy/docker-compose.yml deploy/.env.example root@139.59.239.35:/opt/promkep-tutra/

# Configure on droplet
ssh root@139.59.239.35
cd /opt/promkep-tutra
cp .env.example .env
nano .env   # fill LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET, GEMINI_API_KEY

# Wire Caddy: append snippet → restart pwt-tx caddy
cat /opt/pwt-tx/Caddyfile.snippet  # (after scp deploy/Caddyfile.snippet there first)
docker compose -f /opt/pwt-tx/docker-compose.yml restart caddy

# GHCR auth (private repo)
docker login ghcr.io -u <github-user>   # paste a PAT with read:packages scope

# First boot
docker compose up -d
docker compose ps
docker compose logs api --tail=50
```

## GitHub Secrets

Set in `Settings → Secrets and variables → Actions → Secrets` (NOT the Variables tab):

| Secret | Value |
|---|---|
| `DEPLOY_SSH_KEY` | private key of a deploy keypair authorized on the droplet |
| `DROPLET_HOST` | `139.59.239.35` |
| `NEXT_PUBLIC_API_URL` | `https://promkep-api.alizoft.site` |
| `NEXT_PUBLIC_LIFF_ID` | LIFF ID from a LIFF app pointing at promkep-web |
| `NEXT_PUBLIC_DEV_LINE_USER_ID` | leave empty (LIFF is real) |

Optional: `DROPLET_USER` (defaults `root`).

## Triggering a release

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions:
1. `meta` resolves the tag + lowercase owner.
2. `build-api` + `build-web` run in parallel → push to `ghcr.io/<owner>/promkep-tutra-{api,web}:<tag>` and `:latest`.
3. `deploy` SSHes into the droplet, updates `IMAGE_TAG` in `/opt/promkep-tutra/.env`, runs `docker compose pull && up -d`.

## After first deploy — LINE config

1. **OA Manager → Webhook URL** → `https://promkep-api.alizoft.site/line/webhook` → Verify.
2. **OA Manager → Auto-reply messages** → off.
3. **OA Manager → Greeting message** → on (welcome blurb).
4. **LIFF app Endpoint URL** (Araiwa channel → LIFF tab) → `https://promkep-web.alizoft.site`.
5. **Rich menus** — run inside api container once env is live:
   ```bash
   ssh root@139.59.239.35
   docker compose -f /opt/promkep-tutra/docker-compose.yml exec api \
     npx tsx scripts/setup-richmenu.ts https://liff.line.me/<LIFF_ID>
   ```

## Operational notes

- SQLite DB at `/opt/promkep-tutra/data/api/dev.db` on host. Backup with `tar` or `restic`.
- Image attachments at `/opt/promkep-tutra/data/uploads/`.
- Rich-menu IDs cache at `/opt/promkep-tutra/data/cache/richmenu-ids.json`.
- Prisma Studio for DB inspection: `docker compose run --rm -p 5555:5555 -e DATABASE_URL=file:/app/data/dev.db api npx prisma studio --port 5555 --hostname 0.0.0.0 --browser none` + SSH tunnel `-L 5555:localhost:5555`.
- Combined memory ceiling (pwt-tx + promkep) typically ~750 MB / 1 GB. Watch with `docker stats`. Bump droplet to $12 if it tightens.
