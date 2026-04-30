import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCaller, AuthError, type CallerIdentity } from '@/lib/auth'

const SATANG_PER_BAHT = 100

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

const listQuery = z.object({
  role: z.enum(['creditor', 'debtor']).optional(),
  status: z.string().optional(),
})

const createBody = z.object({
  debtorLineUserId: z.string().min(1),
  amountBaht: z.number().positive(),
  reason: z.string().optional(),
  dueAt: z.string().datetime().optional(),
})

const patchBody = z.object({
  status: z.enum(['paid', 'rejected', 'later']),
})

const idParam = z.object({ id: z.string().min(1) })

export async function debtRoutes(app: FastifyInstance) {
  app.get('/debts', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return

    const parsed = listQuery.safeParse(req.query)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_query', message: parsed.error.message })
    }

    const { role, status } = parsed.data

    const where: Record<string, unknown> = {}
    if (role === 'creditor') {
      where.creditorId = caller.userId
    } else if (role === 'debtor') {
      where.debtorId = caller.userId
    } else {
      where.OR = [{ creditorId: caller.userId }, { debtorId: caller.userId }]
    }
    if (status) {
      where.status = status
    }

    const debts = await prisma.debtRequest.findMany({
      where,
      include: {
        creditor: { select: { id: true, displayName: true, avatarUrl: true } },
        debtor: { select: { id: true, displayName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return { data: debts }
  })

  app.post('/debts', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return

    const parsed = createBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', message: parsed.error.message })
    }

    const { debtorLineUserId, amountBaht, reason, dueAt } = parsed.data

    if (debtorLineUserId === caller.lineUserId) {
      return reply.status(422).send({ error: 'self_debt', message: 'cannot create debt with yourself' })
    }

    const debtor = await prisma.user.findUnique({ where: { lineUserId: debtorLineUserId } })
    if (!debtor) {
      return reply.status(404).send({ error: 'debtor_not_found', message: 'debtor user not found' })
    }

    const debt = await prisma.debtRequest.create({
      data: {
        creditorId: caller.userId,
        debtorId: debtor.id,
        amount: Math.round(amountBaht * SATANG_PER_BAHT),
        reason: reason ?? null,
        dueAt: dueAt ? new Date(dueAt) : null,
        status: 'pending',
      },
      include: {
        creditor: { select: { id: true, displayName: true } },
        debtor: { select: { id: true, displayName: true } },
      },
    })
    return reply.status(201).send(debt)
  })

  app.patch('/debts/:id', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return

    const params = idParam.safeParse(req.params)
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_id', message: 'missing id' })
    }

    const parsed = patchBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', message: parsed.error.message })
    }

    const { status } = parsed.data

    const debt = await prisma.debtRequest.findUnique({ where: { id: params.data.id } })
    if (!debt) {
      return reply.status(404).send({ error: 'not_found', message: 'debt not found' })
    }

    if (debt.status !== 'pending') {
      return reply.status(409).send({ error: 'already_resolved', message: `debt is already ${debt.status}` })
    }

    const isCreditor = debt.creditorId === caller.userId
    const isDebtor = debt.debtorId === caller.userId

    if (!isCreditor && !isDebtor) {
      return reply.status(403).send({ error: 'forbidden', message: 'not your debt' })
    }

    // Debtor can: paid, later, rejected. Creditor can only cancel (rejected).
    if (isCreditor && !isDebtor && status !== 'rejected') {
      return reply.status(403).send({
        error: 'forbidden',
        message: 'creditor can only cancel (rejected); debtor marks paid/later/rejected',
      })
    }

    const updated = await prisma.debtRequest.update({
      where: { id: debt.id },
      data: { status, resolvedAt: new Date() },
    })
    return updated
  })
}
