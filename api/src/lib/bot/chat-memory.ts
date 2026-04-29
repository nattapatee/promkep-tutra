/**
 * Per-user conversation memory for the AI secretary ("น้องเก็บ").
 */
import { prisma } from '@/lib/prisma'

const DEFAULT_TURN_LIMIT = 12
const DEFAULT_TTL_HOURS = 24
const MS_PER_HOUR = 60 * 60 * 1000

export type ChatRole = 'user' | 'model'

export interface ChatTurn {
  role: ChatRole
  text: string
}

function ttlCutoff(ttlHours: number): Date {
  return new Date(Date.now() - ttlHours * MS_PER_HOUR)
}

export async function appendUserMessage(userId: string, text: string): Promise<void> {
  await prisma.chatMessage.create({ data: { userId, role: 'user', text } })
  await pruneOlder(DEFAULT_TTL_HOURS).catch(() => {
    /* swallow — janitor failures must never break user flow */
  })
}

export async function appendModelMessage(userId: string, text: string): Promise<void> {
  await prisma.chatMessage.create({ data: { userId, role: 'model', text } })
}

export async function getRecentTurns(
  userId: string,
  limit: number = DEFAULT_TURN_LIMIT,
  ttlHours: number = DEFAULT_TTL_HOURS,
): Promise<ChatTurn[]> {
  const cutoff = ttlCutoff(ttlHours)
  const rows = await prisma.chatMessage.findMany({
    where: { userId, createdAt: { gt: cutoff } },
    orderBy: { createdAt: 'asc' },
    take: limit * 2,
  })
  return rows.map((r) => ({
    role: (r.role === 'model' ? 'model' : 'user') as ChatRole,
    text: r.text,
  }))
}

export async function clearForUser(userId: string): Promise<number> {
  const res = await prisma.chatMessage.deleteMany({ where: { userId } })
  return res.count
}

export async function pruneOlder(ttlHours: number = DEFAULT_TTL_HOURS): Promise<number> {
  const cutoff = ttlCutoff(ttlHours)
  const res = await prisma.chatMessage.deleteMany({ where: { createdAt: { lt: cutoff } } })
  return res.count
}
