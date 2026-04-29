import type { AuthHeaders } from './api'

export interface LiffProfile {
  lineUserId: string
  displayName: string
  avatarUrl: string | null
}

export interface LiffSession {
  mode: 'liff' | 'dev'
  authHeaders: AuthHeaders
  profile: LiffProfile
}

const DEV_LINE_USER_ID = process.env.NEXT_PUBLIC_DEV_LINE_USER_ID ?? 'U-dev-001'
const DEV_DISPLAY_NAME = 'Dev User'

export async function initLiff(): Promise<LiffSession> {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID

  if (!liffId) {
    return {
      mode: 'dev',
      authHeaders: {
        lineUserId: DEV_LINE_USER_ID,
        displayName: DEV_DISPLAY_NAME,
      },
      profile: {
        lineUserId: DEV_LINE_USER_ID,
        displayName: DEV_DISPLAY_NAME,
        avatarUrl: null,
      },
    }
  }

  const liffMod = await import('@line/liff')
  const liff = liffMod.default
  await liff.init({ liffId })

  if (!liff.isLoggedIn()) {
    liff.login()
    throw new Error('LIFF: redirecting to login')
  }

  const idToken = liff.getIDToken() ?? undefined
  const profile = await liff.getProfile()

  return {
    mode: 'liff',
    authHeaders: {
      bearer: idToken,
      lineUserId: profile.userId,
      displayName: profile.displayName,
    },
    profile: {
      lineUserId: profile.userId,
      displayName: profile.displayName,
      avatarUrl: profile.pictureUrl ?? null,
    },
  }
}
