import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCaller, AuthError, type CallerIdentity } from '@/lib/auth'
import { linkUserToRichMenu, readRichMenuIds } from '@/lib/line-richmenu'

// Body is optional — promkep-tutra dropped the team field, registration is just a
// tap-to-confirm. We still accept an optional displayName override.
const registerBody = z
  .object({
    displayName: z.string().min(1).max(64).optional(),
  })
  .strict()

async function authenticate(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<CallerIdentity | null> {
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

export async function registerRoutes(app: FastifyInstance) {
  app.post('/register', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return

    const parsed = registerBody.safeParse(req.body ?? {})
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid_body',
        message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      })
    }
    const { displayName } = parsed.data

    const updated = await prisma.user.update({
      where: { id: caller.userId },
      data: {
        ...(displayName ? { displayName } : {}),
        registeredAt: new Date(),
      },
      select: {
        id: true,
        lineUserId: true,
        displayName: true,
        avatarUrl: true,
        role: true,
        registeredAt: true,
        createdAt: true,
      },
    })

    // Link user to default rich menu (graceful failure)
    try {
      const ids = await readRichMenuIds(app.log)
      await linkUserToRichMenu(caller.lineUserId, ids.defaultRichMenuId, app.log)
    } catch (err) {
      app.log.warn({ err, lineUserId: caller.lineUserId }, 'register.link.failed')
    }

    return {
      ...updated,
      registeredAt: updated.registeredAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      registered: updated.registeredAt !== null,
    }
  })
}
