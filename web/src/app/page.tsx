'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
// import {
//   Bar,
//   BarChart,
//   Cell,
//   Pie,
//   PieChart,
//   ResponsiveContainer,
//   Tooltip,
//   XAxis,
//   YAxis,
// } from 'recharts'
import { motion } from 'framer-motion'
import { formatDistanceToNow } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Hash,
  ListOrdered,
  Plus,
  Receipt,
  Sparkles,
  Sun,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useAuth } from './providers'
import { api, type ApiTransaction, type MonthlyReport } from '@/lib/api'
import { Badge, Button, Card, CardContent } from '@/components/ui'
import { PullToRefresh } from '@/components/PullToRefresh'
import { bangkokMonthRangeIso, formatBaht } from '@/lib/format'
import { cn } from '@/lib/cn'

function getCurrentBangkokMonth(): { year: number; month: number } {
  const now = new Date()
  const bkk = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  return { year: bkk.getUTCFullYear(), month: bkk.getUTCMonth() + 1 }
}

function shiftMonthValue(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  let m = month + delta
  let y = year
  while (m > 12) { m -= 12; y += 1 }
  while (m < 1) { m += 12; y -= 1 }
  return { year: y, month: m }
}

function bangkokDayRangeIso(date: Date): { from: string; to: string } {
  const bkk = new Date(date.getTime() + 7 * 60 * 60 * 1000)
  const y = bkk.getUTCFullYear()
  const mo = bkk.getUTCMonth()
  const d = bkk.getUTCDate()
  const fromMs = Date.UTC(y, mo, d) - 7 * 60 * 60 * 1000
  const toMs = fromMs + 24 * 60 * 60 * 1000
  return { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() }
}

function formatRelative(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: th })
  } catch {
    return ''
  }
}

const PIE_EXPENSE_COLORS = ['#FB7185', '#F59E0B', '#A88A5C', '#EF4444', '#F472B6', '#FACC15']
const PIE_INCOME_COLORS = ['#10B981', '#34D399', '#A7F3D0', '#0EA5E9', '#22D3EE', '#A88A5C']
const GOLD = '#A88A5C'
const ELEGANT_CARD_CLS = 'border-amber-100/60 shadow-[0_4px_24px_rgba(168,138,92,0.08)]'

function SectionHeading({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold tracking-[0.04em]" style={{ color: GOLD }}>
          {title}
        </h2>
        <span className="h-[1.5px] w-[60px] rounded-full bg-gradient-to-r from-[#A88A5C] to-[#D9B97A]" />
      </div>
      {action}
    </div>
  )
}

function SkeletonCard({ heightClass = 'h-40' }: { heightClass?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-3xl border border-amber-100/60 bg-white/70',
        heightClass,
      )}
    />
  )
}

interface TrendPoint {
  key: string
  label: string
  income: number
  expense: number
}

function buildTrendData(reports: Array<MonthlyReport | undefined>): TrendPoint[] {
  return reports
    .filter((r): r is MonthlyReport => !!r)
    .map((r) => ({
      key: `${r.year}-${r.month}`,
      label: new Date(Date.UTC(r.year, r.month - 1, 1)).toLocaleDateString('th-TH', {
        month: 'short',
        timeZone: 'UTC',
      }),
      income: r.totalIncomeBaht,
      expense: r.totalExpenseBaht,
    }))
}

function Section({
  index,
  children,
  className,
}: {
  index: number
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.05 * index }}
      className={className}
    >
      {children}
    </motion.section>
  )
}

function HeroStatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex flex-1 flex-col gap-1 rounded-2xl bg-white/15 px-3 py-2 backdrop-blur">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/80">
        {icon}
        {label}
      </span>
      <span className="text-sm font-bold tracking-tight">{value}</span>
    </div>
  )
}

