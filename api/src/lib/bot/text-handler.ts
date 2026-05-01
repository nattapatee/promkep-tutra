import type { messagingApi, webhook } from '@line/bot-sdk'
import { prisma } from '@/lib/prisma'
import { lineClient } from '@/lib/line'
import {
  parseTransactionText,
  fuzzyMatchCategory,
  isAmountValid,
  PARSER_LIMITS,
} from '@/lib/bot/parser'
import {
  buildConfirmationBubble,
  buildLastCarousel,
  buildMonthReportBubble,
  buildMonthSummaryBubble,
  buildUndoConfirmationBubble,
} from '@/lib/bot/flex'
import { askSecretary, getLastSecretaryError } from '@/lib/bot/secretary'
import { clearForUser as clearChatMemory } from '@/lib/bot/chat-memory'
import { linkUserToRichMenu, readRichMenuIds } from '@/lib/line-richmenu'
import { handleDebtCreate, handleDebtAction, handleDebtPayQr } from '@/lib/bot/debt-flow'
import { handlePromptPayRequest } from '@/lib/bot/promptpay-flow'

const SECRETARY_MAX_INPUT_LEN = 500

type TextMessageEvent = webhook.MessageEvent & { message: webhook.TextMessageContent }

interface BotLogger {
  info: (obj: unknown, msg?: string) => void
  warn: (obj: unknown, msg?: string) => void
  error: (obj: unknown, msg?: string) => void
}

const SATANG_PER_BAHT = 100
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000
const FALLBACK_WEB_BASE = 'https://line.me'

function bahtToSatang(amountBaht: number): number {
  return Math.round(amountBaht * SATANG_PER_BAHT)
}

function getWebBaseUrl(): string {
  const raw = (process.env.WEB_BASE_URL ?? '').trim()
  return raw || FALLBACK_WEB_BASE
}

interface CurrentMonthBucket {
  year: number
  month: number
  monthStart: Date
  monthEnd: Date
  monthLabel: string
}

function currentMonthBucket(): CurrentMonthBucket {
  const bkk = new Date(Date.now() + BANGKOK_OFFSET_MS)
  const year = bkk.getUTCFullYear()
  const month = bkk.getUTCMonth() + 1
  const monthStart = new Date(Date.UTC(year, month - 1, 1))
  const monthEnd = new Date(Date.UTC(year, month, 1))
  const monthLabel = `${String(month).padStart(2, '0')}/${year}`
  return { year, month, monthStart, monthEnd, monthLabel }
}

interface MonthAggregate {
  totalIncomeBaht: number
  totalExpenseBaht: number
  netBaht: number
  txCount: number
  byCategory: Array<{
    name: string
    type: 'income' | 'expense'
    totalBaht: number
    count: number
    color: string | null
  }>
}

