import type { messagingApi, webhook } from '@line/bot-sdk'
import { prisma } from '@/lib/prisma'
import { lineClient } from '@/lib/line'
import { buildDebtPayQrBubble, buildDebtRequestBubbleForDebtor } from '@/lib/bot/flex'
import { askSecretary } from '@/lib/bot/secretary'
import { maskIdentifier, type PromptPayKind } from '@/lib/promptpay'

type TextMessageEvent = webhook.MessageEvent & { message: webhook.TextMessageContent }

interface BotLogger {
  info: (obj: unknown, msg?: string) => void
  warn: (obj: unknown, msg?: string) => void
  error: (obj: unknown, msg?: string) => void
}

const SATANG_PER_BAHT = 100

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

function textMsg(text: string): messagingApi.TextMessage {
  return { type: 'text', text }
}

/**
 * Parse "หนี้ <amount> @<displayName> [reason]" from text.
 * Returns null if the pattern doesn't match.
 */
function parseDebtText(text: string): { amountBaht: number; memberName: string; reason: string } | null {
  const m = text.match(/^หนี้\s+(\d+(?:\.\d+)?)\s+@(\S+)(?:\s+(.+))?$/)
  if (!m) return null
  return {
    amountBaht: parseFloat(m[1]),
    memberName: m[2],
    reason: (m[3] ?? '').trim(),
  }
}

/**
 * Handle "หนี้ ..." text command.
 * If message doesn't include @member, reply with usage hint.
 * Otherwise create DebtRequest and push Flex to debtor.
 */
export async function handleDebtCreate(
  event: TextMessageEvent,
  lineUserId: string,
  log: BotLogger,
): Promise<void> {
  const text = (event.message.text ?? '').trim()
  const parsed = parseDebtText(text)

  if (!parsed) {
    await safeReply(
      event.replyToken!,
      [textMsg('พิมพ์ตามรูปแบบ: หนี้ <amount> @<member-name> <reason>\nเช่น: หนี้ 500 @สมชาย ค่าข้าว')],
      log,
    )
    return
  }

  const creditor = await prisma.user.findUnique({ where: { lineUserId } })
  if (!creditor) {
    log.warn({ lineUserId }, 'debt.create.creditor.not_found')
    return
  }

  // Find debtor by displayName — first registered match
  const debtor = await prisma.user.findFirst({
    where: { displayName: parsed.memberName, registeredAt: { not: null } },
  })
  if (!debtor) {
    await safeReply(
      event.replyToken!,
      [textMsg(`ไม่พบสมาชิก @${parsed.memberName} ในระบบครับ กรุณาตรวจสอบชื่อ`)],
      log,
    )
    return
  }

  if (debtor.id === creditor.id) {
    await safeReply(event.replyToken!, [textMsg('ไม่สามารถสร้างหนี้กับตัวเองได้ครับ')], log)
    return
  }

  const debt = await prisma.debtRequest.create({
    data: {
      creditorId: creditor.id,
      debtorId: debtor.id,
      amount: Math.round(parsed.amountBaht * SATANG_PER_BAHT),
      reason: parsed.reason || null,
      status: 'pending',
    },
  })

  log.info({ debtId: debt.id, creditorId: creditor.id, debtorId: debtor.id }, 'debt.created')

  // Push Flex bubble to debtor
  await safePush(
    debtor.lineUserId,
    [
      buildDebtRequestBubbleForDebtor({
        debt,
        creditor: { displayName: creditor.displayName, avatarUrl: creditor.avatarUrl ?? null },
      }),
    ],
    log,
  )

  // Confirm to creditor
  const THB = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' })
  await safeReply(
    event.replyToken!,
    [textMsg(`ส่งคำขอเก็บเงิน ${THB.format(parsed.amountBaht)} ไปที่ @${parsed.memberName} แล้วครับ`)],
    log,
  )
}

function getPublicApiUrl(log?: BotLogger): string | null {
  const direct = (process.env.PUBLIC_API_URL ?? '').trim()
  if (direct.startsWith('https://') || direct.startsWith('http://')) {
    return direct.replace(/\/$/, '')
  }
  const domain = (process.env.DOMAIN_API ?? '').trim()
  if (domain) {
    return `https://${domain.replace(/^https?:\/\//, '').replace(/\/$/, '')}`
  }
  const web = (process.env.WEB_BASE_URL ?? '').trim()
  if (web && /-web\./.test(web)) {
    return web.replace(/-web\./, '-api.').replace(/\/$/, '')
  }
  log?.warn({}, 'debt.pay.qr.url.missing')
  return null
}

/**
 * Handle /debt-pay <id>: debtor wants to pay this debt.
 * Looks up creditor's PromptPay link, pushes a QR bubble with a
 * "ชำระแล้ว" button that fires /debt-paid <id>.
 */
