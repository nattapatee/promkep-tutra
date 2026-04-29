import { promises as fs } from 'node:fs'
import path from 'node:path'

interface RichMenuIds {
  pendingRichMenuId?: string
  defaultRichMenuId?: string
}

const CACHE_PATH = path.resolve(process.cwd(), '.cache/richmenu-ids.json')

interface RichMenuLogger {
  info?: (obj: unknown, msg?: string) => void
  warn?: (obj: unknown, msg?: string) => void
}

const consoleLog: RichMenuLogger = {
  warn: (obj, msg) => console.warn(`[richmenu] ${msg ?? ''}`, obj),
  info: (obj, msg) => console.log(`[richmenu] ${msg ?? ''}`, obj),
}

let cached: RichMenuIds | null = null

export async function readRichMenuIds(log: RichMenuLogger = consoleLog): Promise<RichMenuIds> {
  if (cached) return cached
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as RichMenuIds
    cached = parsed
    return parsed
  } catch (err) {
    log.warn?.({ err, path: CACHE_PATH }, 'richmenu.cache.missing')
    cached = {}
    return cached
  }
}

export function clearRichMenuIdCache(): void {
  cached = null
}

async function callLineApi(
  method: 'POST' | 'DELETE',
  pathname: string,
  log: RichMenuLogger,
): Promise<boolean> {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''
  if (!accessToken) {
    log.warn?.({ pathname }, 'richmenu.no_access_token')
    return false
  }
  try {
    const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` }
    if (method === 'POST') headers['Content-Length'] = '0'
    const res = await fetch(`https://api.line.me${pathname}`, { method, headers })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      log.warn?.({ status: res.status, body, pathname }, 'richmenu.api.failed')
      return false
    }
    return true
  } catch (err) {
    log.warn?.({ err, pathname }, 'richmenu.api.error')
    return false
  }
}

export async function linkUserToRichMenu(
  lineUserId: string,
  richMenuId: string | undefined,
  log: RichMenuLogger = consoleLog,
): Promise<boolean> {
  if (!richMenuId) {
    log.warn?.({ lineUserId }, 'richmenu.link.no_id')
    return false
  }
  return callLineApi(
    'POST',
    `/v2/bot/user/${encodeURIComponent(lineUserId)}/richmenu/${encodeURIComponent(richMenuId)}`,
    log,
  )
}

export async function unlinkUserFromRichMenu(
  lineUserId: string,
  log: RichMenuLogger = consoleLog,
): Promise<boolean> {
  return callLineApi('DELETE', `/v2/bot/user/${encodeURIComponent(lineUserId)}/richmenu`, log)
}
