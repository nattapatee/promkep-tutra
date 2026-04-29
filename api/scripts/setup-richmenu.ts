import 'dotenv/config'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanvas, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas'

const THAI_FONT_PATHS = [
  '/System/Library/Fonts/Supplemental/Ayuthaya.ttf',
  '/System/Library/Fonts/Supplemental/Thonburi.ttc',
  '/System/Library/Fonts/ThonburiUI.ttc',
  '/usr/share/fonts/truetype/tlwg/Garuda.ttf',
  '/usr/share/fonts/truetype/tlwg/Loma.ttf',
  '/usr/share/fonts/truetype/tlwg/Norasi.ttf',
]
const THAI_FONT_FAMILY = 'PromKepThai'
const registered = THAI_FONT_PATHS.find((p) => {
  try {
    GlobalFonts.registerFromPath(p, THAI_FONT_FAMILY)
    return true
  } catch {
    return false
  }
})
if (!registered) {
  console.warn('warn: no Thai font registered — fallback to system default')
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN
if (!ACCESS_TOKEN) {
  console.error('LINE_CHANNEL_ACCESS_TOKEN missing in api/.env')
  process.exit(1)
}

const WEB_BASE = process.argv[2] ?? process.env.WEB_BASE_URL
if (!WEB_BASE) {
  console.error('Pass web base URL as arg or set WEB_BASE_URL env')
  console.error('  npx tsx scripts/setup-richmenu.ts https://your-web.example.com')
  process.exit(1)
}

const ASSETS_DIR = path.resolve(__dirname, '../assets')
const CACHE_DIR = path.resolve(__dirname, '../.cache')
const PENDING_IMG = path.join(ASSETS_DIR, 'richmenu-pending.png')
const DEFAULT_IMG = path.join(ASSETS_DIR, 'richmenu-default.png')
const IDS_FILE = path.join(CACHE_DIR, 'richmenu-ids.json')

const W = 2500
const H = 1686
const HALF_H = Math.floor(H / 2)
const THIRD_W = Math.floor(W / 3)

// colour palette
const GOLD = '#D4AF7C'
const GOLD_LIGHT = '#E8C998'
const GOLD_DEEP = '#A88A5C'
const IVORY = '#FAF6EC'
const INK = '#0E1726'
const TEAL = '#0D9488'
const ROSE = '#E11D48'
const SLATE = '#334155'

interface DefaultArea {
  bounds: { x: number; y: number; width: number; height: number }
  action: { type: 'uri'; uri: string } | { type: 'message'; text: string }
}

const DEFAULT_AREAS: DefaultArea[] = [
  {
    bounds: { x: 0, y: 0, width: W, height: HALF_H },
    action: { type: 'uri', uri: `${WEB_BASE}/` },
  },
  {
    bounds: { x: 0, y: HALF_H, width: THIRD_W, height: H - HALF_H },
    action: { type: 'uri', uri: `${WEB_BASE}/transactions/new` },
  },
  {
    bounds: { x: THIRD_W, y: HALF_H, width: THIRD_W, height: H - HALF_H },
    action: { type: 'message', text: 'ขอเงิน' },
  },
  {
    bounds: { x: THIRD_W * 2, y: HALF_H, width: W - THIRD_W * 2, height: H - HALF_H },
    action: { type: 'message', text: 'หนี้' },
  },
]

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function strokeRoundRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
  lineWidth: number,
): void {
  ctx.save()
  roundRect(ctx, x, y, w, h, r)
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.stroke()
  ctx.restore()
}

