import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getCaller, AuthError, type CallerIdentity } from '@/lib/auth'
import { askSecretary } from '@/lib/bot/secretary'

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

const chatBody = z.object({
  message: z.string().min(1).max(1000),
})

export async function chatRoutes(app: FastifyInstance) {
  app.post('/chat', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return

    const parsed = chatBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', message: parsed.error.message })
    }

    const { message } = parsed.data
    const response = await askSecretary(caller.userId, message, {
      info: (obj, msg) => req.log.info(obj, msg),
      warn: (obj, msg) => req.log.warn(obj, msg),
    })

    if (response === null) {
      return reply.status(503).send({
        error: 'service_unavailable',
        message: 'ตุ๊ต๊ะกำลังพักอยู่ ลองใหม่ในอีกสักครู่นะ',
      })
    }

    return { response }
  })
}
