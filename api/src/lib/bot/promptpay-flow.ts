import type { messagingApi, webhook } from '@line/bot-sdk'
import { prisma } from '@/lib/prisma'
import { lineClient } from '@/lib/line'
import { maskIdentifier, type PromptPayKind } from '@/lib/promptpay'
import { buildPromptPayQrBubble } from '@/lib/bot/flex'

type TextMessageEvent = webhook.MessageEvent & { message: webhook.TextMessageContent }

interface BotLogger {
  info: (obj: unknown, msg?: string) => void
  warn: (obj: unknown, msg?: string) => void
  error: (obj: unknown, msg?: string) => void
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

function textMsg(text: string): messagingApi.TextMessage {
  return { type: 'text', text }
}

/**
 * Resolve the public API base URL for serving QR PNGs to LINE.
 *
 * Priority:
 * 1. PUBLIC_API_URL — explicit, preferred.
 * 2. DOMAIN_API — bare host (compose env), prefixed with https://.
 * 3. WEB_BASE_URL with `-web.` → `-api.` rewrite — best-effort fallback when
 *    only the web host is configured. (Without this fix the bot pointed
 *    LINE at the WEB host's /qr.png — which 404s and renders blank.)
 *
 * Returns null when no usable absolute HTTPS base can be derived.
 */
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
    const rewritten = web.replace(/-web\./, '-api.').replace(/\/$/, '')
    log?.warn(
      { web, rewritten },
      'promptpay.url.fallback.web_to_api_rewrite — set PUBLIC_API_URL explicitly',
    )
    return rewritten
  }

  log?.warn({}, 'promptpay.url.missing — set PUBLIC_API_URL in production env')
  return null
}

function buildQrUrl(base: string, userId: string, amountSatang: number): string {
  return `${base}/qr.png?u=${encodeURIComponent(userId)}&amount=${amountSatang}`
}

/**
 * Handle "ขอเงิน [amount]" text command.
 *
 * - No amount → push quick-reply with preset amounts.
 * - Amount present, no PromptPayLink → push setup hint.
 * - Amount present, PromptPayLink found → push QR Flex bubble.
 */
export async function handlePromptPayRequest(
  event: TextMessageEvent,
  lineUserId: string,
  amountSatang: number | null,
  log: BotLogger,
): Promise<void> {
  if (amountSatang === null) {
    const quickReplyMsg: messagingApi.TextMessage = {
      type: 'text',
      text: 'ต้องการขอเงินเท่าไรครับ?',
      quickReply: {
        items: [
          { type: 'action', action: { type: 'message', label: '฿100', text: 'ขอเงิน 100' } },
          { type: 'action', action: { type: 'message', label: '฿200', text: 'ขอเงิน 200' } },
          { type: 'action', action: { type: 'message', label: '฿500', text: 'ขอเงิน 500' } },
          { type: 'action', action: { type: 'message', label: '฿1000', text: 'ขอเงิน 1000' } },
          { type: 'action', action: { type: 'message', label: 'ระบุเอง', text: 'ขอเงิน ' } },
        ],
      },
    }
    await safePush(lineUserId, [quickReplyMsg], log)
    return
  }

  const user = await prisma.user.findUnique({
    where: { lineUserId },
    include: { promptPayLink: true },
  })

  if (!user) {
    log.warn({ lineUserId }, 'promptpay.request.user.not_found')
    return
  }

  if (!user.promptPayLink) {
    await safePush(
      lineUserId,
      [textMsg('กรุณาตั้ง PromptPay ก่อนนะครับ — ไปที่ /settings/promptpay บนเว็บแอปได้เลยครับ')],
      log,
    )
    return
  }

  const link = user.promptPayLink
  const base = getPublicApiUrl(log)
  if (!base) {
    await safePush(
      lineUserId,
      [
        textMsg(
          'ระบบยังตั้งค่าไม่ครบ (PUBLIC_API_URL ไม่พบ) ตุ๊ต๊ะส่ง QR ให้ไม่ได้ตอนนี้ครับ ลองติดต่อแอดมิน',
        ),
      ],
      log,
    )
    return
  }
  const qrUrl = buildQrUrl(base, user.id, amountSatang)
  const amountBaht = amountSatang / 100
  const identifierMasked = maskIdentifier({
    identifier: link.identifier,
    kind: link.kind as PromptPayKind,
  })

  log.info({ userId: user.id, amountSatang, qrUrl }, 'promptpay.request.qr')

  await safePush(
    lineUserId,
    [
      buildPromptPayQrBubble({
        qrImageUrl: qrUrl,
        identifierMasked,
        amountBaht,
        ownerDisplayName: link.displayName ?? user.displayName,
      }),
    ],
    log,
  )
}