async function aggregateMonth(
  userId: string,
  monthStart: Date,
  monthEnd: Date,
): Promise<MonthAggregate> {
  const grouped = await prisma.transaction.groupBy({
    by: ['categoryId', 'type'],
    where: { occurredAt: { gte: monthStart, lt: monthEnd }, createdById: userId },
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
  let txCount = 0
  const byCategory = grouped.map((g) => {
    const cat = catById.get(g.categoryId)
    const sumSatang = g._sum.amount ?? 0
    const count = g._count._all
    txCount += count
    if (g.type === 'income') totalIncomeSatang += sumSatang
    else totalExpenseSatang += sumSatang
    return {
      name: cat?.name ?? 'unknown',
      type: g.type as 'income' | 'expense',
      totalBaht: sumSatang / SATANG_PER_BAHT,
      count,
      color: cat?.color ?? null,
    }
  })

  return {
    totalIncomeBaht: totalIncomeSatang / SATANG_PER_BAHT,
    totalExpenseBaht: totalExpenseSatang / SATANG_PER_BAHT,
    netBaht: (totalIncomeSatang - totalExpenseSatang) / SATANG_PER_BAHT,
    txCount,
    byCategory: byCategory.sort((a, b) => b.totalBaht - a.totalBaht),
  }
}

function adminIdSet(): Set<string> {
  return new Set(
    (process.env.ADMIN_LINE_USER_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
}

async function fetchDisplayName(lineUserId: string, log: BotLogger): Promise<string> {
  try {
    const profile = await lineClient.getProfile(lineUserId)
    return profile.displayName || lineUserId
  } catch (err) {
    log.warn({ err, lineUserId }, 'line.getProfile.failed')
    return lineUserId
  }
}

async function upsertUser(lineUserId: string, log: BotLogger) {
  const isAdmin = adminIdSet().has(lineUserId)
  const existing = await prisma.user.findUnique({ where: { lineUserId } })
  if (existing) {
    if (isAdmin && existing.role !== 'admin') {
      return prisma.user.update({ where: { lineUserId }, data: { role: 'admin' } })
    }
    return existing
  }
  const displayName = await fetchDisplayName(lineUserId, log)
  const created = await prisma.user.create({
    data: { lineUserId, displayName, role: isAdmin ? 'admin' : 'member' },
  })
  try {
    const ids = await readRichMenuIds(log)
    await linkUserToRichMenu(lineUserId, ids.pendingRichMenuId, log)
  } catch (err) {
    log.warn({ err, lineUserId }, 'upsertUser.link.failed')
  }
  return created
}

async function safeReply(
  replyToken: string,
  messages: messagingApi.Message[],
  log: BotLogger,
): Promise<void> {
  try {
    await lineClient.replyMessage({ replyToken, messages })
  } catch (err) {
    log.warn({ err }, 'line.replyMessage.failed')
  }
}

async function safePush(
  to: string,
  messages: messagingApi.Message[],
  log: BotLogger,
): Promise<void> {
  try {
    await lineClient.pushMessage({ to, messages })
  } catch (err) {
    log.warn({ err }, 'line.pushMessage.failed')
  }
}

function textReply(text: string): messagingApi.TextMessage {
  return { type: 'text', text }
}

async function handleSlashLast(
  event: TextMessageEvent,
  userId: string,
  log: BotLogger,
): Promise<void> {
  const txns = await prisma.transaction.findMany({
    where: { createdById: userId },
    include: { category: true },
    orderBy: { occurredAt: 'desc' },
    take: 5,
  })
  if (txns.length === 0) {
    await safeReply(event.replyToken!, [textReply('ยังไม่มีรายการที่บันทึกไว้ครับ')], log)
    return
  }
  await safeReply(event.replyToken!, [buildLastCarousel(txns)], log)
}

async function handleSlashUndo(
  event: TextMessageEvent,
  userId: string,
  log: BotLogger,
): Promise<void> {
  const last = await prisma.transaction.findFirst({
    where: { createdById: userId },
    include: { category: true },
    orderBy: { createdAt: 'desc' },
  })
  if (!last) {
    await safeReply(event.replyToken!, [textReply('ไม่มีรายการล่าสุดให้ยกเลิกครับ')], log)
    return
  }
  await prisma.transaction.delete({ where: { id: last.id } })
  await safeReply(event.replyToken!, [buildUndoConfirmationBubble(last)], log)
}

async function handleMonthSummary(
  event: TextMessageEvent,
  userId: string,
  lineUserId: string,
  log: BotLogger,
): Promise<void> {
  const bucket = currentMonthBucket()
  const agg = await aggregateMonth(userId, bucket.monthStart, bucket.monthEnd)
  log.info({ monthLabel: bucket.monthLabel, txCount: agg.txCount, netBaht: agg.netBaht }, 'bot.month.summary')
  if (agg.txCount === 0) {
    await safePush(lineUserId, [textReply(`เดือน ${bucket.monthLabel} ยังไม่มีรายการครับ`)], log)
    return
  }
  await safePush(
    lineUserId,
    [
      buildMonthSummaryBubble({
        monthLabel: bucket.monthLabel,
        totalIncomeBaht: agg.totalIncomeBaht,
        totalExpenseBaht: agg.totalExpenseBaht,
        netBaht: agg.netBaht,
        txCount: agg.txCount,
      }),
    ],
    log,
  )
}

async function handleMonthReport(
  event: TextMessageEvent,
  userId: string,
  lineUserId: string,
  log: BotLogger,
): Promise<void> {
  const bucket = currentMonthBucket()
  const agg = await aggregateMonth(userId, bucket.monthStart, bucket.monthEnd)
  log.info({ monthLabel: bucket.monthLabel, txCount: agg.txCount }, 'bot.month.report')
  if (agg.txCount === 0) {
    await safePush(
      lineUserId,
      [textReply(`เดือน ${bucket.monthLabel} ยังไม่มีรายการให้ออกรายงานครับ`)],
      log,
    )
    return
  }
  await safePush(
    lineUserId,
    [
      buildMonthReportBubble({
        monthLabel: bucket.monthLabel,
        totalIncomeBaht: agg.totalIncomeBaht,
        totalExpenseBaht: agg.totalExpenseBaht,
        netBaht: agg.netBaht,
        txCount: agg.txCount,
        byCategory: agg.byCategory,
        webBaseUrl: getWebBaseUrl(),
      }),
    ],
    log,
  )
}

async function handleParsedTxn(
  event: TextMessageEvent,
  userId: string,
  parsed: NonNullable<ReturnType<typeof parseTransactionText>>,
  log: BotLogger,
): Promise<void> {
  if (!isAmountValid(parsed.amountBaht)) {
    await safeReply(
      event.replyToken!,
      [textReply(`จำนวนต้องไม่เกิน ฿${PARSER_LIMITS.MAX_BAHT.toLocaleString()} ครับ`)],
      log,
    )
    return
  }

  const categories = await prisma.category.findMany()
  const matched = fuzzyMatchCategory(parsed.categoryRaw, categories)
  if (!matched) {
    await safeReply(
      event.replyToken!,
      [textReply(`ไม่พบหมวดหมู่ "${parsed.categoryRaw}" ครับ ลองพิมพ์ใหม่หรือเพิ่มในเว็บ`)],
      log,
    )
    return
  }

  const expectedType = parsed.sign === '+' ? 'income' : 'expense'
  if (matched.type !== expectedType) {
    const correctSign = matched.type === 'income' ? '+' : '-'
    const wrongLabel = matched.type === 'income' ? 'รายรับ' : 'รายจ่าย'
    await safeReply(
      event.replyToken!,
      [
        textReply(
          `${matched.name} เป็น${wrongLabel} ใช้ ${correctSign}${parsed.amountBaht} ${parsed.categoryRaw}`,
        ),
      ],
      log,
    )
    return
  }

  const occurredAt = event.timestamp ? new Date(event.timestamp) : new Date()
  const txn = await prisma.transaction.create({
    data: {
      type: expectedType,
      amount: bahtToSatang(parsed.amountBaht),
      categoryId: matched.id,
      occurredAt,
      note: parsed.note || null,
      createdById: userId,
    },
    include: { category: true },
  })

  log.info({ txnId: txn.id, type: txn.type, amount: txn.amount }, 'bot.txn.created')
  await safeReply(event.replyToken!, [buildConfirmationBubble(txn)], log)
}

async function handleNuclearReset(
  event: TextMessageEvent,
  userId: string,
  lineUserId: string,
  log: BotLogger,
): Promise<void> {
  if (event.source?.userId !== lineUserId) {
    log.warn({ userId }, 'bot.reset.invalid.source')
    return
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.chatMessage.deleteMany({ where: { userId } })
      await tx.transaction.deleteMany({ where: { createdById: userId } })
      await tx.debtRequest.deleteMany({
        where: { OR: [{ creditorId: userId }, { debtorId: userId }] },
      })
      await tx.groupMember.deleteMany({ where: { userId } })
      await tx.group.deleteMany({ where: { createdById: userId } })
      await tx.promptPayLink.deleteMany({ where: { userId } })
      await tx.user.update({
        where: { id: userId },
        data: { registeredAt: null },
      })
    })

    log.info({ userId }, 'user.data.reset.completed')
    await safePush(
      lineUserId,
      [
        textReply(
          'ตุ๊ต๊ะล้างข้อมูลให้คุณเรียบร้อยแล้วครับ! 🌱💪 ข้อมูลทั้งหมดถูกลบออกจากระบบแล้ว',
        ),
      ],
      log,
    )
  } catch (err) {
    log.error({ err, userId }, 'user.data.reset.failed')
    await safePush(
      lineUserId,
      [
        textReply(
          'ขออภัยครับ เกิดข้อผิดพลาดในการล้างข้อมูล กรุณาลองใหม่ภายหลัง',
        ),
      ],
      log,
    )
  }
}

function parsePromptPayText(text: string): number | null {
  const m = text.match(/^ขอเงิน(?:\s+(\d+(?:\.\d+)?))?$/)
  if (!m) return null
  if (!m[1]) return null
  return Math.round(parseFloat(m[1]) * 100)
}

function parseDebtActionText(text: string): { action: 'paid' | 'reject' | 'later'; id: string } | null {
  const m = text.match(/^\/(debt-paid|debt-reject|debt-later)\s+(\S+)$/)
  if (!m) return null
  const actionMap: Record<string, 'paid' | 'reject' | 'later'> = {
    'debt-paid': 'paid',
    'debt-reject': 'reject',
    'debt-later': 'later',
  }
  return { action: actionMap[m[1]], id: m[2] }
}

/**
 * Entry point for inbound LINE text messages.
 */
export async function handleTextMessage(
  event: TextMessageEvent,
  log: BotLogger,
): Promise<void> {
  const lineUserId = event.source?.userId
  if (!lineUserId || !event.replyToken) {
    log.warn({ event }, 'bot.text.missing.identity')
    return
  }

  const user = await upsertUser(lineUserId, log)
  const text = (event.message.text ?? '').trim()
  const lower = text.toLowerCase()

  if (user.registeredAt === null) {
    await safePush(
      lineUserId,
      [textReply('ยินดีต้อนรับครับ กรุณากด "ลงทะเบียน" ที่เมนูด้านล่างเพื่อเริ่มใช้งานนะครับ')],
      log,
    )
    return
  }

  if (lower === '/last' || lower === 'last') {
    await handleSlashLast(event, user.id, log)
    return
  }

  if (lower === '/undo' || lower === 'undo') {
    await handleSlashUndo(event, user.id, log)
    return
  }

  if (lower === '/report' || text === 'ออกรายงาน') {
    await handleMonthReport(event, user.id, lineUserId, log)
    return
  }

  if (lower === '/month' || text === 'ดูยอดเดือนนี้') {
    await handleMonthSummary(event, user.id, lineUserId, log)
    return
  }

  if (text.startsWith('+') || text.startsWith('-')) {
    const parsed = parseTransactionText(text)
    if (parsed) {
      await handleParsedTxn(event, user.id, parsed, log)
      return
    }
  }

  if (text === 'ขอเงิน' || text.startsWith('ขอเงิน ')) {
    const amountSatang = parsePromptPayText(text)
    await handlePromptPayRequest(event, lineUserId, amountSatang, log)
    return
  }

  if (text === 'หนี้' || text.startsWith('หนี้ ')) {
    await handleDebtCreate(event, lineUserId, log)
    return
  }

  const debtPayMatch = text.match(/^\/debt-pay\s+(\S+)$/)
  if (debtPayMatch) {
    await handleDebtPayQr(event, lineUserId, debtPayMatch[1], log)
    return
  }

  const debtAction = parseDebtActionText(text)
  if (debtAction) {
    await handleDebtAction(event, lineUserId, debtAction.action, debtAction.id, log)
    return
  }

  if (text === 'มะม่วงสีเขียวกินนกสีขาว') {
    await handleNuclearReset(event, user.id, lineUserId, log)
    return
  }

  if (text === '/reset' || text === '/forget' || text === 'ล้างประวัติ') {
    try {
      const removed = await clearChatMemory(user.id)
      log.info({ userId: user.id, removed }, 'chat.memory.cleared')
      await safePush(lineUserId, [textReply('ล้างประวัติการสนทนาของคุณแล้วครับ คุยใหม่ตั้งแต่ต้นได้เลย')], log)
    } catch (err) {
      log.warn({ err }, 'chat.memory.clear.failed')
    }
    return
  }

  // Final fallback: AI secretary
  log.info({ text: text.slice(0, 40) }, 'bot.text.unrecognized')
  if (text.length > 0 && text.length < SECRETARY_MAX_INPUT_LEN) {
    try {
      log.info({ text: text.slice(0, 40) }, 'bot.secretary.calling')
      const reply = await askSecretary(user.id, text, log)
      if (reply) {
        log.info({ replyLen: reply.length }, 'bot.secretary.replied')
        await safePush(lineUserId, [textReply(reply)], log)
      } else {
        const reason = getLastSecretaryError() ?? 'unknown'
        log.warn({ reason }, 'bot.secretary.null_reply')
        await safePush(
          lineUserId,
          [
            textReply(
              `ตุ๊ต๊ะติดปัญหาอยู่ ขอเวลาแป๊บนึงนะครับ 🍚 (reason: ${reason})\nลองเช็ค /chat/health ที่ฝั่งเซิร์ฟเวอร์`,
            ),
          ],
          log,
        )
      }
    } catch (err) {
      log.warn({ err }, 'secretary.failed')
      await safePush(
        lineUserId,
        [textReply('ตุ๊ต๊ะเจอข้อผิดพลาด ลองส่งใหม่ในอีกสักครู่นะครับ')],
        log,
      )
    }
  }
}
