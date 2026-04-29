import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCaller, AuthError, type CallerIdentity } from '@/lib/auth'
import { fileStore } from '@/lib/file-store'

const MAX_ATTACHMENTS_PER_TXN = 5
const MAX_FILE_BYTES = 10 * 1024 * 1024

const txnIdParam = z.object({ id: z.string().min(1) })
const attIdParam = z.object({ id: z.string().min(1) })

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

export async function attachmentRoutes(app: FastifyInstance) {
  app.post('/transactions/:id/attachments', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return
    if (!requireRegistered(caller, reply)) return
    const params = txnIdParam.safeParse(req.params)
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_id', message: 'missing transaction id' })
    }

    const txn = await prisma.transaction.findUnique({
      where: { id: params.data.id },
      include: { _count: { select: { attachments: true } } },
    })
    if (!txn) {
      return reply.status(404).send({ error: 'not_found', message: 'transaction not found' })
    }
    if (txn.createdById !== caller.userId && caller.role !== 'admin') {
      return reply.status(403).send({ error: 'forbidden', message: 'not your transaction' })
    }
    if (txn._count.attachments >= MAX_ATTACHMENTS_PER_TXN) {
      return reply.status(409).send({
        error: 'too_many_attachments',
        message: `max ${MAX_ATTACHMENTS_PER_TXN} attachments per transaction`,
      })
    }

    const part = await req.file({ limits: { fileSize: MAX_FILE_BYTES } }).catch(() => null)
    if (!part) {
      return reply.status(400).send({ error: 'no_file', message: 'expected multipart file field' })
    }
    if (!part.mimetype || !part.mimetype.toLowerCase().startsWith('image/')) {
      return reply.status(415).send({ error: 'unsupported_media', message: 'only image/* allowed' })
    }

    const buffer = await part.toBuffer().catch(() => null)
    if (!buffer) {
      return reply.status(400).send({ error: 'read_failed', message: 'could not read upload' })
    }
    if (buffer.byteLength > MAX_FILE_BYTES) {
      return reply.status(413).send({ error: 'too_large', message: 'file exceeds 10 MB' })
    }

    const saved = await fileStore.save({
      buffer,
      originalFilename: part.filename ?? 'upload',
      mimeType: part.mimetype,
    })

    const attachment = await prisma.attachment.create({
      data: {
        transactionId: txn.id,
        filename: part.filename ?? 'upload',
        filepath: saved.filepath,
        mimeType: part.mimetype,
        sizeBytes: saved.sizeBytes,
      },
    })
    return reply.status(201).send(attachment)
  })

  app.get('/attachments/:id/file', async (req, reply) => {
    // Public — cuid id is unguessable, image loaded via <img src> can't send headers.
    const params = attIdParam.safeParse(req.params)
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_id', message: 'missing id' })
    }
    const att = await prisma.attachment.findUnique({ where: { id: params.data.id } })
    if (!att) {
      return reply.status(404).send({ error: 'not_found', message: 'attachment not found' })
    }
    reply.header('content-type', att.mimeType)
    reply.header('content-length', String(att.sizeBytes))
    reply.header('cache-control', 'private, max-age=3600')
    return reply.send(fileStore.openReadStream(att.filepath))
  })

  app.delete('/attachments/:id', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return
    if (!requireRegistered(caller, reply)) return
    const params = attIdParam.safeParse(req.params)
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_id', message: 'missing id' })
    }
    const att = await prisma.attachment.findUnique({
      where: { id: params.data.id },
      include: { transaction: { select: { createdById: true } } },
    })
    if (!att) {
      return reply.status(404).send({ error: 'not_found', message: 'attachment not found' })
    }
    if (att.transaction.createdById !== caller.userId && caller.role !== 'admin') {
      return reply.status(403).send({ error: 'forbidden', message: 'not your attachment' })
    }
    await prisma.attachment.delete({ where: { id: att.id } })
    await fileStore.delete(att.filepath).catch(() => undefined)
    return reply.status(204).send()
  })
}
