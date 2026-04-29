'use client'

import * as React from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Loader2, Plus } from 'lucide-react'
import { useAuth } from '@/app/providers'
import { api, type ApiDebtRequest, type DebtRole, type DebtStatus } from '@/lib/api'
import { formatBaht, formatBangkokDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { PullToRefresh } from '@/components/PullToRefresh'

const STATUS_LABELS: Record<DebtStatus, string> = {
  pending: 'รอดำเนินการ',
  paid: 'ชำระแล้ว',
  rejected: 'ปฏิเสธ',
  later: 'เลื่อนไปก่อน',
}

const STATUS_COLORS: Record<DebtStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  paid: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
  later: 'bg-zinc-100 text-zinc-600',
}

type TabRole = DebtRole | 'all'
type FilterStatus = DebtStatus | 'all'

const TAB_OPTIONS: { value: TabRole; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'creditor', label: 'ฉันส่งหนี้' },
  { value: 'debtor', label: 'ฉันถูกทวง' },
]

const STATUS_FILTERS: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'pending', label: 'รอ' },
  { value: 'paid', label: 'จ่ายแล้ว' },
  { value: 'rejected', label: 'ปฏิเสธ' },
  { value: 'later', label: 'เลื่อน' },
]

export default function DebtsPage() {
  const { ready, error, authHeaders, profile, retry } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = React.useState<TabRole>('all')
  const [statusFilter, setStatusFilter] = React.useState<FilterStatus>('all')

  const queryParams = {
    role: tab === 'all' ? undefined : tab,
    status: statusFilter === 'all' ? undefined : statusFilter,
  }

  const debtsQuery = useQuery<{ data: ApiDebtRequest[] }>({
    queryKey: ['debts', queryParams, authHeaders.lineUserId],
    queryFn: () => api.listDebts(authHeaders, queryParams),
    enabled: ready,
  })

  const updateStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: DebtStatus }) =>
      api.updateDebtStatus(authHeaders, id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['debts'] }),
  })

  async function handleRefresh() {
    await qc.invalidateQueries({ queryKey: ['debts'] })
  }

  if (error) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-rose-600">Auth error: {error}</p>
        <button
          onClick={retry}
          className="rounded-2xl bg-gradient-to-r from-[#FB7185] to-[#F59E0B] px-4 py-2 text-sm font-semibold text-white"
        >
          Retry
        </button>
      </div>
    )
  }

  const debts = debtsQuery.data?.data ?? []

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-800">หนี้สิน</h1>
        <Link
          href="/debts/new"
          className="flex items-center gap-1 rounded-2xl bg-gradient-to-r from-rose-400 to-amber-500 px-4 py-2 text-sm font-bold text-white shadow-md shadow-rose-300/40"
        >
          <Plus className="h-4 w-4" />
          ส่งหนี้
        </Link>
      </div>

      {/* Role tabs */}
      <div className="grid grid-cols-3 gap-1.5 rounded-full bg-rose-100 p-1.5">
        {TAB_OPTIONS.map((t) => {
          const selected = tab === t.value
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={cn(
                'rounded-full py-2 text-xs font-bold transition-all',
                selected
                  ? 'bg-gradient-to-r from-rose-400 to-amber-500 text-white shadow-md'
                  : 'text-rose-700',
              )}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Status filter chips */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {STATUS_FILTERS.map((f) => {
          const selected = statusFilter === f.value
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                'shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition-all',
                selected
                  ? 'bg-gradient-to-r from-rose-400 to-amber-500 text-white shadow-sm'
                  : 'bg-white text-zinc-600 shadow-sm ring-1 ring-rose-100',
              )}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {/* List */}
      <PullToRefresh onRefresh={handleRefresh}>
        {debtsQuery.isLoading ? (
          <div className="flex items-center justify-center py-10 text-zinc-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            กำลังโหลด...
          </div>
        ) : debts.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-3 py-16 text-zinc-400"
          >
            <span className="text-5xl">💸</span>
            <p className="text-sm font-medium">ไม่มีรายการหนี้</p>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {debts.map((d, i) => {
              const isCreditor = d.creditor.lineUserId === profile?.lineUserId
              return (
                <motion.div
                  key={d.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="rounded-3xl border border-rose-100/60 bg-white p-4 shadow-[0_4px_20px_rgba(251,113,133,0.08)]"
                >
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold',
                            isCreditor
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-sky-100 text-sky-700',
                          )}
                        >
                          {isCreditor ? 'ส่งหนี้' : 'ถูกทวง'}
                        </span>
                        <p className="truncate text-sm font-semibold text-zinc-800">
                          {isCreditor ? d.debtor.displayName : d.creditor.displayName}
                        </p>
                      </div>
                      {d.reason && (
                        <p className="mt-1 truncate text-xs text-zinc-500">{d.reason}</p>
                      )}
                      {d.dueAt && (
                        <p className="mt-0.5 text-xs text-zinc-400">
                          ครบกำหนด {formatBangkokDate(d.dueAt, 'dd MMM yyyy')}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <p
                        className={cn(
                          'text-lg font-extrabold',
                          isCreditor ? 'text-rose-600' : 'text-sky-600',
                        )}
                      >
                        ฿{formatBaht(d.amountBaht)}
                      </p>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-bold',
                          STATUS_COLORS[d.status],
                        )}
                      >
                        {STATUS_LABELS[d.status]}
                      </span>
                    </div>
                  </div>

                  {/* Action buttons — only debtor can respond to pending */}
                  {!isCreditor && d.status === 'pending' && (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        disabled={updateStatusMut.isPending}
                        onClick={() => updateStatusMut.mutate({ id: d.id, status: 'paid' })}
                        className="rounded-2xl bg-emerald-500 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-60"
                      >
                        จ่ายแล้ว
                      </button>
                      <button
                        type="button"
                        disabled={updateStatusMut.isPending}
                        onClick={() => updateStatusMut.mutate({ id: d.id, status: 'later' })}
                        className="rounded-2xl bg-zinc-100 py-2 text-xs font-bold text-zinc-700 shadow-sm disabled:opacity-60"
                      >
                        เดี๋ยวก่อน
                      </button>
                      <button
                        type="button"
                        disabled={updateStatusMut.isPending}
                        onClick={() =>
                          updateStatusMut.mutate({ id: d.id, status: 'rejected' })
                        }
                        className="rounded-2xl bg-rose-100 py-2 text-xs font-bold text-rose-700 shadow-sm disabled:opacity-60"
                      >
                        ปฏิเสธ
                      </button>
                    </div>
                  )}

                  <p className="mt-2 text-[10px] text-zinc-400">
                    {formatBangkokDate(d.createdAt, 'dd MMM yyyy HH:mm')}
                  </p>
                </motion.div>
              )
            })}
          </div>
        )}
      </PullToRefresh>

      {/* FAB */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="fixed bottom-24 right-4 z-30 md:bottom-8"
      >
        <Link
          href="/debts/new"
          aria-label="New debt request"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#FB7185] to-[#F59E0B] text-white shadow-lg shadow-rose-300/60 ring-4 ring-white"
        >
          <Plus className="h-6 w-6" />
        </Link>
      </motion.div>
    </div>
  )
}
