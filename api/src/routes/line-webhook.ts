import type { FastifyInstance } from 'fastify'
import type { webhook } from '@line/bot-sdk'
import { lineClient, verifyLineSignature } from '@/lib/line'
import { prisma } from '@/lib/prisma'
import { handleTextMessage } from '@/lib/bot/text-handler'
import { handleImageMessage } from '@/lib/bot/image-handler'
import { linkUserToRichMenu, readRichMenuIds } from '@/lib/line-richmenu'

async function handleFollowEvent(
  event: webhook.FollowEvent,
  log: FastifyInstance['log'],
): Promise<void> {
  const lineUserId = event.source?.userId
  if (!lineUserId) return

  let displayName = lineUserId
  let avatarUrl: string | null = null
  try {
    const profile = await lineClient.getProfile(lineUserId)
    if (profile.displayName) displayName = profile.displayName
    avatarUrl = profile.pictureUrl ?? null
  } catch (err) {
    log.warn({ err, lineUserId }, 'follow.getProfile.failed')
  }

  await prisma.user.upsert({
    where: { lineUserId },
    update: { displayName, ...(avatarUrl ? { avatarUrl } : {}) },
    create: { lineUserId, displayName, avatarUrl, role: 'member' },
  })

  try {
    const ids = await readRichMenuIds(log)
    await linkUserToRichMenu(lineUserId, ids.pendingRichMenuId, log)
  } catch (err) {
    log.warn({ err, lineUserId }, 'follow.link.failed')
  }

  log.info({ lineUserId, displayName }, 'follow.complete')
}

/**
 * POST /line/webhook — receives events from LINE.
 * Verifies signature, dispatches each event to the appropriate handler.
 * Returns 200 quickly so LINE doesn't retry; per-event failures are logged
 * but don't fail the whole batch.
 */
export async function lineWebhookRoutes(app: FastifyInstance) {
  app.post('/line/webhook', async (req, reply) => {
    const signature = req.headers['x-line-signature']
    const sig = Array.isArray(signature) ? signature[0] : signature
    const rawBody = JSON.stringify(req.body ?? {})

    if (!verifyLineSignature(rawBody, sig ?? '')) {
      return reply.status(401).send({ error: 'invalid_signature' })
    }

    const body = (req.body ?? {}) as { events?: webhook.Event[] }
    const events = Array.isArray(body.events) ? body.events : []

    for (const event of events) {
      try {
        if (event.type === 'follow') {
          await handleFollowEvent(event as webhook.FollowEvent, app.log)
          continue
        }
        if (event.type === 'message') {
          const messageEvent = event as webhook.MessageEvent
          if (messageEvent.message.type === 'text') {
            await handleTextMessage(
              messageEvent as webhook.MessageEvent & { message: webhook.TextMessageContent },
              app.log,
            )
            continue
          }
          if (messageEvent.message.type === 'image') {
            await handleImageMessage(
              messageEvent as webhook.MessageEvent & { message: webhook.ImageMessageContent },
              app.log,
            )
            continue
          }
        }
        app.log.info({ type: event.type }, 'line.webhook.event.ignored')
      } catch (err) {
        app.log.error({ err, eventType: event.type }, 'line.webhook.event.failed')
      }
    }

    return { ok: true }
  })
}
