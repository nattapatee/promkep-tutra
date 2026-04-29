import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCaller, AuthError, type CallerIdentity } from '@/lib/auth'

const SATANG_PER_BAHT = 100

const monthlyQuery = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
})

const rangeQuery = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
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

function csvEscape(value: string | null | undefined): string {
  if (value == null) return ''
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export async function reportRoutes(app: FastifyInstance) {
  app.get('/reports/monthly', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return
    const parsed = monthlyQuery.safeParse(req.query)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_query', message: 'expected year & month' })
    }
    const { year, month } = parsed.data
    const monthStart = new Date(Date.UTC(year, month - 1, 1))
    const monthEnd = new Date(Date.UTC(year, month, 1))

    const grouped = await prisma.transaction.groupBy({
      by: ['categoryId', 'type'],
      where: {
        occurredAt: { gte: monthStart, lt: monthEnd },
        createdById: caller.userId,
      },
      _sum: { amount: true },
      _count: { _all: true },
    })

    const categoryIds = [...new Set(grouped.map((g) => g.categoryId))]
    const categories = categoryIds.length
      ? await prisma.category.findMany({ where: { id: { in: categoryIds } } })
      : []
    const catById = new Map(categories.map((c) => [c.id, c]))

    let totalIncomeSatang = 0
    let totalExpenseSatang = 0
    const byCategory = grouped.map((g) => {
      const cat = catById.get(g.categoryId)
      const sumSatang = g._sum.amount ?? 0
      if (g.type === 'income') totalIncomeSatang += sumSatang
      else totalExpenseSatang += sumSatang
      return {
        categoryId: g.categoryId,
        name: cat?.name ?? 'unknown',
        type: g.type,
        totalBaht: sumSatang / SATANG_PER_BAHT,
        count: g._count._all,
      }
    })

    return {
      year,
      month,
      totalIncomeBaht: totalIncomeSatang / SATANG_PER_BAHT,
      totalExpenseBaht: totalExpenseSatang / SATANG_PER_BAHT,
      netBaht: (totalIncomeSatang - totalExpenseSatang) / SATANG_PER_BAHT,
      byCategory: byCategory.sort((a, b) => b.totalBaht - a.totalBaht),
    }
  })

  app.get('/reports/export.csv', async (req, reply) => {
    const caller = await authenticate(req, reply)
    if (!caller) return
    const parsed = rangeQuery.safeParse(req.query)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_query', message: 'expected from & to (ISO 8601)' })
    }
    const from = new Date(parsed.data.from)
    const to = new Date(parsed.data.to)

    const txns = await prisma.transaction.findMany({
      where: {
        occurredAt: { gte: from, lte: to },
        createdById: caller.userId,
      },
      include: { category: true, createdBy: true },
      orderBy: { occurredAt: 'asc' },
    })

    const header = 'date_iso,type,category,title,amount_baht,note'
    const rows = txns.map((t) =>
      [
        t.occurredAt.toISOString(),
        t.type,
        csvEscape(t.category.name),
        csvEscape(t.title),
        (t.amount / SATANG_PER_BAHT).toFixed(2),
        csvEscape(t.note),
      ].join(','),
    )

    const body = '﻿' + [header, ...rows].join('\n') + '\n'
    reply.header('content-type', 'text/csv; charset=utf-8')
    reply.header(
      'content-disposition',
      `attachment; filename="promkep-${parsed.data.from.slice(0, 10)}_${parsed.data.to.slice(0, 10)}.csv"`,
    )
    return reply.send(body)
  })
}