function drawStars(ctx: SKRSContext2D, count: number, w: number, h: number, seed = 1): void {
  let s = seed
  const rand = (): number => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
  ctx.save()
  for (let i = 0; i < count; i++) {
    const x = rand() * w
    const y = rand() * h
    const r = 1 + rand() * 2.5
    ctx.globalAlpha = 0.25 + rand() * 0.55
    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawDotPattern(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  spacing = 28,
  size = 2,
  alpha = 0.16,
): void {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  for (let py = y + spacing / 2; py < y + h; py += spacing) {
    for (let px = x + spacing / 2; px < x + w; px += spacing) {
      ctx.beginPath()
      ctx.arc(px, py, size, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

async function generatePendingImage(): Promise<void> {
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#0E1726')
  bg.addColorStop(0.55, '#1A2540')
  bg.addColorStop(1, '#2D2046')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  drawStars(ctx, 80, W, H, 7)

  const glow = ctx.createRadialGradient(W - 200, 180, 40, W - 200, 180, 600)
  glow.addColorStop(0, 'rgba(212,175,124,0.22)')
  glow.addColorStop(1, 'rgba(212,175,124,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  const cardW = 1820
  const cardH = 580
  const cardX = (W - cardW) / 2
  const cardY = (H - cardH) / 2

  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 50
  ctx.shadowOffsetY = 18
  ctx.fillStyle = IVORY
  roundRect(ctx, cardX, cardY, cardW, cardH, 32)
  ctx.fill()
  ctx.restore()

  strokeRoundRect(ctx, cardX, cardY, cardW, cardH, 32, GOLD, 3)
  strokeRoundRect(ctx, cardX + 14, cardY + 14, cardW - 28, cardH - 28, 22, GOLD_LIGHT, 1.5)

  drawDotPattern(ctx, cardX + 40, cardY + 40, 200, 200, GOLD_DEEP, 24, 1.5, 0.45)
  drawDotPattern(ctx, cardX + cardW - 240, cardY + cardH - 240, 200, 200, GOLD_DEEP, 24, 1.5, 0.45)

  ctx.save()
  ctx.strokeStyle = GOLD
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(W / 2 - 200, cardY + 80)
  ctx.lineTo(W / 2 - 80, cardY + 80)
  ctx.moveTo(W / 2 + 80, cardY + 80)
  ctx.lineTo(W / 2 + 200, cardY + 80)
  ctx.stroke()
  ctx.restore()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = GOLD_DEEP
  ctx.font = `700 32px ${THAI_FONT_FAMILY}, Helvetica, Arial, sans-serif`
  ctx.fillText('PromKep-Tutra · ONBOARDING', W / 2, cardY + 80)

  ctx.fillStyle = INK
  ctx.font = `800 124px ${THAI_FONT_FAMILY}, "Apple Color Emoji", Helvetica, Arial, sans-serif`
  ctx.fillText('ลงทะเบียนเพื่อเริ่มใช้งาน', W / 2, cardY + 220)

  ctx.fillStyle = '#5C6679'
  ctx.font = `400 44px ${THAI_FONT_FAMILY}, Helvetica, Arial, sans-serif`
  ctx.fillText('Tap once to begin · ใช้เวลาไม่ถึง 10 วินาที', W / 2, cardY + 320)

  const pillW = 460
  const pillH = 100
  const pillX = (W - pillW) / 2
  const pillY = cardY + cardH - 150

  ctx.save()
  ctx.shadowColor = 'rgba(168,138,92,0.45)'
  ctx.shadowBlur = 24
  ctx.shadowOffsetY = 8
  const pillGrad = ctx.createLinearGradient(pillX, pillY, pillX + pillW, pillY + pillH)
  pillGrad.addColorStop(0, GOLD_LIGHT)
  pillGrad.addColorStop(0.5, GOLD)
  pillGrad.addColorStop(1, GOLD_DEEP)
  ctx.fillStyle = pillGrad
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2)
  ctx.fill()
  ctx.restore()

  ctx.save()
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2)
  ctx.clip()
  const shine = ctx.createLinearGradient(pillX, pillY, pillX, pillY + pillH * 0.5)
  shine.addColorStop(0, 'rgba(255,255,255,0.45)')
  shine.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = shine
  ctx.fillRect(pillX, pillY, pillW, pillH)
  ctx.restore()

  ctx.fillStyle = INK
  ctx.font = `800 48px ${THAI_FONT_FAMILY}, Helvetica, Arial, sans-serif`
  ctx.textBaseline = 'middle'
  ctx.fillText('เริ่มต้นใช้งาน  →', W / 2, pillY + pillH / 2 + 2)

  ctx.fillStyle = GOLD
  for (const [cx, cy] of [
    [cardX + 40, cardY + 40],
    [cardX + cardW - 40, cardY + 40],
    [cardX + 40, cardY + cardH - 40],
    [cardX + cardW - 40, cardY + cardH - 40],
  ] as Array<[number, number]>) {
    ctx.beginPath()
    ctx.arc(cx, cy, 5, 0, Math.PI * 2)
    ctx.fill()
  }

  const buf = await canvas.encode('png')
  await fs.writeFile(PENDING_IMG, buf)
  console.log(`✓ pending image written ${PENDING_IMG} (${buf.length} bytes)`)
}

async function generateDefaultImage(): Promise<void> {
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  // Top banner: dark gradient
  const topGrad = ctx.createLinearGradient(0, 0, W, HALF_H)
  topGrad.addColorStop(0, '#0E1726')
  topGrad.addColorStop(1, '#1A2540')
  ctx.fillStyle = topGrad
  ctx.fillRect(0, 0, W, HALF_H)

  drawStars(ctx, 60, W, HALF_H, 3)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = GOLD
  ctx.font = `700 52px ${THAI_FONT_FAMILY}, Helvetica, Arial, sans-serif`
  ctx.fillText('PromKep-Tutra', W / 2, HALF_H / 2 - 60)
  ctx.fillStyle = IVORY
  ctx.font = `400 38px ${THAI_FONT_FAMILY}, Helvetica, Arial, sans-serif`
  ctx.fillText('บันทึกการเงินส่วนตัว + QR PromptPay + IOU', W / 2, HALF_H / 2)
  ctx.fillStyle = GOLD_DEEP
  ctx.font = `400 30px ${THAI_FONT_FAMILY}, Helvetica, Arial, sans-serif`
  ctx.fillText('tap banner to open Dashboard', W / 2, HALF_H / 2 + 60)

  // Gold divider
  ctx.fillStyle = GOLD
  ctx.fillRect(0, HALF_H - 3, W, 3)

  // Bottom 3 zones
  const zones = [
    { x: 0, w: THIRD_W, bg: SLATE, label: '+ รายการ', sub: 'บันทึกรายรับ-จ่าย' },
    { x: THIRD_W, w: THIRD_W, bg: TEAL, label: 'ขอเงิน', sub: 'สร้าง PromptPay QR' },
    { x: THIRD_W * 2, w: W - THIRD_W * 2, bg: ROSE, label: 'หนี้', sub: 'ส่งคำขอ IOU' },
  ]

  for (const z of zones) {
    ctx.fillStyle = z.bg
    ctx.fillRect(z.x, HALF_H, z.w, H - HALF_H)

    drawDotPattern(ctx, z.x, HALF_H, z.w, H - HALF_H, '#FFFFFF', 30, 2, 0.08)

    if (z.x > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.15)'
      ctx.fillRect(z.x, HALF_H, 2, H - HALF_H)
    }

    const cx = z.x + z.w / 2
    const cy = HALF_H + (H - HALF_H) / 2

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `800 80px ${THAI_FONT_FAMILY}, "Apple Color Emoji", Helvetica, Arial, sans-serif`
    ctx.fillText(z.label, cx, cy - 40)

    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.font = `400 36px ${THAI_FONT_FAMILY}, Helvetica, Arial, sans-serif`
    ctx.fillText(z.sub, cx, cy + 60)
  }

  ctx.fillStyle = GOLD
  ctx.fillRect(0, H - 3, W, 3)

  const buf = await canvas.encode('png')
  await fs.writeFile(DEFAULT_IMG, buf)
  console.log(`✓ default image written ${DEFAULT_IMG} (${buf.length} bytes)`)
}

interface RichMenuArea {
  bounds: { x: number; y: number; width: number; height: number }
  action: { type: 'uri'; uri: string } | { type: 'message'; text: string }
}

interface RichMenuConfig {
  size: { width: number; height: number }
  selected: boolean
  name: string
  chatBarText: string
  areas: RichMenuArea[]
}

function buildPendingConfig(): RichMenuConfig {
  return {
    size: { width: W, height: H },
    selected: false,
    name: 'promkep-pending',
    chatBarText: 'ลงทะเบียน',
    areas: [
      {
        bounds: { x: 0, y: 0, width: W, height: H },
        action: { type: 'uri', uri: `${WEB_BASE}/register` },
      },
    ],
  }
}

function buildDefaultConfig(): RichMenuConfig {
  return {
    size: { width: W, height: H },
    selected: false,
    name: 'promkep-default',
    chatBarText: 'เมนู',
    areas: DEFAULT_AREAS.map((a) => ({ bounds: a.bounds, action: a.action })),
  }
}

async function callLine(
  method: 'GET' | 'POST' | 'DELETE',
  host: string,
  pathname: string,
  body?: BodyInit,
  contentType?: string,
): Promise<unknown> {
  const headers: Record<string, string> = { Authorization: `Bearer ${ACCESS_TOKEN}` }
  if (contentType) headers['Content-Type'] = contentType
  const res = await fetch(`https://${host}${pathname}`, { method, headers, body })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${host}${pathname} → ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

interface ListedMenu {
  richMenuId: string
  name: string
}

async function listExistingMenus(): Promise<ListedMenu[]> {
  const res = (await callLine('GET', 'api.line.me', '/v2/bot/richmenu/list')) as
    | { richmenus: ListedMenu[] }
    | null
  return res?.richmenus ?? []
}

async function deleteByName(menus: ListedMenu[], name: string): Promise<void> {
  for (const m of menus) {
    if (m.name === name) {
      console.log(`  removing old ${name} ${m.richMenuId}`)
      await callLine('DELETE', 'api.line.me', `/v2/bot/richmenu/${m.richMenuId}`).catch(() => undefined)
    }
  }
}

async function createMenu(config: RichMenuConfig, imagePath: string): Promise<string> {
  const created = (await callLine(
    'POST',
    'api.line.me',
    '/v2/bot/richmenu',
    JSON.stringify(config),
    'application/json',
  )) as { richMenuId: string }

  const png = await fs.readFile(imagePath)
  await callLine(
    'POST',
    'api-data.line.me',
    `/v2/bot/richmenu/${created.richMenuId}/content`,
    png,
    'image/png',
  )
  return created.richMenuId
}

async function unlinkGlobalDefault(): Promise<void> {
  try {
    await callLine('DELETE', 'api.line.me', '/v2/bot/user/all/richmenu')
    console.log('✓ global default rich menu unlinked')
  } catch (err) {
    console.warn('  could not unlink global default (may already be unlinked):', err)
  }
}

async function main() {
  console.log(`web base: ${WEB_BASE}`)

  await fs.mkdir(ASSETS_DIR, { recursive: true })
  await fs.mkdir(CACHE_DIR, { recursive: true })

  await generatePendingImage()
  await generateDefaultImage()

  const existing = await listExistingMenus()
  await deleteByName(existing, 'promkep-pending')
  await deleteByName(existing, 'promkep-default')

  const pendingId = await createMenu(buildPendingConfig(), PENDING_IMG)
  console.log(`✓ created pending menu ${pendingId}`)

  const defaultId = await createMenu(buildDefaultConfig(), DEFAULT_IMG)
  console.log(`✓ created default menu ${defaultId}`)

  await unlinkGlobalDefault()

  const ids = { pendingRichMenuId: pendingId, defaultRichMenuId: defaultId }
  await fs.writeFile(IDS_FILE, JSON.stringify(ids, null, 2) + '\n', 'utf-8')
  console.log(`✓ wrote ${IDS_FILE}`)

  console.log('\ndone — link per user via /v2/bot/user/{userId}/richmenu/{richMenuId}.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
