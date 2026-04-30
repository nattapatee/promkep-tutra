/**
 * Build EMV-spec PromptPay QR payload + render PNG buffer.
 * Caller is responsible for storing the PromptPayLink — this file only
 * formats identifiers and produces QR bytes.
 */
import { generate } from 'promptparse'
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
 * Format an identifier the way `promptparse` expects.
 * Phone: 0812345678 → 812345678 (leading 0 stripped; library prepends 66).
 * National ID: passed through untouched.
 */
function formatForQrLib(p: NormalizedPromptPay): { type: 'MSISDN' | 'NATID'; target: string } {
  if (p.kind === 'phone') {
    return { type: 'MSISDN', target: p.identifier.slice(1) }
  }
  return { type: 'NATID', target: p.identifier }
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
  const { type, target } = formatForQrLib(p)
  return generate.anyId({
    type,
    target,
    amount: opts.amountBaht,
  })
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
