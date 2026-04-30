import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { healthRoutes } from '@/routes/health'
import { lineWebhookRoutes } from '@/routes/line-webhook'
import { categoryRoutes } from '@/routes/categories'
import { transactionRoutes } from '@/routes/transactions'
import { attachmentRoutes } from '@/routes/attachments'
import { reportRoutes } from '@/routes/reports'
import { meRoutes } from '@/routes/me'
import { registerRoutes } from '@/routes/register'
import { promptPayRoutes } from '@/routes/promptpay'
import { debtRoutes } from '@/routes/debts'
import { groupsRoutes } from '@/routes/groups'
import { qrRoutes } from '@/routes/qr'
import { chatRoutes } from '@/routes/chat'
import { startReminderCron } from '@/lib/reminder-cron'

const app = Fastify({
  logger: {
    transport: process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
      : undefined,
  },
})

const corsOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:3010')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

await app.register(cors, { origin: corsOrigins, credentials: true })
await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } })

await app.register(healthRoutes)
await app.register(lineWebhookRoutes)
await app.register(categoryRoutes)
await app.register(transactionRoutes)
await app.register(attachmentRoutes)
await app.register(reportRoutes)
await app.register(meRoutes)
await app.register(registerRoutes)
await app.register(promptPayRoutes)
await app.register(debtRoutes)
await app.register(groupsRoutes)
await app.register(qrRoutes)
await app.register(chatRoutes)

const port = Number(process.env.PORT ?? 3001)
const host = '0.0.0.0'

try {
  await app.listen({ port, host })
  app.log.info(`promkep-tutra-api listening on http://localhost:${port}`)
  // Reminder cron — runs in-process. Cheap idle, single-host deploy.
  startReminderCron(app.log)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
