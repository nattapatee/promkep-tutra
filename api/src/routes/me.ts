import type { FastifyInstance } from 'fastify'
import { prisma } from '@/lib/prisma'
import { getCaller, AuthError } from '@/lib/auth'

export async function meRoutes(app: FastifyInstance) {
  app.get('/me', async (req, reply) => {
    let caller
    try {
      caller = await getCaller(req)
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.status(401).send({ error: err.code, message: err.message })
      }
      throw err
    }
    const user = await prisma.user.findUnique({
      where: { id: caller.userId },
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
    if (!user) {
      return reply.status(404).send({ error: 'not_found', message: 'user not found' })
    }
    return {
      ...user,
      registeredAt: user.registeredAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      registered: user.registeredAt !== null,
    }
  })
}