export async function handleDebtPayQr(
  event: TextMessageEvent,
  lineUserId: string,
  debtId: string,
  log: BotLogger,
): Promise<void> {
  const debtor = await prisma.user.findUnique({ where: { lineUserId } })
  if (!debtor) {
    log.warn({ lineUserId }, 'debt.pay.debtor.not_found')
    return
  }

  const debt = await prisma.debtRequest.findUnique({
    where: { id: debtId },
    include: {
      creditor: { include: { promptPayLink: true } },
    },
  })

  if (!debt) {
    await safeReply(event.replyToken!, [textMsg('ไม่พบรายการหนี้ครับ')], log)
    return
  }
  if (debt.debtorId !== debtor.id) {
    await safeReply(event.replyToken!, [textMsg('คุณไม่ใช่ลูกหนี้ในรายการนี้ครับ')], log)
    return
  }
  if (debt.status !== 'pending') {
    await safeReply(
      event.replyToken!,
      [textMsg(`รายการนี้ถูกอัพเดทไปแล้ว (${debt.status}) ครับ`)],
      log,
    )
    return
  }

  const link = debt.creditor.promptPayLink
  if (!link) {
    await safeReply(
      event.replyToken!,
      [
        textMsg(
          `${debt.creditor.displayName} ยังไม่ได้ผูก PromptPay ครับ ลองติดต่อตรงๆ หรือใช้ "ชำระแล้ว" ผ่านเว็บแอป`,
        ),
      ],
      log,
    )
    return
  }

  const base = getPublicApiUrl(log)
  if (!base) {
    await safeReply(
      event.replyToken!,
      [textMsg('ระบบยังตั้งค่าไม่ครบ ตุ๊ต๊ะส่ง QR ให้ไม่ได้ตอนนี้ครับ')],
      log,
    )
    return
  }

  const amountSatang = debt.amount
  const amountBaht = amountSatang / SATANG_PER_BAHT
  const qrUrl = `${base}/qr.png?u=${encodeURIComponent(debt.creditor.id)}&amount=${amountSatang}`
  const identifierMasked = maskIdentifier({
    identifier: link.identifier,
    kind: link.kind as PromptPayKind,
  })

  log.info({ debtId, qrUrl }, 'debt.pay.qr')

  await safeReply(
    event.replyToken!,
    [
      buildDebtPayQrBubble({
        debtId,
        amountBaht,
        qrImageUrl: qrUrl,
        creditorDisplayName: link.displayName ?? debt.creditor.displayName,
        identifierMasked,
      }),
    ],
    log,
  )
}

/**
 * Handle /debt-paid, /debt-reject, /debt-later commands.
 * Verifies caller is the debtor, updates status, pushes AI-generated
 * confirmation to the creditor.
 */
export async function handleDebtAction(
  event: TextMessageEvent,
  lineUserId: string,
  action: 'paid' | 'reject' | 'later',
  debtId: string,
  log: BotLogger,
): Promise<void> {
  const debtor = await prisma.user.findUnique({ where: { lineUserId } })
  if (!debtor) {
    log.warn({ lineUserId }, 'debt.action.debtor.not_found')
    return
  }

  const debt = await prisma.debtRequest.findUnique({
    where: { id: debtId },
    include: {
      creditor: { select: { id: true, lineUserId: true, displayName: true } },
      debtor: { select: { id: true, lineUserId: true, displayName: true } },
    },
  })

  if (!debt) {
    await safeReply(event.replyToken!, [textMsg('ไม่พบรายการหนี้ครับ')], log)
    return
  }

  if (debt.debtorId !== debtor.id) {
    await safeReply(event.replyToken!, [textMsg('คุณไม่ใช่ลูกหนี้ในรายการนี้ครับ')], log)
    return
  }

  if (debt.status !== 'pending') {
    await safeReply(
      event.replyToken!,
      [textMsg(`รายการนี้ถูกอัพเดทไปแล้ว (${debt.status}) ครับ`)],
      log,
    )
    return
  }

  const statusMap: Record<string, string> = { paid: 'paid', reject: 'rejected', later: 'later' }
  const newStatus = statusMap[action]

  await prisma.debtRequest.update({
    where: { id: debtId },
    data: { status: newStatus, resolvedAt: new Date() },
  })

  log.info({ debtId, action, debtorId: debtor.id }, 'debt.action.updated')

  // Reply to debtor
  const debtorConfirmMap: Record<string, string> = {
    paid: 'บันทึกการชำระแล้วครับ',
    reject: 'ปฏิเสธรายการแล้วครับ',
    later: 'เลื่อนการชำระแล้วครับ',
  }
  await safeReply(event.replyToken!, [textMsg(debtorConfirmMap[action])], log)

  // Push AI-generated confirmation to creditor
  try {
    const THB = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' })
    const amountBaht = debt.amount / SATANG_PER_BAHT
    const actionLabel = action === 'paid' ? 'ชำระเงิน' : action === 'reject' ? 'ปฏิเสธ' : 'เลื่อนการชำระ'
    const prompt = `สร้างข้อความสั้นๆ แจ้งให้เจ้าหนี้รู้ว่า ${debt.debtor.displayName} ${actionLabel}หนี้ ${THB.format(amountBaht)} แล้ว ใช้ภาษาไทยสุภาพ ไม่เกิน 2 ประโยค`
    const aiText = await askSecretary(debt.creditor.id, prompt, log)
    if (aiText) await safePush(debt.creditor.lineUserId, [textMsg(aiText)], log)
  } catch (err) {
    log.warn({ err, debtId }, 'debt.action.creditor.notify.failed')
  }
}
