import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCaller, AuthError, type CallerIdentity } from '@/lib/auth'
import { lineClient } from '@/lib/line'
import { buildDebtRequestBubbleForDebtor } from '@/lib/bot/flex'
import { askSecretary } from '@/lib/bot/secretary'

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
  groupId: z.string().optional(),
})

const createBody = z.object({
  debtorLineUserId: z.string().min(1),
  amountBaht: z.number().positive(),
  reason: z.string().optional(),
  dueAt: z.string().datetime().optional(),
  groupId: z.string().optional(),
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

    const { role, status, groupId } = parsed.data

    if (groupId) {
      const membership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: caller.userId } },
      })
      if (!membership) {
        return reply.status(403).send({ error: 'forbidden', message: 'not a member of this group' })
      }
    }

    // When groupId is provided → restrict to that group (already
    // membership-checked above). When omitted → return ALL debts the caller
    // is part of (personal + every group), so /debts/page shows everything.
    const where: Record<string, unknown> = {}
    if (groupId) {
      where.groupId = groupId
    }
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

    const { debtorLineUserId, amountBaht, reason, dueAt, groupId } = parsed.data

    if (debtorLineUserId === caller.lineUserId) {
      return reply.status(422).send({ error: 'self_debt', message: 'cannot create debt with yourself' })
    }

    const debtor = await prisma.user.findUnique({ where: { lineUserId: debtorLineUserId } })
    if (!debtor) {
      return reply.status(404).send({ error: 'debtor_not_found', message: 'debtor user not found' })
    }

    if (groupId) {
      const [callerMembership, debtorMembership] = await Promise.all([
        prisma.groupMember.findUnique({
          where: { groupId_userId: { groupId, userId: caller.userId } },
        }),
        prisma.groupMember.findUnique({
          where: { groupId_userId: { groupId, userId: debtor.id } },
        }),
      ])
      if (!callerMembership) {
        return reply.status(403).send({ error: 'forbidden', message: 'you are not a member of this group' })
      }
      if (!debtorMembership) {
        return reply.status(403).send({ error: 'forbidden', message: 'debtor is not a member of this group' })
      }
    }

    const debt = await prisma.debtRequest.create({
      data: {
        creditorId: caller.userId,
        debtorId: debtor.id,
        amount: Math.round(amountBaht * SATANG_PER_BAHT),
        reason: reason ?? null,
        dueAt: dueAt ? new Date(dueAt) : null,
        status: 'pending',
        groupId: groupId ?? null,
      },
      include: {
        creditor: { select: { id: true, displayName: true, avatarUrl: true } },
        debtor: { select: { id: true, displayName: true, avatarUrl: true, lineUserId: true } },
      },
    })

    // Push the same Flex bubble the LINE-text "หนี้ ..." command sends, so a
    // debt created from the web app also notifies the debtor on LINE.
    try {
      await lineClient.pushMessage({
        to: debt.debtor.lineUserId,
        messages: [
          buildDebtRequestBubbleForDebtor({
            debt,
            creditor: {
              displayName: debt.creditor.displayName,
              avatarUrl: debt.creditor.avatarUrl ?? null,
            },
          }),
        ],
      })
    } catch (err) {
      req.log.warn({ err, debtId: debt.id }, 'debt.web.push.failed')
    }

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
      include: {
        creditor: { select: { id: true, lineUserId: true, displayName: true } },
        debtor: { select: { id: true, lineUserId: true, displayName: true } },
      },
    })

    // Notify the *other* party on LINE so they see what just happened.
    // - Debtor changes status (paid/later/rejected): push to creditor.
    // - Creditor cancels (rejected): push to debtor.
    try {
      const target = isDebtor ? updated.creditor : updated.debtor
      const actor = isDebtor ? updated.debtor : updated.creditor
      const amountBaht = updated.amount / SATANG_PER_BAHT
      const fmt = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' })
      const actionLabel =
        status === 'paid' ? 'ชำระเงิน' : status === 'rejected' ? 'ปฏิเสธ' : 'เลื่อนการชำระ'
      const fallback = `${actor.displayName} ${actionLabel}หนี้ ${fmt.format(amountBaht)} แล้วครับ`
      const aiPrompt = `สร้างข้อความสั้นๆ แจ้ง ${target.displayName} ว่า ${actor.displayName} ${actionLabel}หนี้ ${fmt.format(amountBaht)} แล้ว ใช้ภาษาไทยสุภาพ ไม่เกิน 2 ประโยค`
      const aiText = await askSecretary(target.id, aiPrompt, {
        info: (obj, msg) => req.log.info(obj, msg),
        warn: (obj, msg) => req.log.warn(obj, msg),
      })
      const text = aiText ?? fallback
      await lineClient.pushMessage({
        to: target.lineUserId,
        messages: [{ type: 'text', text }],
      })
    } catch (err) {
      req.log.warn({ err, debtId: debt.id }, 'debt.patch.notify.failed')
    }

    return updated
  })
}
