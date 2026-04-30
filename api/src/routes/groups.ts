import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCaller, AuthError, type CallerIdentity } from '@/lib/auth'

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

async function generateUniqueGroupCode(): Promise<string> {
  const MAX_RETRIES = 10
  for (let i = 0; i < MAX_RETRIES; i++) {
    const code = String(Math.floor(100000 + Math.random() * 900000))
    const existing = await prisma.group.findUnique({ where: { code } })
    if (!existing) {
      return code
    }
  }
  throw new Error('Failed to generate unique group code after max retries')
}

const createBody = z.object({
  name: z.string().min(1).max(200),
})

const joinBody = z.object({
  code: z.string().length(6).regex(/^\d{6}$/, 'code must be 6 digits'),
})

const idParam = z.object({ id: z.string().min(1) })

export async function groupsRoutes(app: FastifyInstance) {
  app.post('/groups', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return

    const parsed = createBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', message: parsed.error.message })
    }

    const { name } = parsed.data
    const code = await generateUniqueGroupCode()

    const group = await prisma.group.create({
      data: {
        name,
        code,
        createdById: caller.userId,
        members: {
          create: {
            userId: caller.userId,
            role: 'admin',
          },
        },
      },
      select: {
        id: true,
        name: true,
        code: true,
        createdAt: true,
      },
    })

    return reply.status(201).send(group)
  })

  app.get('/groups', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return

    const memberships = await prisma.groupMember.findMany({
      where: { userId: caller.userId },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            code: true,
            createdAt: true,
            _count: {
              select: { members: true },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    })

    const groups = memberships.map((m) => ({
      id: m.group.id,
      name: m.group.name,
      code: m.group.code,
      role: m.role,
      memberCount: m.group._count.members,
      createdAt: m.group.createdAt.toISOString(),
    }))

    return { groups }
  })

  app.post('/groups/join', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return

    const parsed = joinBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', message: parsed.error.message })
    }

    const { code } = parsed.data

    const group = await prisma.group.findUnique({ where: { code } })
    if (!group) {
      return reply.status(404).send({ error: 'group_not_found', message: 'group with this code does not exist' })
    }

    const existingMembership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: caller.userId } },
    })
    if (existingMembership) {
      return reply.status(409).send({ error: 'already_member', message: 'you are already a member of this group' })
    }

    const membership = await prisma.groupMember.create({
      data: {
        groupId: group.id,
        userId: caller.userId,
        role: 'member',
      },
      select: {
        id: true,
        group: { select: { id: true, name: true } },
        joinedAt: true,
      },
    })

    return {
      id: membership.group.id,
      name: membership.group.name,
      joinedAt: membership.joinedAt.toISOString(),
    }
  })

  app.get('/groups/:id', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return

    const params = idParam.safeParse(req.params)
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_id', message: 'missing id' })
    }

    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: params.data.id, userId: caller.userId } },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            code: true,
            createdAt: true,
            _count: {
              select: { members: true },
            },
          },
        },
      },
    })

    if (!membership) {
      return reply.status(404).send({ error: 'not_found', message: 'group not found or you are not a member' })
    }

    return {
      id: membership.group.id,
      name: membership.group.name,
      code: membership.group.code,
      createdAt: membership.group.createdAt.toISOString(),
      memberCount: membership.group._count.members,
      isAdmin: membership.role === 'admin',
    }
  })

  app.get('/groups/:id/members', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return

    const params = idParam.safeParse(req.params)
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_id', message: 'missing id' })
    }

    const callerMembership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: params.data.id, userId: caller.userId } },
    })
    if (!callerMembership) {
      return reply.status(404).send({ error: 'not_found', message: 'group not found or you are not a member' })
    }

    const members = await prisma.groupMember.findMany({
      where: { groupId: params.data.id },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    })

    return {
      members: members.map((m) => ({
        id: m.id,
        userId: m.user.id,
        displayName: m.user.displayName,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
      })),
    }
  })

  app.delete('/groups/:id/leave', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return

    const params = idParam.safeParse(req.params)
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_id', message: 'missing id' })
    }

    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: params.data.id, userId: caller.userId } },
    })
    if (!membership) {
      return reply.status(404).send({ error: 'not_found', message: 'group not found or you are not a member' })
    }

    if (membership.role === 'admin') {
      const adminCount = await prisma.groupMember.count({
        where: { groupId: params.data.id, role: 'admin' },
      })
      if (adminCount <= 1) {
        return reply.status(403).send({
          error: 'forbidden',
          message: 'you are the only admin — transfer ownership or delete the group instead',
        })
      }
    }

    await prisma.groupMember.delete({
      where: { id: membership.id },
    })

    return { success: true }
  })

  app.delete('/groups/:id', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return

    const params = idParam.safeParse(req.params)
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_id', message: 'missing id' })
    }

    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: params.data.id, userId: caller.userId } },
    })
    if (!membership) {
      return reply.status(404).send({ error: 'not_found', message: 'group not found or you are not a member' })
    }

    if (membership.role !== 'admin') {
      return reply.status(403).send({ error: 'forbidden', message: 'only admins can delete the group' })
    }

    await prisma.group.delete({
      where: { id: params.data.id },
    })

    return { success: true }
  })
}
