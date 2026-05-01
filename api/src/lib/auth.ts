import type { FastifyRequest } from 'fastify'
import { prisma } from '@/lib/prisma'

const DEV_FALLBACK_HEADER = 'x-line-user-id'
const LINE_VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify'

export class AuthError extends Error {
  constructor(public code: string, message: string) {
    super(message)
  }
}

export interface CallerIdentity {
  userId: string
  lineUserId: string
  role: string
  registered: boolean
}

interface LineProfileFromToken {
  lineUserId: string
  displayName: string
  avatarUrl: string | null
}

interface LineVerifyResponse {
  iss?: string
  sub?: string
  aud?: string
  exp?: number
  iat?: number
  name?: string
  picture?: string
}

function readHeader(req: FastifyRequest, name: string): string | undefined {
  const v = req.headers[name]
  return Array.isArray(v) ? v[0] : v
}

function extractBearer(req: FastifyRequest): string | null {
  const auth = readHeader(req, 'authorization')
  if (!auth) return null
  const m = auth.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}

async function verifyLineIdToken(idToken: string, channelId: string): Promise<LineProfileFromToken> {
  const body = new URLSearchParams({ id_token: idToken, client_id: channelId })
  const res = await fetch(LINE_VERIFY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new AuthError('invalid_token', `LINE verify failed: ${res.status} ${text}`)
  }
  const payload = (await res.json()) as LineVerifyResponse
  if (!payload.sub) throw new AuthError('invalid_token', 'token missing sub')
  if (payload.aud !== channelId) throw new AuthError('invalid_token', 'aud mismatch')
  if (payload.exp && payload.exp * 1000 < Date.now()) {
    throw new AuthError('invalid_token', 'token expired')
  }
  return {
    lineUserId: payload.sub,
    displayName: payload.name ?? payload.sub,
    avatarUrl: payload.picture ?? null,
  }
}

function safeDecodeHeader(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function readDevHeaderProfile(req: FastifyRequest): LineProfileFromToken | null {
  const lineUserId = readHeader(req, DEV_FALLBACK_HEADER)
  if (!lineUserId) return null
  const rawName = readHeader(req, 'x-line-display-name')
  const displayName = rawName ? safeDecodeHeader(rawName) : lineUserId
  return { lineUserId, displayName, avatarUrl: null }
}

const PLACEHOLDER_DISPLAY_NAMES = new Set(['Dev User'])

function isPlaceholderName(name: string, lineUserId: string): boolean {
  return name === lineUserId || PLACEHOLDER_DISPLAY_NAMES.has(name)
}

async function fetchLineProfile(lineUserId: string): Promise<LineProfileFromToken | null> {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim()
  if (!accessToken) return null
  try {
    const res = await fetch(
      `https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!res.ok) return null
    const json = (await res.json()) as { userId?: string; displayName?: string; pictureUrl?: string }
    if (!json.displayName) return null
    return {
      lineUserId,
      displayName: json.displayName,
      avatarUrl: json.pictureUrl ?? null,
    }
  } catch {
    return null
  }
}

/**
 * Resolve the calling LINE user → internal User row.
 * - When `LINE_LOGIN_CHANNEL_ID` is set, prefer `Authorization: Bearer <id-token>`
 *   and verify against LINE's OAuth2 verify endpoint.
 * - Falls back to the dev `x-line-user-id` header when no token / channel.
 */
export async function getCaller(req: FastifyRequest): Promise<CallerIdentity> {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID?.trim()
  const allowDevHeader = process.env.DISABLE_DEV_AUTH_HEADER !== '1'

  let profile: LineProfileFromToken | null = null

  const bearer = extractBearer(req)
  if (channelId && bearer) {
    profile = await verifyLineIdToken(bearer, channelId)
  } else if (allowDevHeader) {
    profile = readDevHeaderProfile(req)
    if (profile && isPlaceholderName(profile.displayName, profile.lineUserId)) {
      const enriched = await fetchLineProfile(profile.lineUserId)
      if (enriched) profile = enriched
    }
  }

  if (!profile) {
    throw new AuthError(
      'unauthorized',
      channelId
        ? 'expected Authorization: Bearer <line-id-token>'
        : `missing ${DEV_FALLBACK_HEADER} header`,
    )
  }

  const adminIds = new Set(
    (process.env.ADMIN_LINE_USER_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  const isAdmin = adminIds.has(profile.lineUserId)

  const hasRealName = !isPlaceholderName(profile.displayName, profile.lineUserId)
  const user = await prisma.user.upsert({
    where: { lineUserId: profile.lineUserId },
    update: {
      ...(hasRealName ? { displayName: profile.displayName } : {}),
      ...(profile.avatarUrl !== null ? { avatarUrl: profile.avatarUrl } : {}),
      ...(isAdmin ? { role: 'admin' } : {}),
    },
    create: {
      lineUserId: profile.lineUserId,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      role: isAdmin ? 'admin' : 'member',
    },
  })

  return {
    userId: user.id,
    lineUserId: user.lineUserId,
    role: user.role,
    registered: user.registeredAt !== null,
  }
}
