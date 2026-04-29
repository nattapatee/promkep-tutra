/**
 * Tool registry for ตุ๊ต๊ะ's Gemini function-calling loop.
 *
 * EVERY query is scoped to the caller's userId — the persona must NEVER
 * expose other users' data. The `buildSecretaryToolExecutor` factory binds
 * the caller upfront and returns a closure the Gemini loop can invoke.
 * The model CANNOT pass a userId — it's enforced server-side.
 */
import { prisma } from '@/lib/prisma'
import { fuzzyMatchCategory } from '@/lib/bot/parser'

const SATANG_PER_BAHT = 100
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000
const MS_PER_DAY = 24 * 60 * 60 * 1000
const DEFAULT_LIST_LIMIT = 20
const HARD_LIST_LIMIT = 50
const TOP_CATEGORIES_LIMIT = 10
const FIND_CATEGORY_RESULTS = 3

export interface ToolDeclaration {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export const SECRETARY_TOOL_DECLARATIONS: ToolDeclaration[] = [
  {
    name: 'getMonthlySummary',
    description:
      "Return YOUR-OWN income, expense, net, transaction count and top categories for a given month. Use whenever the user asks about a specific month total or 'this month' / 'last month'.",
    parameters: {
      type: 'object',
      properties: {
        year: { type: 'integer', description: 'Calendar year, e.g. 2026' },
        month: { type: 'integer', description: '1-12 (Asia/Bangkok)' },
      },
      required: ['year', 'month'],
    },
  },
  {
    name: 'listTransactions',
    description:
      "List YOUR-OWN recent transactions with optional filters. Use when the user asks 'what did I spend on…', 'list expenses for X', etc.",
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'ISO datetime, inclusive lower bound' },
        to: { type: 'string', description: 'ISO datetime, exclusive upper bound' },
        type: { type: 'string', enum: ['income', 'expense'] },
        categoryName: { type: 'string', description: 'Fuzzy-matched against existing categories' },
        limit: {
          type: 'integer',
          description: `Max rows, default ${DEFAULT_LIST_LIMIT}, hard cap ${HARD_LIST_LIMIT}`,
        },
      },
    },
  },
  {
    name: 'findCategory',
    description:
      'Fuzzy-search categories by Thai or English query. Returns up to 3 closest matches with id/name/type/disabled. Use to disambiguate before calling other tools.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'getTodayActivity',
    description:
      "Return YOUR-OWN today's transactions (Asia/Bangkok day) with count and totals. Use when the user asks about 'today' / 'วันนี้'.",
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'listMyDebts',
    description:
      "List YOUR debt requests. role='creditor' = others owe you, role='debtor' = you owe others. Status filter: pending|paid|rejected|later, default pending.",
    parameters: {
      type: 'object',
      properties: {
        role: { type: 'string', enum: ['creditor', 'debtor'] },
        status: { type: 'string', enum: ['pending', 'paid', 'rejected', 'later', 'all'] },
      },
      required: ['role'],
    },
  },
  {
    name: 'getDebtSummary',
    description:
      'Return YOUR total counts and amounts of pending/paid/overdue debts (both directions). Use to answer "ตอนนี้ติดอะไรอยู่บ้าง" / "หนี้รวมเท่าไหร่".',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'getMyPromptPay',
    description:
      'Return whether YOU have a PromptPay link bound and (if so) the masked identifier + kind. Use when the user asks how to receive money.',
    parameters: { type: 'object', properties: {} },
  },
]

interface DateRange {
  start: Date
  end: Date
}

function monthBucket(year: number, month: number): DateRange {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  }
}

function bangkokTodayBucket(): DateRange {
  const bkk = new Date(Date.now() + BANGKOK_OFFSET_MS)
  const y = bkk.getUTCFullYear()
  const m = bkk.getUTCMonth()
  const d = bkk.getUTCDate()
  return {
    start: new Date(Date.UTC(y, m, d)),
    end: new Date(Date.UTC(y, m, d + 1)),
  }
}

function toBaht(satang: number): number {
  return Math.round((satang / SATANG_PER_BAHT) * 100) / 100
}

interface ToolArgs {
  year?: number
  month?: number
  from?: string
  to?: string
  type?: 'income' | 'expense'
  categoryName?: string
  limit?: number
  query?: string
  role?: 'creditor' | 'debtor'
  status?: 'pending' | 'paid' | 'rejected' | 'later' | 'all'
}

