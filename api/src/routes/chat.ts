import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getCaller, AuthError, type CallerIdentity } from '@/lib/auth'
import { askSecretary, getLastSecretaryError } from '@/lib/bot/secretary'
import { prisma } from '@/lib/prisma'
import { geminiChat } from '@/lib/gemini'

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
      const reason = getLastSecretaryError() ?? 'unknown'
      return reply.status(503).send({
        error: 'service_unavailable',
        reason,
        message: 'ตุ๊ต๊ะกำลังพักอยู่ ลองใหม่ในอีกสักครู่นะ',
      })
    }

    return { response }
  })

  app.get('/chat/health', async (_req, reply) => {
    const result: Record<string, unknown> = { now: new Date().toISOString() }

    const apiKey = (process.env.GEMINI_API_KEY ?? '').trim()
    result.gemini_api_key_set = apiKey.length > 0
    result.gemini_model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash'

    try {
      const chatCount = await prisma.chatMessage.count()
      result.db_chat_messages_count = chatCount
      result.db_ok = true
    } catch (err) {
      result.db_ok = false
      result.db_error = err instanceof Error ? err.message : String(err)
    }

    if (apiKey) {
      const probe = await geminiChat({
        systemPrompt: 'Reply with exactly the word OK.',
        userMessage: 'ping',
        maxOutputTokens: 16,
        temperature: 0,
      })
      if ('error' in probe) {
        result.gemini_ok = false
        result.gemini_error = probe.error
      } else {
        result.gemini_ok = true
        result.gemini_text = probe.text.slice(0, 64)
      }
    } else {
      result.gemini_ok = false
      result.gemini_error = 'no_key'
    }

    result.last_secretary_error = getLastSecretaryError()

    const ok = result.db_ok === true && result.gemini_ok === true
    return reply.status(ok ? 200 : 503).send(result)
  })
}
