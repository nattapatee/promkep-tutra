import generatePayload from 'promptpay-qr'
import QRCode from 'qrcode'
import { parse as parseEmvCo } from 'promptparse'

export type PromptPayKind = 'phone' | 'national_id'

const PHONE_RE = /^0\d{9}$/
const NATIONAL_ID_RE = /^\d{13}$/

export interface NormalizedPromptPay {
  identifier: string
  kind: PromptPayKind
}

export function normalizePromptPayIdentifier(
  raw: string,
  kind: PromptPayKind,
): NormalizedPromptPay | null {
  const digits = raw.replace(/[^\d]/g, '')
  if (kind === 'phone') {
    if (!PHONE_RE.test(digits)) return null
    return { identifier: digits, kind }
  }
  if (kind === 'national_id') {
    if (!NATIONAL_ID_RE.test(digits)) return null
    return { identifier: digits, kind }
  }
  return null
}

export interface BuildPromptPayPayloadOpts {
  amountBaht?: number
}

export function buildPromptPayPayload(
  p: NormalizedPromptPay,
  opts: BuildPromptPayPayloadOpts = {},
): string {
  const qrOpts: { amount?: number } = {}
  if (opts.amountBaht !== undefined && opts.amountBaht > 0) {
    qrOpts.amount = opts.amountBaht
  }
  return generatePayload(p.identifier, qrOpts)
}

export async function renderPromptPayPng(
  p: NormalizedPromptPay,
  opts: BuildPromptPayPayloadOpts & { sizePx?: number } = {},
): Promise<Buffer> {
  const payload = buildPromptPayPayload(p, opts)
  return QRCode.toBuffer(payload, {
    type: 'png',
    width: opts.sizePx ?? 512,
    margin: 2,
    errorCorrectionLevel: 'M',
  })
}

export function maskIdentifier(p: NormalizedPromptPay): string {
  if (p.kind === 'phone') {
    return `${p.identifier.slice(0, 3)}-XXX-${p.identifier.slice(-4)}`
  }
  return `${p.identifier.slice(0, 1)}-XXXX-XXXXX-${p.identifier.slice(-2)}-X`
}

export interface ParsedPromptPay {
  identifier: string
  kind: PromptPayKind
  amountBaht: number | null
  raw: string
}

/**
 * Parse a PromptPay/EMVCo QR payload string. Returns null when the payload
 * is not a recognizable PromptPay code (wrong format, unsupported account
 * type, or missing identifier).
 *
 * Supports recipient identifier types: phone (sub-tag 01) and national_id
 * (sub-tag 02). e-wallet IDs (sub-tag 03) are out of scope.
 */
export function parsePromptPayPayload(payload: string): ParsedPromptPay | null {
  const cleaned = payload.trim()
  if (!cleaned) return null
  const qr = parseEmvCo(cleaned, false, true)
  if (!qr) return null

  // Tag 29 holds the merchant account info for PromptPay.
  const phoneRaw = qr.getTagValue('29', '01')
  const nationalIdRaw = qr.getTagValue('29', '02')

  let identifier: string | null = null
  let kind: PromptPayKind | null = null

  if (phoneRaw) {
    // Mobile numbers in PromptPay are encoded as 0066 + last-9-digits, with a
    // leading "00" country prefix marker. Normalize back to local 0XXXXXXXXX.
    const digits = phoneRaw.replace(/\D/g, '')
    let local = digits
    if (digits.length === 13 && digits.startsWith('0066')) {
      local = '0' + digits.slice(4)
    } else if (digits.length === 11 && digits.startsWith('66')) {
      local = '0' + digits.slice(2)
    }
    if (PHONE_RE.test(local)) {
      identifier = local
      kind = 'phone'
    }
  } else if (nationalIdRaw) {
    const digits = nationalIdRaw.replace(/\D/g, '')
    if (NATIONAL_ID_RE.test(digits)) {
      identifier = digits
      kind = 'national_id'
    }
  }

  if (!identifier || !kind) return null

  // Tag 54 = transaction amount (string baht with optional decimals).
  const amountRaw = qr.getTagValue('54')
  let amountBaht: number | null = null
  if (amountRaw) {
    const parsed = Number.parseFloat(amountRaw)
    if (Number.isFinite(parsed) && parsed > 0) amountBaht = parsed
  }

  return { identifier, kind, amountBaht, raw: cleaned }
}
