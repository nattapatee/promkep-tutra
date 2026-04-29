import type { FastifyInstance } from 'fastify'

/**
 * GET /health — boring liveness probe.
 * Returns service info + whether LINE env is configured.
 */
export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'promkep-tutra-api',
    version: '0.0.1',
    timestamp: new Date().toISOString(),
    lineEnvConfigured: Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
  }))
}
