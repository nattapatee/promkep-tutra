# PromKep-Tutra Skill

## Description

LINE bot + Next.js LIFF dashboard for personal finance tracking. Fastify API with Prisma ORM and SQLite. Deployed via Docker on shared droplet with pwt-tx.

## When to Use

- Working on promkep-tutra repository
- LINE Messaging API integration
- LIFF (LINE Front-end Framework) development
- Fastify + Prisma backend work
- Next.js + React 19 frontend work
- Docker deployment to DigitalOcean droplet

## Key Commands

```bash
# Local development
cd api && PORT=3001 npm run dev
cd web && PORT=3010 npm run dev

# Database
cd api && npx prisma migrate dev

# Docker build
docker build -f api/Dockerfile -t promkep-api .
docker build -f web/Dockerfile -t promkep-web .

# Deploy (on droplet)
cd /opt/promkep-tutra && docker compose pull && docker compose up -d
```

## Architecture

```
promkep-tutra/
├── api/          Fastify API (port 3001)
│   ├── src/
│   │   ├── routes/     API endpoints
│   │   ├── lib/        Auth, Prisma, LINE
│   │   └── server.ts   Entry point
│   └── prisma/
├── web/          Next.js 16 LIFF (port 3000)
│   ├── src/
│   │   ├── app/        Pages
│   │   ├── lib/        API client, LIFF init
│   │   └── components/ UI components
│   └── public/
└── deploy/       Docker, Caddy config
```

## LIFF Integration

### Setup
1. Create LIFF app in LINE Console
2. Set `NEXT_PUBLIC_LIFF_ID` in GitHub secrets
3. Web calls `initLiff()` on load
4. Gets `idToken` from LINE SDK
5. Sends `Authorization: Bearer <idToken>` to API

### Auth Flow
```
User opens LIFF → liff.init() → liff.login() → getIDToken()
→ API verifies with LINE → upserts user → returns JWT
```

### Common Issues
- **Infinite loading**: LIFF init timeout, check console for `[LIFF]` logs
- **401 errors**: Token expired or wrong channel ID
- **White screen**: React 19 + recharts bug, check console

## API Conventions

### Response Format
```typescript
// Lists must be wrapped
{ data: [...] }

// Single objects directly
{ id: 1, name: "..." }
```

### Auth
```typescript
// Client
const idToken = liff.getIDToken()
fetch('/api/endpoint', {
  headers: { 'Authorization': `Bearer ${idToken}` }
})

// Server
const caller = await getCaller(req) // verifies with LINE
```

## Deployment

### GitHub Actions
- Tag push `v*` triggers build
- Builds API + Web images
- Pushes to GHCR
- Auto-deploys to droplet

### Environment
- Co-tenant with pwt-tx on same droplet
- Caddy reverse proxy (shared)
- SQLite database in Docker volume
- No host port mapping

### Secrets Required
```
LINE_CHANNEL_ACCESS_TOKEN
LINE_LOGIN_CHANNEL_ID
ADMIN_LINE_USER_IDS
GEMINI_API_KEY
DROPLET_HOST
DEPLOY_SSH_KEY
NEXT_PUBLIC_API_URL
NEXT_PUBLIC_LIFF_ID
```

## Testing Checklist

- [ ] `curl https://promkep-api.alizoft.site/health` → 200
- [ ] Open LIFF from LINE app
- [ ] Check console for `[LIFF]` debug logs
- [ ] Register new user
- [ ] Add transaction
- [ ] Check dashboard loads
- [ ] Verify no white screen (recharts disabled)

## Related Skills

- frontend-patterns: React/Next.js patterns
- backend-patterns: Fastify API patterns
- security-review: Auth, secrets handling
