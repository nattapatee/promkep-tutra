import type { Category } from '@prisma/client'

const MAX_BAHT = 999_999.99

export interface ParsedTransaction {
  sign: '+' | '-'
  amountBaht: number
  categoryRaw: string
  note: string
}

/**
 * Parse a free-form text message into a transaction shape.
 *
 * Grammar:
 *   TXN     := SIGN AMOUNT CATEGORY [NOTE]
 *   SIGN    := '+' | '-'
 *   AMOUNT  := decimal in baht (commas tolerated, e.g. 1,200.50)
 *   CATEGORY:= a single word
 *   NOTE    := remainder (optional)
 *
 * Returns null if the input does not match.
 */
export function parseTransactionText(text: string): ParsedTransaction | null {
  if (!text) return null
  const trimmed = text.trim()
  const m = trimmed.match(/^([+-])\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s+(\S+)(?:\s+([\s\S]*))?$/)
  if (!m) return null
  const [, sign, amountRaw, categoryRaw, noteRaw] = m
  const amountBaht = parseFloat(amountRaw.replace(/,/g, ''))
  if (!Number.isFinite(amountBaht) || amountBaht <= 0) return null
  return {
    sign: sign as '+' | '-',
    amountBaht,
    categoryRaw,
    note: (noteRaw ?? '').trim(),
  }
}

/**
 * Aliases for short tokens that don't fuzzy-match canonical names.
 */
const CATEGORY_ALIASES: Record<string, string> = {
  // expense
  food: 'อาหาร',
  bus: 'เดินทาง',
  taxi: 'เดินทาง',
  grab: 'เดินทาง',
  bts: 'เดินทาง',
  mrt: 'เดินทาง',
  sub: 'Subscription',
  subscription: 'Subscription',
  bill: 'บิล/ค่าน้ำค่าไฟ',
  // income
  salary: 'เงินเดือน',
  side: 'งานเสริม',
  freelance: 'งานเสริม',
}

function normalize(s: string): string {
  return s.normalize('NFC').trim().toLowerCase()
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const prev = new Array<number>(b.length + 1)
  const curr = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]
  }
  return prev[b.length]
}

/**
 * Fuzzy-match a raw token against a list of categories.
 */
export function fuzzyMatchCategory(raw: string, categories: Category[]): Category | null {
  if (!raw || categories.length === 0) return null
  const needle = normalize(raw)

  const aliasTarget = CATEGORY_ALIASES[needle]
  if (aliasTarget) {
    const hit = categories.find((c) => normalize(c.name) === normalize(aliasTarget))
    if (hit) return hit
  }

  for (const c of categories) {
    const name = normalize(c.name)
    if (name === needle || name.includes(needle) || needle.includes(name)) {
      return c
    }
  }

  let best: { cat: Category; dist: number } | null = null
  for (const c of categories) {
    const fragments = normalize(c.name).split(/[\s/]+/).filter(Boolean)
    for (const frag of fragments) {
      const d = levenshtein(needle, frag)
      if (d <= 2 && (best === null || d < best.dist)) {
        best = { cat: c, dist: d }
      }
    }
  }
  return best?.cat ?? null
}

export function isAmountValid(amountBaht: number): boolean {
  return amountBaht > 0 && amountBaht <= MAX_BAHT
}

export const PARSER_LIMITS = { MAX_BAHT } as const

/**
 * Parse "ขอเงิน 250" / "ขอเงิน 250.50" / "ขอเงิน".
 * Returns the amount in baht when supplied, undefined when caller wrote just "ขอเงิน".
 * Returns null when text doesn't start with the keyword.
 */
export function parseAskMoneyCommand(text: string): { amountBaht?: number } | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('ขอเงิน')) return null
  const rest = trimmed.slice('ขอเงิน'.length).trim()
  if (!rest) return {}
  const m = rest.match(/^([0-9][0-9,]*(?:\.[0-9]+)?)/)
  if (!m) return {}
  const amountBaht = parseFloat(m[1].replace(/,/g, ''))
  if (!Number.isFinite(amountBaht) || amountBaht <= 0) return {}
  return { amountBaht }
}

/**
 * Parse "หนี้ 200 reason..." / "หนี้".
 * Returns null when text doesn't start with the keyword.
 */
export function parseDebtCommand(text: string): { amountBaht?: number; reason?: string } | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('หนี้')) return null
  const rest = trimmed.slice('หนี้'.length).trim()
  if (!rest) return {}
  const m = rest.match(/^([0-9][0-9,]*(?:\.[0-9]+)?)\s*([\s\S]*)$/)
  if (!m) return {}
  const amountBaht = parseFloat(m[1].replace(/,/g, ''))
  if (!Number.isFinite(amountBaht) || amountBaht <= 0) return {}
  const reason = (m[2] ?? '').trim() || undefined
  return { amountBaht, reason }
}