async function getMonthlySummary(callerUserId: string, args: ToolArgs): Promise<unknown> {
  if (typeof args.year !== 'number' || typeof args.month !== 'number') {
    return { error: 'invalid_args', message: 'year and month are required' }
  }
  const { start, end } = monthBucket(args.year, args.month)
  const grouped = await prisma.transaction.groupBy({
    by: ['categoryId', 'type'],
    where: { createdById: callerUserId, occurredAt: { gte: start, lt: end } },
    _sum: { amount: true },
    _count: { _all: true },
  })

  const categoryIds = [...new Set(grouped.map((g) => g.categoryId))]
  const categories = categoryIds.length
    ? await prisma.category.findMany({ where: { id: { in: categoryIds } } })
    : []
  const catById = new Map(categories.map((c) => [c.id, c]))

  let incomeSatang = 0
  let expenseSatang = 0
  let txCount = 0
  const byCategory = grouped.map((g) => {
    const sumSatang = g._sum.amount ?? 0
    const count = g._count._all
    txCount += count
    if (g.type === 'income') incomeSatang += sumSatang
    else expenseSatang += sumSatang
    return {
      name: catById.get(g.categoryId)?.name ?? 'unknown',
      type: g.type,
      totalBaht: toBaht(sumSatang),
      count,
    }
  })

  return {
    year: args.year,
    month: args.month,
    totalIncomeBaht: toBaht(incomeSatang),
    totalExpenseBaht: toBaht(expenseSatang),
    netBaht: toBaht(incomeSatang - expenseSatang),
    txCount,
    byCategory: byCategory.sort((a, b) => b.totalBaht - a.totalBaht).slice(0, TOP_CATEGORIES_LIMIT),
  }
}

async function listTransactions(callerUserId: string, args: ToolArgs): Promise<unknown> {
  const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIST_LIMIT, 1), HARD_LIST_LIMIT)
  const where: Record<string, unknown> = { createdById: callerUserId }
  const occurredAt: Record<string, Date> = {}
  if (args.from) occurredAt.gte = new Date(args.from)
  if (args.to) occurredAt.lt = new Date(args.to)
  if (Object.keys(occurredAt).length > 0) where.occurredAt = occurredAt
  if (args.type === 'income' || args.type === 'expense') where.type = args.type

  if (args.categoryName) {
    const cats = await prisma.category.findMany()
    const matched = fuzzyMatchCategory(args.categoryName, cats)
    if (!matched) {
      return { matched: 0, transactions: [], note: `no category matched "${args.categoryName}"` }
    }
    where.categoryId = matched.id
  }

  const txns = await prisma.transaction.findMany({
    where,
    include: { category: true },
    orderBy: { occurredAt: 'desc' },
    take: limit,
  })

  return {
    matched: txns.length,
    transactions: txns.map((t) => ({
      id: t.id,
      type: t.type,
      amountBaht: toBaht(t.amount),
      title: t.title,
      categoryName: t.category.name,
      occurredAt: t.occurredAt.toISOString(),
      note: t.note,
    })),
  }
}

