import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCaller, AuthError, type CallerIdentity } from '@/lib/auth'

const createCategoryBody = z.object({
  name: z.string().min(1).max(64),
  type: z.enum(['income', 'expense']),
  icon: z.string().max(64).optional(),
  color: z
    .string()
    .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, 'expected hex color')
    .optional(),
})

const updateCategoryBody = z
  .object({
    name: z.string().min(1).max(64).optional(),
    icon: z.string().max(64).nullable().optional(),
    color: z
      .string()
      .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, 'expected hex color')
      .nullable()
      .optional(),
    disabled: z.boolean().optional(),
  })
  .strict()

const idParam = z.object({ id: z.coerce.number().int().positive() })

const listQuery = z.object({
  includeDisabled: z
    .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
    .optional(),
})

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

export async function categoryRoutes(app: FastifyInstance) {
  app.get('/categories', async (req) => {
    const parsed = listQuery.safeParse(req.query)
    const raw = parsed.success ? parsed.data.includeDisabled : undefined
    const includeDisabled = raw === 'true' || raw === '1'

    const categories = await prisma.category.findMany({
      where: includeDisabled ? {} : { disabled: false },
      orderBy: [{ type: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
    })
    return { data: categories }
  })

  app.post('/categories', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return
    if (!requireRegistered(caller, reply)) return

    const parsed = createCategoryBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid_body',
        message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      })
    }

    const existing = await prisma.category.findUnique({ where: { name: parsed.data.name } })
    if (existing) {
      return reply
        .status(409)
        .send({ error: 'duplicate_name', message: 'category already exists' })
    }

    const created = await prisma.category.create({
      data: {
        name: parsed.data.name,
        type: parsed.data.type,
        icon: parsed.data.icon,
        color: parsed.data.color,
        isDefault: false,
      },
    })
    return reply.status(201).send(created)
  })

  app.patch('/categories/:id', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return
    if (caller.role !== 'admin') {
      return reply.status(403).send({ error: 'forbidden', message: 'admin only' })
    }

    const params = idParam.safeParse(req.params)
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_id', message: 'invalid category id' })
    }

    const body = req.body as Record<string, unknown> | null | undefined
    if (body && 'type' in body) {
      return reply.status(400).send({
        error: 'type_immutable',
        message: 'cannot change category type — would break existing transactions',
      })
    }

    const parsed = updateCategoryBody.safeParse(body ?? {})
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid_body',
        message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      })
    }
    const { name, icon, color, disabled } = parsed.data
    if (name === undefined && icon === undefined && color === undefined && disabled === undefined) {
      return reply.status(400).send({ error: 'invalid_body', message: 'no fields to update' })
    }

    const existing = await prisma.category.findUnique({ where: { id: params.data.id } })
    if (!existing) {
      return reply.status(404).send({ error: 'not_found', message: 'category not found' })
    }

    if (name && name !== existing.name) {
      const dup = await prisma.category.findUnique({ where: { name } })
      if (dup) {
        return reply
          .status(409)
          .send({ error: 'duplicate_name', message: 'category name already exists' })
      }
    }

    const updated = await prisma.category.update({
      where: { id: params.data.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(icon !== undefined ? { icon } : {}),
        ...(color !== undefined ? { color } : {}),
        ...(disabled !== undefined ? { disabled } : {}),
      },
    })
    return updated
  })
}
