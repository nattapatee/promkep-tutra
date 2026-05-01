import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCaller, AuthError, type CallerIdentity } from '@/lib/auth'
import { normalizePromptPayIdentifier, parsePromptPayPayload, renderPromptPayPng, type PromptPayKind } from '@/lib/promptpay'

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

const upsertBody = z.object({
  identifier: z.string().min(1),
  kind: z.enum(['phone', 'national_id']),
  displayName: z.string().optional(),
})

export async function promptPayRoutes(app: FastifyInstance) {
  app.get('/me/promptpay', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return

    const link = await prisma.promptPayLink.findUnique({ where: { userId: caller.userId } })
    return link ?? null
  })

  app.post('/me/promptpay', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return

    const parsed = upsertBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', message: parsed.error.message })
    }

    const { identifier, kind, displayName } = parsed.data
    const normalized = normalizePromptPayIdentifier(identifier, kind)
    if (!normalized) {
      return reply.status(422).send({
        error: 'invalid_identifier',
        message: kind === 'phone'
          ? 'phone must be 10 digits starting with 0'
          : 'national_id must be 13 digits',
      })
    }

    const link = await prisma.promptPayLink.upsert({
      where: { userId: caller.userId },
      update: { identifier: normalized.identifier, kind, displayName: displayName ?? null },
      create: {
        userId: caller.userId,
        identifier: normalized.identifier,
        kind,
        displayName: displayName ?? null,
      },
    })
    return link
  })

  app.delete('/me/promptpay', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return

    const existing = await prisma.promptPayLink.findUnique({ where: { userId: caller.userId } })
    if (!existing) {
      return reply.status(404).send({ error: 'not_found', message: 'no promptpay link' })
    }
    await prisma.promptPayLink.delete({ where: { userId: caller.userId } })
    return reply.status(204).send()
  })

  const qrQuery = z.object({
    amountSatang: z.coerce.number().int().nonnegative().optional(),
  })

  app.get('/me/promptpay/qr', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return

    const link = await prisma.promptPayLink.findUnique({ where: { userId: caller.userId } })
    if (!link) {
      return reply.status(404).send({ error: 'not_found', message: 'no promptpay link configured' })
    }

    const parsed = qrQuery.safeParse(req.query)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_query', message: parsed.error.message })
    }

    const { amountSatang } = parsed.data
    const amountBaht =
      typeof amountSatang === 'number' && amountSatang > 0
        ? amountSatang / 100
        : undefined

    const png = await renderPromptPayPng(
      { identifier: link.identifier, kind: link.kind as PromptPayKind },
      { amountBaht },
    )

    reply.header('content-type', 'image/png')
    reply.header('content-length', String(png.byteLength))
    reply.header('cache-control', 'public, max-age=600')
    return reply.send(png)
  })

  const qrBody = z.object({
    amountBaht: z.number().positive().optional(),
  })

  app.post('/me/promptpay/qr', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return

    const link = await prisma.promptPayLink.findUnique({ where: { userId: caller.userId } })
    if (!link) {
      return reply.status(404).send({ error: 'not_found', message: 'no promptpay link configured' })
    }

    const parsed = qrBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', message: parsed.error.message })
    }

    const { amountBaht } = parsed.data

    const png = await renderPromptPayPng(
      { identifier: link.identifier, kind: link.kind as PromptPayKind },
      { amountBaht },
    )

    reply.header('content-type', 'image/png')
    reply.header('content-length', String(png.byteLength))
    reply.header('cache-control', 'public, max-age=600')
    return reply.send(png)
  })

  const publicQrBody = z.object({
    identifier: z.string().min(1),
    kind: z.enum(['phone', 'national_id']),
    amountBaht: z.number().positive().optional(),
  })

  app.post('/promptpay/qr', async (req, reply) => {
    const parsed = publicQrBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', message: parsed.error.message })
    }

    const { identifier, kind, amountBaht } = parsed.data
    const normalized = normalizePromptPayIdentifier(identifier, kind)
    if (!normalized) {
      return reply.status(422).send({
        error: 'invalid_identifier',
        message: kind === 'phone'
          ? 'phone must be 10 digits starting with 0'
          : 'national_id must be 13 digits',
      })
    }

    const png = await renderPromptPayPng(
      normalized,
      { amountBaht },
    )

    reply.header('content-type', 'image/png')
    reply.header('content-length', String(png.byteLength))
    reply.header('cache-control', 'public, max-age=600')
    return reply.send(png)
  })

  const parseBody = z.object({
    payload: z.string().min(1).max(2048),
  })

  app.post('/promptpay/parse', async (req, reply) => {
    const parsed = parseBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', message: parsed.error.message })
    }
    const result = parsePromptPayPayload(parsed.data.payload)
    if (!result) {
      return reply.status(422).send({
        error: 'invalid_payload',
        message: 'PromptPay payload ไม่ถูกต้อง หรือไม่ได้รับการสนับสนุน',
      })
    }
    return {
      identifier: result.identifier,
      kind: result.kind,
      amountBaht: result.amountBaht,
    }
  })

  // ── Payment Request (time-bounded receive + status polling) ───────────────

  const SATANG_PER_BAHT = 100
  const MAX_TTL_MIN = 60
  const MIN_TTL_MIN = 1

  const createRequestBody = z.object({
    amountBaht: z.number().positive().max(2_000_000),
    expiresInMinutes: z.number().int().min(MIN_TTL_MIN).max(MAX_TTL_MIN),
    note: z.string().max(120).optional(),
  })

  function publicView(pr: {
    id: string
    amount: number
    note: string | null
    status: string
    expiresAt: Date
    paidAt: Date | null
    createdAt: Date
  }) {
    const now = new Date()
    const expired = pr.status === 'pending' && pr.expiresAt.getTime() <= now.getTime()
    return {
      id: pr.id,
      amountBaht: pr.amount / SATANG_PER_BAHT,
      note: pr.note,
      status: expired ? 'expired' : pr.status,
      expiresAt: pr.expiresAt.toISOString(),
      paidAt: pr.paidAt?.toISOString() ?? null,
      createdAt: pr.createdAt.toISOString(),
      remainingMs: Math.max(0, pr.expiresAt.getTime() - now.getTime()),
    }
  }

  app.post('/me/promptpay/request', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return

    const parsed = createRequestBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', message: parsed.error.message })
    }
    const link = await prisma.promptPayLink.findUnique({ where: { userId: caller.userId } })
    if (!link) {
      return reply.status(404).send({ error: 'not_found', message: 'no promptpay link configured' })
    }

    const { amountBaht, expiresInMinutes, note } = parsed.data
    const amountSatang = Math.round(amountBaht * SATANG_PER_BAHT)
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000)

    const pr = await prisma.paymentRequest.create({
      data: {
        userId: caller.userId,
        amount: amountSatang,
        expiresAt,
        note: note ?? null,
      },
    })

    return publicView(pr)
  })

  app.get('/me/promptpay/request/:id', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return

    const id = (req.params as { id: string }).id
    const pr = await prisma.paymentRequest.findUnique({ where: { id } })
    if (!pr || pr.userId !== caller.userId) {
      return reply.status(404).send({ error: 'not_found' })
    }

    // Lazy expiry — flip status if pending and past TTL.
    if (pr.status === 'pending' && pr.expiresAt.getTime() <= Date.now()) {
      const updated = await prisma.paymentRequest.update({
        where: { id },
        data: { status: 'expired' },
      })
      return publicView(updated)
    }
    return publicView(pr)
  })

  app.get('/me/promptpay/request/:id/qr', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return

    const id = (req.params as { id: string }).id
    const [pr, link] = await Promise.all([
      prisma.paymentRequest.findUnique({ where: { id } }),
      prisma.promptPayLink.findUnique({ where: { userId: caller.userId } }),
    ])
    if (!pr || pr.userId !== caller.userId) {
      return reply.status(404).send({ error: 'not_found' })
    }
    if (!link) {
      return reply.status(404).send({ error: 'not_found', message: 'no promptpay link configured' })
    }

    const png = await renderPromptPayPng(
      { identifier: link.identifier, kind: link.kind as PromptPayKind },
      { amountBaht: pr.amount / SATANG_PER_BAHT },
    )
    reply.header('content-type', 'image/png')
    reply.header('content-length', String(png.byteLength))
    reply.header('cache-control', 'private, max-age=60')
    return reply.send(png)
  })

  app.post('/me/promptpay/request/:id/confirm', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return

    const id = (req.params as { id: string }).id
    const pr = await prisma.paymentRequest.findUnique({ where: { id } })
    if (!pr || pr.userId !== caller.userId) {
      return reply.status(404).send({ error: 'not_found' })
    }
    if (pr.status !== 'pending') {
      return reply.status(409).send({ error: 'invalid_state', status: pr.status })
    }
    const updated = await prisma.paymentRequest.update({
      where: { id },
      data: { status: 'paid', paidAt: new Date() },
    })
    return publicView(updated)
  })

  app.post('/me/promptpay/request/:id/cancel', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return

    const id = (req.params as { id: string }).id
    const pr = await prisma.paymentRequest.findUnique({ where: { id } })
    if (!pr || pr.userId !== caller.userId) {
      return reply.status(404).send({ error: 'not_found' })
    }
    if (pr.status !== 'pending') {
      return reply.status(409).send({ error: 'invalid_state', status: pr.status })
    }
    const updated = await prisma.paymentRequest.update({
      where: { id },
      data: { status: 'cancelled' },
    })
    return publicView(updated)
  })
}
