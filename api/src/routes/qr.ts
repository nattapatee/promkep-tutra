import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { renderPromptPayPng, type PromptPayKind } from '@/lib/promptpay'

const qrQuery = z.object({
  u: z.string().min(1),
  amount: z.coerce.number().int().nonnegative().optional(),
})

export async function qrRoutes(app: FastifyInstance) {
  app.get('/qr.png', async (req, reply) => {
    const parsed = qrQuery.safeParse(req.query)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_query', message: 'expected u (userId) param' })
    }

    const { u: userId, amount: amountSatang } = parsed.data

    const link = await prisma.promptPayLink.findUnique({ where: { userId } })
    if (!link) {
      return reply.status(404).send({ error: 'not_found', message: 'user has no PromptPay link' })
    }

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
}
