import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCaller, AuthError, type CallerIdentity } from '@/lib/auth'

const MAX_BAHT = 999_999.99
const SATANG_PER_BAHT = 100

const transactionType = z.enum(['income', 'expense'])

const listQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  type: transactionType.optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

const createBody = z.object({
  type: transactionType,
  amountBaht: z.number().positive().max(MAX_BAHT),
  categoryId: z.number().int().positive(),
  occurredAt: z.string().datetime(),
  title: z.string().min(1).max(80).optional(),
  note: z.string().max(1000).optional(),
})

const updateBody = createBody.partial()

const idParam = z.object({ id: z.string().min(1) })

const transactionInclude = {
  category: true,
  createdBy: { select: { id: true, displayName: true, avatarUrl: true, lineUserId: true } },
  attachments: true,
} as const

function bahtToSatang(amountBaht: number): number {
  return Math.round(amountBaht * SATANG_PER_BAHT)
}

function satangToBaht(amountSatang: number): number {
  return amountSatang / SATANG_PER_BAHT
}

async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<CallerIdentity | null> {
  try {
    return await getCaller(req)
  } catch (err) {
    if (err instanceof AuthError) {
      reply.status(401).send({ error: err.code, message: err.message })
      return null
    }
    throw err
  }
}

function requireRegistered(caller: CallerIdentity, reply: FastifyReply): boolean {
  if (caller.registered) return true
  reply.status(403).send({ error: 'not_registered', message: 'please register first' })
  return false
}

function zodMessage(issues: z.ZodIssue[]): string {
  return issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
}

interface SerializableTxn {
  id: string
  type: string
  amount: number
  categoryId: number
  category: unknown
  title: string | null
  note: string | null
  occurredAt: Date
  createdById: string
  createdBy: unknown
  createdAt: Date
  attachments: unknown
}

function serialize(txn: SerializableTxn) {
  return {
    id: txn.id,
    type: txn.type,
    amount: txn.amount,
    amountBaht: satangToBaht(txn.amount),
    categoryId: txn.categoryId,
    category: txn.category,
    title: txn.title,
    note: txn.note,
    occurredAt: txn.occurredAt.toISOString(),
    createdById: txn.createdById,
    createdBy: txn.createdBy,
    createdAt: txn.createdAt.toISOString(),
    attachments: txn.attachments,
  }
}

export async function transactionRoutes(app: FastifyInstance) {
  app.get('/transactions', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return
    const parsed = listQuery.safeParse(req.query)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_query', message: zodMessage(parsed.error.issues) })
    }
    const { from, to, type, categoryId, page, pageSize } = parsed.data
    // PromKep-Tutra is private-per-user — every list scoped to caller.
    const where = {
      createdById: caller.userId,
      ...(type ? { type } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(from || to
        ? {
            occurredAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    }
    const [data, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: transactionInclude,
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.transaction.count({ where }),
    ])
    return { data: data.map(serialize), total, page, pageSize }
  })

  app.post('/transactions', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return
    if (!requireRegistered(caller, reply)) return

    const parsed = createBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', message: zodMessage(parsed.error.issues) })
    }
    const { type, amountBaht, categoryId, occurredAt, title, note } = parsed.data

    const occurredAtDate = new Date(occurredAt)
    if (occurredAtDate.getTime() > Date.now()) {
      return reply.status(400).send({ error: 'invalid_occurred_at', message: 'occurredAt cannot be in the future' })
    }

    const category = await prisma.category.findUnique({ where: { id: categoryId } })
    if (!category) {
      return reply.status(400).send({ error: 'invalid_category', message: 'category not found' })
    }
    if (category.type !== type) {
      return reply.status(400).send({
        error: 'category_type_mismatch',
        message: `category is "${category.type}", but transaction type is "${type}"`,
      })
    }

    const created = await prisma.transaction.create({
      data: {
        type,
        amount: bahtToSatang(amountBaht),
        categoryId,
        occurredAt: occurredAtDate,
        title,
        note,
        createdById: caller.userId,
      },
      include: transactionInclude,
    })

    return reply.status(201).send(serialize(created))
  })

  app.get('/transactions/:id', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return
    const params = idParam.safeParse(req.params)
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_id', message: 'missing id' })
    }
    const txn = await prisma.transaction.findFirst({
      where: { id: params.data.id, createdById: caller.userId },
      include: transactionInclude,
    })
    if (!txn) {
      return reply.status(404).send({ error: 'not_found', message: 'transaction not found' })
    }
    return serialize(txn)
  })

  app.patch('/transactions/:id', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return
    if (!requireRegistered(caller, reply)) return
    const params = idParam.safeParse(req.params)
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_id', message: 'missing id' })
    }
    const parsed = updateBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', message: zodMessage(parsed.error.issues) })
    }

    const existing = await prisma.transaction.findUnique({ where: { id: params.data.id } })
    if (!existing) {
      return reply.status(404).send({ error: 'not_found', message: 'transaction not found' })
    }
    if (existing.createdById !== caller.userId) {
      return reply.status(403).send({ error: 'forbidden', message: 'not your transaction' })
    }

    const next = parsed.data
    const nextType = next.type ?? existing.type
    const nextCategoryId = next.categoryId ?? existing.categoryId

    if (next.categoryId || next.type) {
      const category = await prisma.category.findUnique({ where: { id: nextCategoryId } })
      if (!category) {
        return reply.status(400).send({ error: 'invalid_category', message: 'category not found' })
      }
      if (category.type !== nextType) {
        return reply.status(400).send({
          error: 'category_type_mismatch',
          message: `category is "${category.type}", but transaction type is "${nextType}"`,
        })
      }
    }

    let occurredAtDate: Date | undefined
    if (next.occurredAt) {
      occurredAtDate = new Date(next.occurredAt)
      if (occurredAtDate.getTime() > Date.now()) {
        return reply.status(400).send({ error: 'invalid_occurred_at', message: 'occurredAt cannot be in the future' })
      }
    }

    const updated = await prisma.transaction.update({
      where: { id: params.data.id },
      data: {
        ...(next.type ? { type: next.type } : {}),
        ...(next.amountBaht !== undefined ? { amount: bahtToSatang(next.amountBaht) } : {}),
        ...(next.categoryId ? { categoryId: next.categoryId } : {}),
        ...(occurredAtDate ? { occurredAt: occurredAtDate } : {}),
        ...(next.title !== undefined ? { title: next.title } : {}),
        ...(next.note !== undefined ? { note: next.note } : {}),
      },
      include: transactionInclude,
    })
    return serialize(updated)
  })

  app.delete('/transactions/:id', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return
    if (!requireRegistered(caller, reply)) return
    const params = idParam.safeParse(req.params)
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_id', message: 'missing id' })
    }
    const existing = await prisma.transaction.findUnique({ where: { id: params.data.id } })
    if (!existing) {
      return reply.status(404).send({ error: 'not_found', message: 'transaction not found' })
    }
    if (existing.createdById !== caller.userId) {
      return reply.status(403).send({ error: 'forbidden', message: 'not your transaction' })
    }
    await prisma.transaction.delete({ where: { id: params.data.id } })
    return reply.status(204).send()
  })
}
