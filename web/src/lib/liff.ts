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
const LIFF_INIT_TIMEOUT_MS = 30_000

function isInLineApp(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return ua.includes('Line/') || ua.includes('LINE/')
}

function timeout<T>(ms: number, promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)
    promise.then((v) => { clearTimeout(timer); resolve(v) }, (e) => { clearTimeout(timer); reject(e) })
  })
}

export async function reloginLiff(): Promise<void> {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID
  if (!liffId) return

  // Loop guard: if we've just attempted a relogin and got back here, the
  // logout+login dance already ran. Force a hard reload instead and let the
  // user manually retry — better than burning bandwidth in an infinite loop.
  const attemptKey = 'liff_relogin_attempt'
  const prior = Number(sessionStorage.getItem(attemptKey) ?? '0')
  if (prior >= 2) {
    console.warn('[LIFF] relogin loop detected, aborting')
    sessionStorage.removeItem(attemptKey)
    return
  }
  sessionStorage.setItem(attemptKey, String(prior + 1))

  const liffMod = await import('@line/liff')
  const liff = liffMod.default

  console.log('[LIFF] Token expired, logging out and re-issuing')
  try {
    if (liff.isLoggedIn()) liff.logout()
  } catch (err) {
    console.warn('[LIFF] logout failed (continuing)', err)
  }
  // After logout the SDK session is gone; reload so init() sees logged-out
  // state and triggers a fresh liff.login() redirect → new idToken.
  window.location.reload()
}

export async function initLiff(): Promise<LiffSession> {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID

  if (!liffId) {
    console.log('[LIFF] No LIFF ID, using dev mode')
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

  console.log('[LIFF] Starting init with ID:', liffId)
  console.log('[LIFF] User-Agent:', typeof navigator !== 'undefined' ? navigator.userAgent : 'none')
  console.log('[LIFF] In LINE app:', isInLineApp())

  const liffMod = await import('@line/liff')
  const liff = liffMod.default
  console.log('[LIFF] SDK loaded')

  try {
    await timeout(LIFF_INIT_TIMEOUT_MS, liff.init({ liffId }))
  } catch (err) {
    console.error('[LIFF] init timed out or failed:', err)
    if (!isInLineApp()) {
      throw new Error('กรุณาเปิดผ่านแอป LINE')
    }
    // In-app: skip the broken state by forcing a fresh login redirect
    // instead of bubbling up a timeout that blocks the UI.
    try {
      liff.login({ redirectUri: window.location.href })
    } catch {}
    throw new Error('LIFF: redirecting to login')
  }

  console.log('[LIFF] Init success, loggedIn:', liff.isLoggedIn())

  if (!liff.isLoggedIn()) {
    console.log('[LIFF] Not logged in, calling login()')
    liff.login({ redirectUri: window.location.href })
    throw new Error('LIFF: redirecting to login')
  }

  try {
    const idToken = liff.getIDToken() ?? undefined
    const profile = await timeout(LIFF_INIT_TIMEOUT_MS, liff.getProfile())
    console.log('[LIFF] Got profile:', profile.userId)

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
  } catch (err) {
    console.error('[LIFF] getProfile failed:', err)
    if (!isInLineApp()) {
      throw new Error('กรุณาเปิดผ่านแอป LINE')
    }
    throw err
  }
}
