# syntax=docker/dockerfile:1.7
# Multi-stage build for the promkep-tutra web (Next.js standalone output).
# Build context is the repo root: `docker build -f web/Dockerfile .`

# ── build stage ─────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY web/package.json ./
# Note: skipping lockfile entirely — Next.js's transitive sharp dep ships
# malformed optional-binary entries (empty version field) that fail npm
# regardless of `ci` vs `install`. Lockfile is regenerated fresh in container.
RUN npm install --no-audit --no-fund --no-progress

COPY web/ ./

ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_LIFF_ID
ARG NEXT_PUBLIC_DEV_LINE_USER_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_LIFF_ID=$NEXT_PUBLIC_LIFF_ID
ENV NEXT_PUBLIC_DEV_LINE_USER_ID=$NEXT_PUBLIC_DEV_LINE_USER_ID

RUN npm run build

# ── runtime stage ───────────────────────────────────────────────────────────
FROM node:24-bookworm-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates dumb-init \
    && rm -rf /var/lib/apt/lists/*

# Next.js standalone output bundles only what's needed to run.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
