import generatePayload from 'promptpay-qr'
import QRCode from 'qrcode'

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
