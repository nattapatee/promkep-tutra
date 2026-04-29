/**
 * Build EMV-spec PromptPay QR payload + render PNG buffer.
 * Caller is responsible for storing the PromptPayLink — this file only
 * formats identifiers and produces QR bytes.
 */
import generatePayload from 'promptpay-qr'
import QRCode from 'qrcode'

export type PromptPayKind = 'phone' | 'national_id'

const PHONE_RE = /^0\d{9}$/ // Thai mobile, 10 digits starting 0
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

/**
 * Format an identifier the way `promptpay-qr` expects.
 * Phone: 0812345678 → 0066812345678 (international form, leading 0 stripped, +66 prepended).
 * National ID: passed through untouched.
 */
function formatForQrLib(p: NormalizedPromptPay): string {
  if (p.kind === 'phone') {
    return `0066${p.identifier.slice(1)}`
  }
  return p.identifier
}

export interface BuildPromptPayPayloadOpts {
  amountBaht?: number
}

/**
 * EMV QR payload string (the text encoded by the QR image).
 */
export function buildPromptPayPayload(
  p: NormalizedPromptPay,
  opts: BuildPromptPayPayloadOpts = {},
): string {
  const target = formatForQrLib(p)
  if (typeof opts.amountBaht === 'number' && opts.amountBaht > 0) {
    return generatePayload(target, { amount: opts.amountBaht })
  }
  return generatePayload(target, {})
}

/**
 * Render the QR payload as a PNG buffer. Defaults to 512x512, margin 2.
 */
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
