'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Download, Inbox, Paperclip, Plus, RefreshCw } from 'lucide-react'
import { useAuth } from '@/app/providers'
import { api, type ApiCategory } from '@/lib/api'
import { Badge, Button, Card, CardContent } from '@/components/ui'
import { PullToRefresh } from '@/components/PullToRefresh'
import { formatBaht, formatBangkokDate, bangkokMonthRangeIso } from '@/lib/format'
import { cn } from '@/lib/cn'

type RangeKey = 'all' | 'week' | 'this' | 'last' | 'custom'

function getCurrentBangkokMonth(): { year: number; month: number } {
  const now = new Date()
  const bkk = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  return { year: bkk.getUTCFullYear(), month: bkk.getUTCMonth() + 1 }
}

function rangeFor(
  key: RangeKey,
  custom: { from: string; to: string },
): { from: string; to: string } {
  const cur = getCurrentBangkokMonth()
  if (key === 'custom') return custom
  if (key === 'all') return { from: '', to: '' }
  if (key === 'this') return bangkokMonthRangeIso(cur.year, cur.month)
  if (key === 'week') {
    const now = new Date()
    const bkkNow = new Date(now.getTime() + 7 * 60 * 60 * 1000)
    const dow = bkkNow.getUTCDay()
    const startOfWeek = new Date(bkkNow)
    startOfWeek.setUTCDate(bkkNow.getUTCDate() - dow)
    startOfWeek.setUTCHours(0, 0, 0, 0)
    const fromMs = startOfWeek.getTime() - 7 * 60 * 60 * 1000
    const toMs = fromMs + 7 * 24 * 60 * 60 * 1000
    return { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() }
  }
  let y = cur.year
  let m = cur.month - 1
  if (m < 1) { m = 12; y -= 1 }
  return bangkokMonthRangeIso(y, m)
}

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'week', label: 'สัปดาห์นี้' },
  { key: 'this', label: 'เดือนนี้' },
  { key: 'last', label: 'เดือนก่อน' },
  { key: 'custom', label: 'กำหนดเอง' },
]

const PAGE_SIZE = 20

