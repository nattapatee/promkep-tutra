import type { messagingApi, webhook } from '@line/bot-sdk'
import { prisma } from '@/lib/prisma'
import { lineClient } from '@/lib/line'
import { fileStore } from '@/lib/file-store'

type ImageMessageEvent = webhook.MessageEvent & { message: webhook.ImageMessageContent }

interface BotLogger {
  info: (obj: unknown, msg?: string) => void
  warn: (obj: unknown, msg?: string) => void
  error: (obj: unknown, msg?: string) => void
}

const ATTACH_WINDOW_MS = 60 * 1000
const MAX_ATTACHMENTS_PER_TXN = 5

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

function textReply(text: string): messagingApi.TextMessage {
  return { type: 'text', text }
}

/**
 * Download the binary body of a LINE message via the blob endpoint.
 * Returns null when the access token is unset or the API errors.
 */
async function downloadMessageContent(
  messageId: string,
  log: BotLogger,
): Promise<Buffer | null> {
  try {
    const { messagingApi: api } = await import('@line/bot-sdk')
    const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''
    if (!accessToken) {
      log.warn({ messageId }, 'line.getMessageContent.no_token')
      return null
    }
    const blobClient = new api.MessagingApiBlobClient({ channelAccessToken: accessToken })
    const stream = await blobClient.getMessageContent(messageId)
    const chunks: Buffer[] = []
    for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  } catch (err) {
    log.warn({ err, messageId }, 'line.getMessageContent.failed')
    return null
  }
}

/**
 * Find the most recent transaction by this LINE user, but only if it
 * was created within the 60-second attach window. Returns null otherwise.
 */
async function findRecentTxnForAttach(lineUserId: string) {
  const user = await prisma.user.findUnique({ where: { lineUserId } })
  if (!user) return null
  const txn = await prisma.transaction.findFirst({
    where: { createdById: user.id },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { attachments: true } } },
  })
  if (!txn) return null
  const ageMs = Date.now() - txn.createdAt.getTime()
  if (ageMs > ATTACH_WINDOW_MS) return null
  return txn
}

/**
 * Entry point for inbound LINE image messages.
 * Attaches the image to the sender's most recent transaction iff
 * created within ATTACH_WINDOW_MS. Otherwise replies a short hint.
 */
export async function handleImageMessage(
  event: ImageMessageEvent,
  log: BotLogger,
): Promise<void> {
  const lineUserId = event.source?.userId
  if (!lineUserId || !event.replyToken) {
    log.warn({ event }, 'bot.image.missing.identity')
    return
  }

  const recent = await findRecentTxnForAttach(lineUserId)
  if (!recent) {
    await safeReply(
      event.replyToken,
      [textReply('ส่งรูปหลังบันทึก +/- ภายใน 60 วินาที ระบบจึงจะแนบให้ครับ')],
      log,
    )
    return
  }

  if (recent._count.attachments >= MAX_ATTACHMENTS_PER_TXN) {
    log.info({ txnId: recent.id }, 'bot.image.attach.limit')
    return
  }

  const buffer = await downloadMessageContent(event.message.id, log)
  if (!buffer) {
    log.warn({ messageId: event.message.id }, 'bot.image.download.failed')
    return
  }

  const mimeType = 'image/jpeg' // LINE images are always served as JPEG.
  const saved = await fileStore.save({
    buffer,
    originalFilename: `${event.message.id}.jpg`,
    mimeType,
  })

  const attachment = await prisma.attachment.create({
    data: {
      transactionId: recent.id,
      filename: `${event.message.id}.jpg`,
      filepath: saved.filepath,
      mimeType,
      sizeBytes: saved.sizeBytes,
    },
  })

  log.info(
    { attachmentId: attachment.id, txnId: recent.id, sizeBytes: saved.sizeBytes },
    'bot.image.attached',
  )
}
