---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---
# PromKep-Tutra Project Rules

> LINE bot + Next.js LIFF + Fastify API for personal finance tracking

## Architecture

- **API**: Fastify + Prisma + SQLite (port 3001)
- **Web**: Next.js 16 + React 19 + Tailwind CSS + LIFF (port 3000)
- **Deploy**: Docker + Caddy reverse proxy on shared droplet with pwt-tx

## LINE Integration

### LIFF (LINE Front-end Framework)
- LIFF ID is set via `NEXT_PUBLIC_LIFF_ID` build arg at Docker build time
- Must call `liff.init()` before using any LIFF features
- Use `liff.getIDToken()` for authentication, NOT `liff.getAccessToken()`
- Always check `liff.isLoggedIn()` before calling `liff.getProfile()`

### Authentication Flow
1. Web calls `initLiff()` → gets `idToken` from LINE
2. Web sends `Authorization: Bearer <idToken>` to API
3. API verifies token with LINE OAuth2 endpoint
4. API upserts user in database

### Error Handling
- LIFF init must have timeout (10s max) to prevent infinite loading
- Show Thai error messages for mobile users: "กรุณาเปิดผ่านแอป LINE"
- Handle 401 from `/me` by showing error UI, not infinite loader

## API Conventions

### Response Format
Always wrap list endpoints with `{ data: [...] }`:
```typescript
// CORRECT
return { data: debts }

// WRONG - causes client crash
return debts
```

### Auth Headers
Client sends:
- `Authorization: Bearer <idToken>` (from LIFF)
- `x-line-user-id: <userId>` (dev fallback only)

### Database
- Use Prisma ORM
- SQLite in production (single file)
- Always run migrations before starting server

## Web Conventions

### State Management
- Use `@tanstack/react-query` for server state
- Use React Context for auth state only
- Stale time: 30s default

### Components
- Use Radix UI primitives via `@/components/ui`
- Tailwind CSS for styling
- Framer Motion for animations
- Lucide icons only (no emoji icons)

### Charts
- Recharts 3.x with React 19 has known bugs
- Always handle empty data: check `.length` before rendering
- Current workaround: charts disabled pending upstream fix

## Deployment

### Docker
- Multi-stage builds for both API and Web
- Web uses Next.js standalone output
- No host port mapping (Caddy reverse proxy)
- Joins `pwt-tx_app` network

### Environment Variables
Production `.env` on droplet must include:
```
LINE_CHANNEL_ACCESS_TOKEN=
LINE_LOGIN_CHANNEL_ID=
ADMIN_LINE_USER_IDS=
GEMINI_API_KEY=
DATABASE_URL=file:/data/prod.db
```

### Build Process
1. Push git tag `v*` → triggers GitHub Actions
2. Builds API + Web Docker images
3. Pushes to GHCR
4. Auto-deploys to droplet via SSH

## Common Pitfalls

1. **LIFF channel mismatch**: Old LIFF IDs from previous channels won't work
2. **Richmenu caching**: API caches richmenu IDs in memory; restart after creating new ones
3. **Dev auth bypass**: `DISABLE_DEV_AUTH_HEADER=1` must be set in production
4. **UTF-8 in .env**: Thai characters corrupt Docker env parser
5. **Recharts + React 19**: Empty array causes `Cannot read properties of undefined (reading 'length')`

## Testing

- Health check: `curl https://promkep-api.alizoft.site/health`
- LIFF test: Open from LINE app, check console for `[LIFF]` logs
- Auth test: `curl -H "Authorization: Bearer <token>" https://promkep-api.alizoft.site/me`
