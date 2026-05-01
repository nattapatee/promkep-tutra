import { format } from 'date-fns'

const bahtFormatter = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  maximumFractionDigits: 2,
})

export function formatBaht(n: number): string {
  return bahtFormatter.format(n)
}

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000

function toBangkok(d: Date): Date {
  return new Date(d.getTime() + BKK_OFFSET_MS)
}

export function formatBangkokDate(iso: string, pattern = 'yyyy-MM-dd HH:mm'): string {
  return format(toBangkok(new Date(iso)), pattern)
}

export function nowBangkokIsoLocal(): string {
  const bkk = toBangkok(new Date())
  const yyyy = bkk.getUTCFullYear()
  const mm = String(bkk.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(bkk.getUTCDate()).padStart(2, '0')
  const HH = String(bkk.getUTCHours()).padStart(2, '0')
  const MM = String(bkk.getUTCMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${HH}:${MM}`
}

/**
 * Parse a Bangkok-local datetime string and return its UTC ISO equivalent.
 * Accepts both `YYYY-MM-DDTHH:MM` (datetime-local input) and `YYYY-MM-DD`
 * (date input — defaults time to 00:00).
 */
export function bangkokLocalToIsoUtc(local: string): string {
  const [date, time = '00:00'] = local.split('T')
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const bkkAsUtcMs = Date.UTC(y, mo - 1, d, h, mi)
  return new Date(bkkAsUtcMs - BKK_OFFSET_MS).toISOString()
}

export function isoToBangkokLocalInput(iso: string): string {
  const bkk = toBangkok(new Date(iso))
  const yyyy = bkk.getUTCFullYear()
  const mm = String(bkk.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(bkk.getUTCDate()).padStart(2, '0')
  const HH = String(bkk.getUTCHours()).padStart(2, '0')
  const MM = String(bkk.getUTCMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${HH}:${MM}`
}

export function bangkokMonthRangeIso(year: number, month: number): { from: string; to: string } {
  const fromMs = Date.UTC(year, month - 1, 1) - BKK_OFFSET_MS
  const toMs = Date.UTC(year, month, 1) - BKK_OFFSET_MS
  return { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() }
}
