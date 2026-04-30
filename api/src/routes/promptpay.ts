import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCaller, AuthError, type CallerIdentity } from '@/lib/auth'
import { normalizePromptPayIdentifier, renderPromptPayPng, type PromptPayKind } from '@/lib/promptpay'

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
}