export default function TransactionsPage() {
  const { ready, error, authHeaders, retry } = useAuth()
  const queryClient = useQueryClient()
  const [rangeKey, setRangeKey] = React.useState<RangeKey>('this')
  const [customFrom, setCustomFrom] = React.useState('')
  const [customTo, setCustomTo] = React.useState('')
  const [type, setType] = React.useState<'all' | 'income' | 'expense'>('all')
  const [categoryId, setCategoryId] = React.useState<number | ''>('')
  const [page, setPage] = React.useState(1)
  const [exportErr, setExportErr] = React.useState<string | null>(null)
  const [exporting, setExporting] = React.useState(false)

  const { data: categories } = useQuery<ApiCategory[]>({
    queryKey: ['categories'],
    queryFn: () => api.listCategories(),
    enabled: ready,
  })

  const customRange = React.useMemo(() => {
    const from = customFrom ? new Date(customFrom).toISOString() : ''
    const to = customTo ? new Date(customTo).toISOString() : ''
    return { from, to }
  }, [customFrom, customTo])

  const { from, to } = rangeFor(rangeKey, customRange)

  const txQuery = useQuery({
    queryKey: ['transactions', from, to, type, categoryId, page, authHeaders.lineUserId],
    queryFn: () =>
      api.listTransactions(authHeaders, {
        from: from || undefined,
        to: to || undefined,
        type: type === 'all' ? undefined : type,
        categoryId: typeof categoryId === 'number' ? categoryId : undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    enabled: ready && (rangeKey !== 'custom' || (!!from && !!to)),
  })

  async function exportCsv() {
    if (!from || !to) return
    setExportErr(null)
    setExporting(true)
    try {
      const url = `${api.base}/transactions/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      const headers: Record<string, string> = {}
      if (authHeaders.bearer) headers['authorization'] = `Bearer ${authHeaders.bearer}`
      if (authHeaders.lineUserId) headers['x-line-user-id'] = authHeaders.lineUserId
      if (authHeaders.displayName) headers['x-line-display-name'] = authHeaders.displayName
      const res = await fetch(url, { headers })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`api error ${res.status}: ${body}`)
      }
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = `promkep-${from.slice(0, 10)}_${to.slice(0, 10)}.csv`
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch (err) {
      setExportErr(err instanceof Error ? err.message : 'export failed')
    } finally {
      setExporting(false)
    }
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-rose-600">Auth error: {error}</p>
        <Button onClick={retry}>Retry</Button>
      </div>
    )
  }
  if (!ready) return <p className="text-zinc-500">Loading...</p>

  const filteredCategories =
    type === 'all' ? categories ?? [] : (categories ?? []).filter((c) => c.type === type)

  const total = txQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  async function handleRefresh() {
    await queryClient.invalidateQueries({ queryKey: ['transactions'] })
    await txQuery.refetch()
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-800">รายการ</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={txQuery.isFetching}
              aria-label="Refresh"
            >
              <RefreshCw className={cn('h-4 w-4', txQuery.isFetching && 'animate-spin')} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={!from || !to || exporting}
            >
              <Download className="h-4 w-4" /> {exporting ? 'กำลังส่งออก...' : 'CSV'}
            </Button>
          </div>
        </div>
        {exportErr && <p className="text-sm text-rose-600">CSV export error: {exportErr}</p>}

        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => { setRangeKey(opt.key); setPage(1) }}
              className={cn(
                'shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all',
                rangeKey === opt.key
                  ? 'bg-gradient-to-r from-[#FB7185] to-[#F59E0B] text-white shadow-md shadow-rose-200/50'
                  : 'border border-rose-100 bg-white/80 text-rose-700 backdrop-blur',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {rangeKey === 'custom' && (
          <Card>
            <CardContent className="pt-5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-zinc-600">From</label>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-rose-100 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-600">To</label>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-rose-100 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-2">
          <select
            className="h-10 flex-1 rounded-2xl border border-rose-100 bg-white px-3 text-sm"
            value={type}
            onChange={(e) => {
              setType(e.target.value as typeof type)
              setCategoryId('')
              setPage(1)
            }}
          >
            <option value="all">ประเภท: ทั้งหมด</option>
            <option value="income">รายรับ</option>
            <option value="expense">รายจ่าย</option>
          </select>
          <select
            className="h-10 flex-1 rounded-2xl border border-rose-100 bg-white px-3 text-sm"
            value={categoryId === '' ? '' : String(categoryId)}
            onChange={(e) => {
              setCategoryId(e.target.value === '' ? '' : Number(e.target.value))
              setPage(1)
            }}
          >
            <option value="">หมวดหมู่: ทั้งหมด</option>
            {filteredCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {txQuery.isLoading && <p className="text-zinc-500">Loading...</p>}
        {txQuery.isError && (
          <p className="text-rose-600">
            Error: {txQuery.error instanceof Error ? txQuery.error.message : 'failed'}
          </p>
        )}

        {txQuery.data && (
          <>
            {txQuery.data.data.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-500">
                    <Inbox className="h-8 w-8" />
                  </div>
                  <p className="text-sm font-medium text-zinc-600">ยังไม่มีรายการ</p>
                  <Button asChild size="sm">
                    <Link href="/transactions/new">
                      <Plus className="h-4 w-4" /> เพิ่มรายการแรก
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <ul className="space-y-2">
                {txQuery.data.data.map((t, i) => (
                  <motion.li
                    key={t.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: Math.min(i * 0.02, 0.2) }}
                  >
                    <Link href={`/transactions/${t.id}`}>
                      <Card className="transition-all hover:shadow-md">
                        <CardContent className="flex items-center justify-between gap-3 py-4">
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <span
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold text-white shadow-sm"
                              style={{
                                backgroundColor:
                                  t.category.color ??
                                  (t.type === 'income' ? '#10B981' : '#FB7185'),
                              }}
                            >
                              {t.category.name[0]}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-zinc-800">
                                {t.title ?? t.category.name}
                              </p>
                              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                                <span>{t.category.name}</span>
                                <span>·</span>
                                <span>{formatBangkokDate(t.occurredAt, 'dd MMM HH:mm')}</span>
                                {t.attachments.length > 0 && (
                                  <span className="flex items-center gap-0.5">
                                    <Paperclip className="h-3 w-3" />
                                    {t.attachments.length}
                                  </span>
                                )}
                              </p>
                              {t.note && (
                                <p className="mt-0.5 truncate text-xs text-zinc-400">{t.note}</p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p
                              className={cn(
                                'text-base font-bold',
                                t.type === 'income' ? 'text-emerald-600' : 'text-rose-600',
                              )}
                            >
                              {t.type === 'income' ? '+' : '−'}
                              {formatBaht(t.amountBaht)}
                            </p>
                            <Badge variant={t.type} className="mt-0.5">
                              {t.type === 'income' ? 'รับ' : 'จ่าย'}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </motion.li>
                ))}
              </ul>
            )}

            {total > PAGE_SIZE && (
              <div className="flex items-center justify-between text-sm">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Prev
                </Button>
                <span className="text-zinc-500">
                  {page} / {totalPages} ({total} total)
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </PullToRefresh>
  )
}