async function findCategory(args: ToolArgs): Promise<unknown> {
  if (!args.query) return { error: 'invalid_args', message: 'query required' }
  const cats = await prisma.category.findMany()
  const needle = args.query.normalize('NFC').toLowerCase()
  const scored = cats
    .map((c) => {
      const name = c.name.normalize('NFC').toLowerCase()
      let score = 0
      if (name === needle) score = 100
      else if (name.includes(needle) || needle.includes(name)) score = 50
      return { c, score }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, FIND_CATEGORY_RESULTS)
    .map(({ c }) => ({ id: c.id, name: c.name, type: c.type, disabled: c.disabled }))

  if (scored.length > 0) return { matches: scored }

  const fuzzy = fuzzyMatchCategory(args.query, cats)
  if (fuzzy) {
    return {
      matches: [{ id: fuzzy.id, name: fuzzy.name, type: fuzzy.type, disabled: fuzzy.disabled }],
    }
  }
  return { matches: [] }
}

async function getTodayActivity(callerUserId: string): Promise<unknown> {
  const { start, end } = bangkokTodayBucket()
  const txns = await prisma.transaction.findMany({
    where: { createdById: callerUserId, occurredAt: { gte: start, lt: end } },
    include: { category: true },
    orderBy: { occurredAt: 'desc' },
  })
  let incomeSatang = 0
  let expenseSatang = 0
  for (const t of txns) {
    if (t.type === 'income') incomeSatang += t.amount
    else expenseSatang += t.amount
  }
  return {
    dateBangkok: start.toISOString().slice(0, 10),
    txCount: txns.length,
    totalIncomeBaht: toBaht(incomeSatang),
    totalExpenseBaht: toBaht(expenseSatang),
    netBaht: toBaht(incomeSatang - expenseSatang),
    transactions: txns.map((t) => ({
      id: t.id,
      type: t.type,
      amountBaht: toBaht(t.amount),
      title: t.title,
      categoryName: t.category.name,
      occurredAt: t.occurredAt.toISOString(),
      note: t.note,
    })),
  }
}

async function listMyDebts(callerUserId: string, args: ToolArgs): Promise<unknown> {
  const role = args.role === 'debtor' ? 'debtor' : 'creditor'
  const status = args.status ?? 'pending'
  const where: Record<string, unknown> =
    role === 'creditor' ? { creditorId: callerUserId } : { debtorId: callerUserId }
  if (status !== 'all') where.status = status

  const rows = await prisma.debtRequest.findMany({
    where,
    include: { creditor: true, debtor: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  return {
    role,
    status,
    count: rows.length,
    debts: rows.map((d) => ({
      id: d.id,
      amountBaht: toBaht(d.amount),
      reason: d.reason,
      status: d.status,
      otherParty: role === 'creditor' ? d.debtor.displayName : d.creditor.displayName,
      dueAt: d.dueAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
      resolvedAt: d.resolvedAt?.toISOString() ?? null,
    })),
  }
}

async function getDebtSummary(callerUserId: string): Promise<unknown> {
  const now = new Date()
  const [
    incomingPending,
    outgoingPending,
    incomingPaid,
    outgoingPaid,
    incomingRows,
    outgoingRows,
  ] = await Promise.all([
    prisma.debtRequest.count({ where: { debtorId: callerUserId, status: 'pending' } }),
    prisma.debtRequest.count({ where: { creditorId: callerUserId, status: 'pending' } }),
    prisma.debtRequest.count({ where: { debtorId: callerUserId, status: 'paid' } }),
    prisma.debtRequest.count({ where: { creditorId: callerUserId, status: 'paid' } }),
    prisma.debtRequest.findMany({
      where: { debtorId: callerUserId, status: 'pending' },
      select: { amount: true, dueAt: true },
    }),
    prisma.debtRequest.findMany({
      where: { creditorId: callerUserId, status: 'pending' },
      select: { amount: true, dueAt: true },
    }),
  ])

  let incomingPendingSatang = 0
  let overdueIncoming = 0
  let oldestOverdueDays = 0
  for (const d of incomingRows) {
    incomingPendingSatang += d.amount
    if (!d.dueAt) continue
    const ageMs = now.getTime() - d.dueAt.getTime()
    if (ageMs > 0) {
      overdueIncoming += 1
      const days = Math.floor(ageMs / MS_PER_DAY)
      if (days > oldestOverdueDays) oldestOverdueDays = days
    }
  }
  let outgoingPendingSatang = 0
  for (const d of outgoingRows) outgoingPendingSatang += d.amount

  return {
    youOwe: {
      pendingCount: incomingPending,
      pendingTotalBaht: toBaht(incomingPendingSatang),
      paidCount: incomingPaid,
      overdueCount: overdueIncoming,
      oldestOverdueDays,
    },
    othersOweYou: {
      pendingCount: outgoingPending,
      pendingTotalBaht: toBaht(outgoingPendingSatang),
      paidCount: outgoingPaid,
    },
  }
}

async function getMyPromptPay(callerUserId: string): Promise<unknown> {
  const link = await prisma.promptPayLink.findUnique({ where: { userId: callerUserId } })
  if (!link) return { bound: false }
  const last4 = link.identifier.slice(-4)
  return {
    bound: true,
    kind: link.kind,
    last4,
    displayName: link.displayName ?? null,
  }
}

/**
 * Build a tool executor pre-bound to the caller's userId. The model
 * cannot inject a different userId — the closure only sees its own.
 */
export function buildSecretaryToolExecutor(
  callerUserId: string,
): (name: string, args: unknown) => Promise<unknown> {
  return async (name: string, args: unknown): Promise<unknown> => {
    const safeArgs: ToolArgs = (args && typeof args === 'object' ? args : {}) as ToolArgs
    switch (name) {
      case 'getMonthlySummary':
        return getMonthlySummary(callerUserId, safeArgs)
      case 'listTransactions':
        return listTransactions(callerUserId, safeArgs)
      case 'findCategory':
        return findCategory(safeArgs)
      case 'getTodayActivity':
        return getTodayActivity(callerUserId)
      case 'listMyDebts':
        return listMyDebts(callerUserId, safeArgs)
      case 'getDebtSummary':
        return getDebtSummary(callerUserId)
      case 'getMyPromptPay':
        return getMyPromptPay(callerUserId)
      default:
        return { error: 'unknown_tool', name }
    }
  }
}
