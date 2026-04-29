# syntax=docker/dockerfile:1.7
# Multi-stage build for the promkep-tutra API.
# Build context is the repo root: `docker build -f api/Dockerfile .`

# ── build stage ─────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS build
WORKDIR /app

# Native build deps for sharp / @napi-rs/canvas.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY api/package*.json ./
RUN npm install --no-audit --no-fund --no-progress

COPY api/ ./
RUN npx prisma generate && npm run build

# ── runtime stage ───────────────────────────────────────────────────────────
FROM node:24-bookworm-slim
WORKDIR /app

# fonts-thai-tlwg ships Garuda/Loma/Norasi for @napi-rs/canvas Thai rendering.
# dumb-init forwards SIGTERM cleanly under Docker.
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-thai-tlwg ca-certificates dumb-init \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/assets ./assets
COPY --from=build /app/src/skills ./dist/skills
COPY api/package.json ./

ENV NODE_ENV=production
ENV PORT=3002
EXPOSE 3002

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
