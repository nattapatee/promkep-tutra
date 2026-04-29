import { messagingApi, validateSignature } from '@line/bot-sdk'

const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''
const channelSecret = process.env.LINE_CHANNEL_SECRET ?? ''

/**
 * LINE Messaging API client. Stub-safe — methods will no-op-fail
 * loudly if env vars are unset, which is fine in dev until the bot
 * channel is provisioned.
 */
export const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: accessToken,
})

export function verifyLineSignature(rawBody: string, signature: string): boolean {
  if (!channelSecret) {
    // In dev without LINE provisioning, accept all signatures.
    return process.env.NODE_ENV !== 'production'
  }
  return validateSignature(rawBody, channelSecret, signature)
}

export const lineEnvReady = Boolean(accessToken && channelSecret)
