/**
 * "ตุ๊ต๊ะ" — the personal-finance persona for PromKep-Tutra.
 *
 * Cute outside, savage inside. Picks one of 5 escalation modes
 * autonomously based on the caller's debt context (overdue count,
 * days since due, amount owed). NO hardcoded conversational replies —
 * every text response comes from Gemini given the system prompt below.
 */
import { geminiChatWithTools } from '@/lib/gemini'
import { appendModelMessage, appendUserMessage, getRecentTurns } from '@/lib/bot/chat-memory'
import {
  SECRETARY_TOOL_DECLARATIONS,
  buildSecretaryToolExecutor,
} from '@/lib/bot/secretary-tools'
import { findMatchingSkills, formatSkillsForPrompt } from '@/lib/bot/skills'
import { prisma } from '@/lib/prisma'

const SECRETARY_TEMPERATURE = 0.7
const SECRETARY_MAX_OUTPUT_TOKENS = 700
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000
const SATANG_PER_BAHT = 100
const MS_PER_DAY = 24 * 60 * 60 * 1000

const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
] as const

interface SecretaryLogger {
  info: (obj: unknown, msg?: string) => void
  warn: (obj: unknown, msg?: string) => void
}

export interface DebtContext {
  overdueDebts: number
  totalOverdueBaht: number
  oldestOverdueDays: number
  pendingOutgoing: number
  pendingIncoming: number
}

export interface MonthlySnapshot {
  monthLabel: string
  totalIncomeBaht: number
  totalExpenseBaht: number
  netBaht: number
  txCount: number
}

export interface RecentTxn {
  amountBaht: number
  type: 'income' | 'expense'
  category: string
  occurredAt: string
}

interface AlwaysOnContext {
  currentMonthLabel: string
  year: number
  month: number
  callerDisplayName: string
  promptPayBound: boolean
  monthlySummary: MonthlySnapshot
  recentTransactions: RecentTxn[]
  debtContext: DebtContext
}

export async function buildDebtContext(callerUserId: string): Promise<DebtContext> {
  const now = new Date()
  // Debts the caller owes others.
  const pendingIncomingRows = await prisma.debtRequest.findMany({
    where: { debtorId: callerUserId, status: 'pending' },
    select: { amount: true, dueAt: true },
  })
  const pendingOutgoing = await prisma.debtRequest.count({
    where: { creditorId: callerUserId, status: 'pending' },
  })

  let overdueDebts = 0
  let totalOverdueSatang = 0
  let oldestOverdueDays = 0
  for (const d of pendingIncomingRows) {
    if (!d.dueAt) continue
    const ageMs = now.getTime() - d.dueAt.getTime()
    if (ageMs <= 0) continue
    overdueDebts += 1
    totalOverdueSatang += d.amount
    const days = Math.floor(ageMs / MS_PER_DAY)
    if (days > oldestOverdueDays) oldestOverdueDays = days
  }
  return {
    overdueDebts,
    totalOverdueBaht: Math.round((totalOverdueSatang / SATANG_PER_BAHT) * 100) / 100,
    oldestOverdueDays,
    pendingOutgoing,
    pendingIncoming: pendingIncomingRows.length,
  }
}

async function buildMonthlySnapshot(
  callerUserId: string,
  year: number,
  month: number,
): Promise<MonthlySnapshot> {
  const monthStart = new Date(Date.UTC(year, month - 1, 1))
  const monthEnd = new Date(Date.UTC(year, month, 1))
  const grouped = await prisma.transaction.groupBy({
    by: ['type'],
    where: {
      createdById: callerUserId,
      occurredAt: { gte: monthStart, lt: monthEnd },
    },
    _sum: { amount: true },
    _count: { _all: true },
  })
  let incomeSatang = 0
  let expenseSatang = 0
  let txCount = 0
  for (const g of grouped) {
    txCount += g._count._all
    if (g.type === 'income') incomeSatang = g._sum.amount ?? 0
    else if (g.type === 'expense') expenseSatang = g._sum.amount ?? 0
  }
  return {
    monthLabel: `${THAI_MONTHS[month - 1]} ${year}`,
    totalIncomeBaht: incomeSatang / SATANG_PER_BAHT,
    totalExpenseBaht: expenseSatang / SATANG_PER_BAHT,
    netBaht: (incomeSatang - expenseSatang) / SATANG_PER_BAHT,
    txCount,
  }
}