export default function DashboardPage() {
  const { ready, error, authHeaders, retry } = useAuth()
  const queryClient = useQueryClient()
  const initial = React.useMemo(() => getCurrentBangkokMonth(), [])
  const [year, setYear] = React.useState(initial.year)
  const [month, setMonth] = React.useState(initial.month)

  const todayRange = React.useMemo(() => bangkokDayRangeIso(new Date()), [])
  // referenced to satisfy exhaustive-deps but used only for query invalidation
  void bangkokMonthRangeIso(year, month)

  const {
    data,
    isLoading,
    isError,
    error: qError,
    refetch,
  } = useQuery<MonthlyReport>({
    queryKey: ['monthlyReport', year, month, authHeaders.lineUserId],
    queryFn: () => api.monthlyReport(authHeaders, year, month),
    enabled: ready,
  })

  const lastMonth = React.useMemo(() => shiftMonthValue(year, month, -1), [year, month])
  const lastMonthQuery = useQuery<MonthlyReport>({
    queryKey: ['monthlyReport', lastMonth.year, lastMonth.month, authHeaders.lineUserId],
    queryFn: () => api.monthlyReport(authHeaders, lastMonth.year, lastMonth.month),
    enabled: ready,
  })

  const recentQuery = useQuery({
    queryKey: ['recentTransactions', authHeaders.lineUserId],
    queryFn: () => api.listTransactions(authHeaders, { pageSize: 6, page: 1 }),
    enabled: ready,
  })

  const todayQuery = useQuery({
    queryKey: ['todayTransactions', authHeaders.lineUserId, todayRange.from, todayRange.to],
    queryFn: () =>
      api.listTransactions(authHeaders, {
        from: todayRange.from,
        to: todayRange.to,
        pageSize: 100,
      }),
    enabled: ready,
  })

  const trendMonths = React.useMemo(() => {
    const list: { year: number; month: number }[] = []
    for (let i = 5; i >= 0; i--) list.push(shiftMonthValue(year, month, -i))
    return list
  }, [year, month])

  const trendQueries = useQueries({
    queries: trendMonths.map((m) => ({
      queryKey: ['monthlyReport', m.year, m.month, authHeaders.lineUserId],
      queryFn: () => api.monthlyReport(authHeaders, m.year, m.month),
      enabled: ready,
    })),
  })

  const debtsQuery = useQuery({
    queryKey: ['debts', 'pending', authHeaders.lineUserId],
    queryFn: () => api.listDebts(authHeaders, { status: 'pending' }),
    enabled: ready,
  })

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-rose-600">Auth error: {error}</p>
        <Button onClick={retry}>Retry</Button>
      </div>
    )
  }
  if (!ready) return <p className="text-zinc-500">Loading...</p>

  function shiftMonth(delta: number) {
    const next = shiftMonthValue(year, month, delta)
    setYear(next.year)
    setMonth(next.month)
  }

  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('th-TH', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  const expenseCats = (data?.byCategory ?? []).filter((c) => c.type === 'expense')
  const incomeCats = (data?.byCategory ?? []).filter((c) => c.type === 'income')
  const expenseTopFive = [...expenseCats].sort((a, b) => b.totalBaht - a.totalBaht).slice(0, 5)
  const incomeTopFive = [...incomeCats].sort((a, b) => b.totalBaht - a.totalBaht).slice(0, 5)

  const expensePie = expenseTopFive.map((c, i) => ({
    name: c.name,
    value: c.totalBaht,
    fill: PIE_EXPENSE_COLORS[i % PIE_EXPENSE_COLORS.length],
  }))
  const incomePie = incomeTopFive.map((c, i) => ({
    name: c.name,
    value: c.totalBaht,
    fill: PIE_INCOME_COLORS[i % PIE_INCOME_COLORS.length],
  }))

  const totalCount = (data?.byCategory ?? []).reduce((sum, c) => sum + c.count, 0)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const todayBkk = new Date(Date.now() + 7 * 60 * 60 * 1000)
  const isCurrentMonth =
    todayBkk.getUTCFullYear() === year && todayBkk.getUTCMonth() + 1 === month
  const elapsedDays = isCurrentMonth ? todayBkk.getUTCDate() : daysInMonth
  const dailyAvg = elapsedDays > 0 ? (data?.totalExpenseBaht ?? 0) / elapsedDays : 0
  const biggestExpense = expenseTopFive[0]?.totalBaht ?? 0

  const lastNet = lastMonthQuery.data?.netBaht
  const currentNet = data?.netBaht
  let deltaPct: number | null = null
  let deltaImproving = true
  if (typeof lastNet === 'number' && typeof currentNet === 'number') {
    deltaImproving = currentNet > lastNet
    if (Math.abs(lastNet) > 0.01) {
      deltaPct = ((currentNet - lastNet) / Math.abs(lastNet)) * 100
    } else if (currentNet !== 0) {
      deltaPct = currentNet > 0 ? 100 : -100
    } else {
      deltaPct = 0
    }
  }

  const trendData = buildTrendData(trendQueries.map((q) => q.data))

  const todayTxs: ApiTransaction[] = todayQuery.data?.data ?? []
  const todayCount = todayTxs.length
  const todayIncome = todayTxs
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + t.amountBaht, 0)
  const todayExpense = todayTxs
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.amountBaht, 0)
  const todayNet = todayIncome - todayExpense

  const pendingDebtCount = debtsQuery.data?.data.length ?? 0

  async function handleRefresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['monthlyReport'] }),
      queryClient.invalidateQueries({ queryKey: ['recentTransactions'] }),
      queryClient.invalidateQueries({ queryKey: ['todayTransactions'] }),
      queryClient.invalidateQueries({ queryKey: ['debts'] }),
    ])
    await refetch()
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="space-y-6">
        {/* Hero card */}
        <Section index={0}>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-400 via-rose-500 to-amber-500 p-6 text-white shadow-xl shadow-rose-300/40">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-12 -left-6 h-36 w-36 rounded-full bg-amber-300/20 blur-2xl" />
            <div
              className="absolute inset-x-6 top-1/2 h-px"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(217,185,122,0.45), transparent)',
              }}
            />
            <div className="relative">
              <div className="mb-1 flex items-center gap-2 text-sm text-white/80">
                <Sparkles className="h-4 w-4" />
                <span>เดือน {monthLabel}</span>
              </div>
              <p className="text-xs uppercase tracking-wider text-white/70">สุทธิ</p>
              <p className="mt-1 text-4xl font-extrabold tracking-tight [letter-spacing:-0.02em]">
                {formatBaht(currentNet ?? 0)}
              </p>
              {deltaPct !== null && (
                <div
                  className={cn(
                    'mt-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold backdrop-blur',
                    deltaImproving ? 'text-emerald-50' : 'text-rose-50',
                  )}
                >
                  {deltaImproving ? (
                    <TrendingUp className="h-3.5 w-3.5" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {deltaImproving ? '▲' : '▼'} {deltaPct > 0 ? '+' : ''}
                    {deltaPct.toFixed(1)}% จากเดือนก่อน
                  </span>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/30 px-3 py-1 text-xs font-semibold backdrop-blur">
                  <span className="h-2 w-2 rounded-full bg-emerald-200" />
                  รายรับ {formatBaht(data?.totalIncomeBaht ?? 0)}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-400/30 px-3 py-1 text-xs font-semibold backdrop-blur">
                  <span className="h-2 w-2 rounded-full bg-rose-200" />
                  รายจ่าย {formatBaht(data?.totalExpenseBaht ?? 0)}
                </span>
              </div>
              <div className="mt-4 flex gap-2">
                <HeroStatTile
                  icon={<Hash className="h-3 w-3" />}
                  label="# รายการ"
                  value={String(totalCount)}
                />
                <HeroStatTile
                  icon={<CalendarDays className="h-3 w-3" />}
                  label="เฉลี่ย/วัน"
                  value={formatBaht(dailyAvg)}
                />
                <HeroStatTile
                  icon={<Receipt className="h-3 w-3" />}
                  label="ใหญ่สุด"
                  value={formatBaht(biggestExpense)}
                />
              </div>
            </div>
          </div>
        </Section>

        {/* Month picker */}
        <Section index={1}>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => shiftMonth(-1)}
              aria-label="เดือนก่อน"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-rose-600 shadow-sm backdrop-blur hover:bg-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span
              className="rounded-full bg-white/85 px-4 py-1.5 text-sm font-semibold shadow-sm backdrop-blur"
              style={{ color: GOLD }}
            >
              {monthLabel}
            </span>
            <button
              onClick={() => shiftMonth(1)}
              aria-label="เดือนถัดไป"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-rose-600 shadow-sm backdrop-blur hover:bg-white"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </Section>

        {/* Quick actions */}
        <Section index={2}>
          <div className="grid grid-cols-4 gap-2">
            <Button asChild className="h-12 flex-col gap-0.5 text-xs">
              <Link href="/transactions/new">
                <Plus className="h-4 w-4" />
                เพิ่มรายการ
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-12 flex-col gap-0.5 text-xs">
              <Link href="/transactions">
                <ListOrdered className="h-4 w-4" />
                ดูทั้งหมด
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-12 flex-col gap-0.5 text-xs">
              <Link href="/debts/new">
                <CreditCard className="h-4 w-4" />
                ขอเงิน
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-12 flex-col gap-0.5 text-xs">
              <Link href="/debts">
                <CreditCard className="h-4 w-4" />
                หนี้
              </Link>
            </Button>
          </div>
        </Section>

        {isError && (
          <p className="text-rose-600">
            Error: {qError instanceof Error ? qError.message : 'failed'}
          </p>
        )}

        {/* Outstanding debts */}
        {pendingDebtCount > 0 && (
          <Section index={3}>
            <SectionHeading title="หนี้ค้างชำระ" />
            <Link href="/debts">
              <Card className={cn(ELEGANT_CARD_CLS, 'transition-all hover:shadow-md')}>
                <CardContent className="flex items-center justify-between gap-3 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                      <CreditCard className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-xs text-zinc-500">รายการรอดำเนินการ</p>
                      <p className="text-sm font-semibold text-zinc-700">
                        {pendingDebtCount} รายการ
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-zinc-400" />
                </CardContent>
              </Card>
            </Link>
          </Section>
        )}

        {/* Today's snapshot */}
        {todayCount > 0 && (
          <Section index={4}>
            <SectionHeading title="วันนี้" />
            <Card className={ELEGANT_CARD_CLS}>
              <CardContent className="flex items-center justify-between gap-3 py-4">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-sm"
                    style={{ backgroundColor: GOLD }}
                  >
                    <Sun className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs text-zinc-500">บันทึกวันนี้</p>
                    <p className="text-sm font-semibold text-zinc-700">
                      {todayCount} รายการ · สุทธิ{' '}
                      <span
                        className={cn(
                          'font-bold',
                          todayNet >= 0 ? 'text-emerald-600' : 'text-rose-600',
                        )}
                      >
                        {formatBaht(todayNet)}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5 text-[11px]">
                  <span className="text-emerald-600">+ {formatBaht(todayIncome)}</span>
                  <span className="text-rose-600">− {formatBaht(todayExpense)}</span>
                </div>
              </CardContent>
            </Card>
          </Section>
        )}

        {/* 6-month trend — charts temporarily disabled (recharts bug #7160) */}
        <Section index={5}>
          <SectionHeading title="เทรนด์ 6 เดือน" />
          <Card className={ELEGANT_CARD_CLS}>
            <CardContent className="py-6 text-center">
              <p className="text-sm text-zinc-400">กราฟอยู่ระหว่างปรับปรุง</p>
            </CardContent>
          </Card>
        </Section>

        {/* Category breakdown — charts temporarily disabled (recharts bug #7160) */}
        <Section index={6}>
          <SectionHeading title="สัดส่วนตามหมวด" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Card className={ELEGANT_CARD_CLS}>
              <CardContent className="py-6 text-center">
                <p className="text-sm text-zinc-400">กราฟอยู่ระหว่างปรับปรุง</p>
              </CardContent>
            </Card>
            <Card className={ELEGANT_CARD_CLS}>
              <CardContent className="py-6 text-center">
                <p className="text-sm text-zinc-400">กราฟอยู่ระหว่างปรับปรุง</p>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* Top 5 expense */}
        {expenseTopFive.length > 0 && (
          <Section index={7}>
            <SectionHeading title="Top 5 หมวดรายจ่าย" />
            <Card className={ELEGANT_CARD_CLS}>
              <CardContent className="pt-5">
                <ul className="space-y-2">
                  {expenseTopFive.map((c, i) => (
                    <li
                      key={c.categoryId}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{
                            backgroundColor:
                              PIE_EXPENSE_COLORS[i % PIE_EXPENSE_COLORS.length],
                          }}
                        />
                        <span className="text-zinc-700">{c.name}</span>
                        <Badge variant="outline">{c.count}</Badge>
                      </span>
                      <span className="font-semibold text-rose-600">
                        {formatBaht(c.totalBaht)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </Section>
        )}

        {/* Recent transactions */}
        <Section index={8}>
          <SectionHeading
            title="รายการล่าสุด"
            action={
              <Link
                href="/transactions"
                className="flex items-center gap-1 text-xs font-semibold"
                style={{ color: GOLD }}
              >
                ดูทั้งหมด <ArrowRight className="h-3 w-3" />
              </Link>
            }
          />
          {recentQuery.isLoading ? (
            <SkeletonCard heightClass="h-60" />
          ) : (
            <Card className={ELEGANT_CARD_CLS}>
              <CardContent className="pt-3">
                {(recentQuery.data?.data ?? []).length === 0 ? (
                  <p className="py-6 text-center text-sm text-zinc-400">ยังไม่มีรายการ</p>
                ) : (
                  <ul className="divide-y divide-amber-50">
                    {(recentQuery.data?.data ?? []).slice(0, 6).map((t) => (
                      <li key={t.id} className="py-2.5">
                        <Link
                          href={`/transactions/${t.id}`}
                          className="flex items-center gap-3"
                        >
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                t.category.color ??
                                (t.type === 'income' ? '#10B981' : '#FB7185'),
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-zinc-700">
                              {t.title ?? t.category.name}
                            </p>
                            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
                              <span>{t.category.name}</span>
                              <span>·</span>
                              <span>{formatRelative(t.occurredAt)}</span>
                            </p>
                          </div>
                          <span
                            className={cn(
                              'shrink-0 text-sm font-bold tracking-tight tabular-nums',
                              t.type === 'income' ? 'text-emerald-600' : 'text-rose-600',
                            )}
                          >
                            {t.type === 'income' ? '+' : '−'}
                            {formatBaht(t.amountBaht)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </Section>
      </div>
    </PullToRefresh>
  )
}