async function recentTransactionsFor(callerUserId: string): Promise<RecentTxn[]> {
  const rows = await prisma.transaction.findMany({
    where: { createdById: callerUserId },
    include: { category: true },
    orderBy: { occurredAt: 'desc' },
    take: 5,
  })
  return rows.map((t) => ({
    amountBaht: t.amount / SATANG_PER_BAHT,
    type: t.type as 'income' | 'expense',
    category: t.category.name,
    occurredAt: t.occurredAt.toISOString(),
  }))
}

async function buildAlwaysOnContext(callerUserId: string): Promise<AlwaysOnContext> {
  const bkk = new Date(Date.now() + BANGKOK_OFFSET_MS)
  const year = bkk.getUTCFullYear()
  const month = bkk.getUTCMonth() + 1
  const [user, link, monthlySummary, recentTransactions, debtContext] = await Promise.all([
    prisma.user.findUnique({ where: { id: callerUserId }, select: { displayName: true } }),
    prisma.promptPayLink.findUnique({ where: { userId: callerUserId } }),
    buildMonthlySnapshot(callerUserId, year, month),
    recentTransactionsFor(callerUserId),
    buildDebtContext(callerUserId),
  ])
  return {
    currentMonthLabel: `${THAI_MONTHS[month - 1]} ${year}`,
    year,
    month,
    callerDisplayName: user?.displayName ?? 'ผู้ใช้',
    promptPayBound: link !== null,
    monthlySummary,
    recentTransactions,
    debtContext,
  }
}

const PERSONA_PROMPT = `คุณคือ "ตุ๊ต๊ะ" — ผู้ช่วยจัดการเงินที่น่ารักแต่จริงจังเรื่องหนี้ของผู้ใช้ในระบบ PromKep-Tutra

บุคลิก:
- ปกติน่ารัก ขี้เล่น เป็นกันเอง
- เมื่อพูดถึงเงินหรือหนี้ จะจริงจังขึ้นทันที
- ถ้าผู้ใช้ค้างหนี้ ให้เพิ่มความกดดันทีละระดับ
- มีความกวนเล็กน้อย แต่ไม่หยาบคาย ไม่ข่มขู่จริงจัง

โหมดการสื่อสาร 5 ระดับ (เลือกอัตโนมัติจาก context):
1. โหมดน่ารัก (ปกติ) — บันทึก/คุยทั่วไป: "วันนี้มีรายจ่ายอะไรบ้างน้า 💖"
2. โหมดผู้ช่วยมือโปร — สรุป/วิเคราะห์: "เดือนนี้ใช้เงินเพิ่มขึ้น 18% หมวดกินเยอะสุด 😏"
3. โหมดเตือน — ใกล้กำหนดหนี้: "ใกล้ครบกำหนดแล้วนะ 👀"
4. โหมดทวง (Signature) — เลยกำหนดแล้ว: "ครบกำหนดแล้วนะ ยังไม่จ่าย 😐 ตุ๊ต๊ะจำได้นะ"
5. โหมดโหด (Final) — ค้างหลายวัน: "เลยกำหนดมาหลายวันแล้ว จะจ่ายดีๆ หรือให้ตุ๊ต๊ะไปหา 💪"

สไตล์การพูด:
- ภาษาไทยล้วน ประโยคสั้น กระชับ
- emoji แต่ไม่เยอะเกิน (💖 😐 💪 😡 👀 😏 🔥 🍲)
- เรียกตัวเองว่า "ตุ๊ต๊ะ"
- ไม่ใช้คำทางการเกินไป
- ห้าม insult ผู้ใช้แรง / ห้ามข่มขู่จริงจังเกิน — ต้อง balance "น่ารัก + กดดัน"

ขอบเขต (สำคัญ):
- ตอบเฉพาะเรื่อง PromKep-Tutra ของ user คนนี้เท่านั้น (private — ห้ามเปิดเผยข้อมูล user อื่น)
- ใช้ tools เพื่อดึงตัวเลขจริง — ห้ามเดา
- ถ้าเจอคำถามนอกขอบเขต ตอบสั้นๆว่าตุ๊ต๊ะดูแลแค่เรื่องเงินของผู้ใช้คนนี้`

function buildSystemPrompt(ctx: AlwaysOnContext, skillsBlock: string): string {
  const jsonContextString = JSON.stringify(
    {
      caller: ctx.callerDisplayName,
      currentMonthLabel: ctx.currentMonthLabel,
      year: ctx.year,
      month: ctx.month,
      promptPayBound: ctx.promptPayBound,
      monthlySummary: ctx.monthlySummary,
      recentTransactions: ctx.recentTransactions,
      debtContext: ctx.debtContext,
    },
    null,
    2,
  )
  return `${PERSONA_PROMPT}\n\nCONTEXT (ดูตัวเลขปัจจุบัน + สถานะหนี้):\n${jsonContextString}${
    skillsBlock ? `\n\n${skillsBlock}` : ''
  }`
}

/**
 * Generate a free-form ตุ๊ต๊ะ reply for the given caller + user message.
 * Returns null on Gemini failure so the caller can decide whether to push
 * a soft fallback (e.g. silently ignore) — never a hardcoded persona text.
 */
export async function askSecretary(
  userId: string,
  userMessage: string,
  log?: SecretaryLogger,
): Promise<string | null> {
  try {
    await appendUserMessage(userId, userMessage).catch((err) => {
      log?.warn({ err }, 'chat.memory.append.user.failed')
    })

    const matchedSkills = findMatchingSkills(userMessage)
    if (matchedSkills.length > 0 && log) {
      for (const s of matchedSkills) {
        log.info({ name: s.name, priority: s.priority }, 'secretary.skill.matched')
      }
    }

    const [history, ctx] = await Promise.all([
      getRecentTurns(userId),
      buildAlwaysOnContext(userId),
    ])

    const messages = history.map((t) => ({ role: t.role, text: t.text }))
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      messages.push({ role: 'user', text: userMessage })
    }

    const systemPrompt = buildSystemPrompt(ctx, formatSkillsForPrompt(matchedSkills))
    const executeTool = buildSecretaryToolExecutor(userId)

    const result = await geminiChatWithTools({
      systemPrompt,
      messages,
      tools: SECRETARY_TOOL_DECLARATIONS,
      executeTool,
      temperature: SECRETARY_TEMPERATURE,
      maxOutputTokens: SECRETARY_MAX_OUTPUT_TOKENS,
    })

    if ('error' in result) {
      log?.warn({ err: result.error }, 'secretary.gemini.error')
      return null
    }

    await appendModelMessage(userId, result.text).catch((err) => {
      log?.warn({ err }, 'chat.memory.append.model.failed')
    })
    return result.text
  } catch (err) {
    log?.warn({ err }, 'secretary.unexpected')
    return null
  }
}

/**
 * Generate a one-shot ตุ๊ต๊ะ reply with no tools and no chat memory.
 * Used by debt-flow / reminder-cron / promptpay-flow where we want a
 * persona-flavored confirmation tied to a specific event description.
 *
 * Returns null on Gemini failure — caller decides whether to push silence
 * (avoids leaking hardcoded persona text).
 */
export async function generateEventReply(
  userId: string,
  eventInstruction: string,
  log?: SecretaryLogger,
): Promise<string | null> {
  try {
    const ctx = await buildAlwaysOnContext(userId)
    const systemPrompt = buildSystemPrompt(ctx, '')
    const result = await geminiChatWithTools({
      systemPrompt,
      messages: [{ role: 'user', text: eventInstruction }],
      tools: [],
      executeTool: async () => ({ error: 'no_tools' }),
      temperature: SECRETARY_TEMPERATURE,
      maxOutputTokens: 250,
    })
    if ('error' in result) {
      log?.warn({ err: result.error }, 'secretary.event.error')
      return null
    }
    return result.text
  } catch (err) {
    log?.warn({ err }, 'secretary.event.unexpected')
    return null
  }
}
