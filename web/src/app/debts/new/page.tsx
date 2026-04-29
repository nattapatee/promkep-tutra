'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMutation, useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowLeft, Loader2, Search, X } from 'lucide-react'
import { useAuth } from '@/app/providers'
import { api, type ApiUserMini } from '@/lib/api'
import { bangkokLocalToIsoUtc } from '@/lib/format'

export default function NewDebtPage() {
  const router = useRouter()
  const { ready, error, authHeaders, retry } = useAuth()

  const [searchQuery, setSearchQuery] = React.useState('')
  const [selectedUser, setSelectedUser] = React.useState<ApiUserMini | null>(null)
  const [amountBaht, setAmountBaht] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [dueAtLocal, setDueAtLocal] = React.useState('')
  const [submitErr, setSubmitErr] = React.useState<string | null>(null)

  const trimmedQuery = searchQuery.trim()

  const searchResults = useQuery<{ data: ApiUserMini[] }>({
    queryKey: ['users-search', trimmedQuery, authHeaders.lineUserId],
    queryFn: () => api.searchUsers(authHeaders, trimmedQuery),
    enabled: ready && trimmedQuery.length >= 2,
  })

  const createMut = useMutation({
    mutationFn: () =>
      api.createDebt(authHeaders, {
        debtorLineUserId: selectedUser!.lineUserId,
        amountBaht: Number(amountBaht),
        reason: reason.trim() ? reason.trim() : undefined,
        dueAt: dueAtLocal ? bangkokLocalToIsoUtc(dueAtLocal) : undefined,
      }),
    onSuccess: () => router.push('/debts'),
    onError: (e: unknown) =>
      setSubmitErr(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitErr(null)
    if (!selectedUser) {
      setSubmitErr('กรุณาเลือกผู้รับหนี้')
      return
    }
    const amt = Number(amountBaht)
    if (!amt || amt <= 0) {
      setSubmitErr('กรุณากรอกจำนวนเงินที่ถูกต้อง')
      return
    }
    createMut.mutate()
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

  if (!ready) {
    return (
      <div className="flex items-center justify-center p-8 text-zinc-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
      </div>
    )
  }

  const users = searchResults.data?.data ?? []

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/debts"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-rose-600 shadow-sm backdrop-blur"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <motion.h1
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-xl font-bold text-zinc-800"
        >
          ส่งหนี้ใหม่
        </motion.h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Recipient search */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-3xl border border-rose-100/60 bg-white p-4 shadow-[0_4px_20px_rgba(251,113,133,0.10)]"
        >
          <p className="mb-2 text-sm font-semibold text-zinc-700">ผู้รับหนี้</p>

          {selectedUser ? (
            <div className="flex items-center gap-3 rounded-2xl bg-rose-50 p-3">
              {selectedUser.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedUser.avatarUrl}
                  alt={selectedUser.displayName}
                  className="h-10 w-10 rounded-full object-cover ring-2 ring-white"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-amber-500 text-sm font-bold text-white">
                  {selectedUser.displayName[0]}
                </div>
              )}
              <p className="flex-1 text-sm font-semibold text-zinc-800">
                {selectedUser.displayName}
              </p>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-200 text-zinc-500"
                aria-label="Remove recipient"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-2xl border border-rose-100 bg-zinc-50 px-3 py-2.5">
                <Search className="h-4 w-4 shrink-0 text-zinc-400" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อผู้ใช้ (อย่างน้อย 2 ตัวอักษร)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-zinc-400"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {searchResults.isFetching && (
                <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
                  <Loader2 className="h-3 w-3 animate-spin" /> กำลังค้นหา...
                </div>
              )}

              {users.length > 0 && (
                <div className="mt-2 space-y-1">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setSelectedUser(u)
                        setSearchQuery('')
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-rose-50"
                    >
                      {u.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={u.avatarUrl}
                          alt={u.displayName}
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-600">
                          {u.displayName[0]}
                        </div>
                      )}
                      <p className="text-sm font-medium text-zinc-800">{u.displayName}</p>
                    </button>
                  ))}
                </div>
              )}

              {trimmedQuery.length >= 2 &&
                !searchResults.isFetching &&
                users.length === 0 && (
                  <p className="mt-2 text-xs text-zinc-400">ไม่พบผู้ใช้</p>
                )}
            </>
          )}
        </motion.div>

        {/* Amount */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-3xl border border-rose-100/60 bg-white p-5 shadow-[0_4px_20px_rgba(251,113,133,0.10)]"
        >
          <p className="mb-1 text-center text-xs font-medium uppercase tracking-wider text-zinc-500">
            จำนวนเงิน
          </p>
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-2xl font-semibold text-zinc-300">฿</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={amountBaht}
              onChange={(e) => setAmountBaht(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-center text-4xl font-bold text-zinc-800 outline-none placeholder:text-zinc-200"
            />
          </div>
        </motion.div>

        {/* Reason */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <label className="mb-1.5 block text-sm font-semibold text-zinc-700">
            เหตุผล <span className="text-zinc-400">(ไม่บังคับ)</span>
          </label>
          <input
            type="text"
            maxLength={200}
            placeholder="เช่น ค่าอาหารกลางวัน, ค่าโรงแรม"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-2xl border border-rose-100 bg-white px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
        </motion.div>

        {/* Due date */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <label className="mb-1.5 block text-sm font-semibold text-zinc-700">
            ครบกำหนด <span className="text-zinc-400">(ไม่บังคับ)</span>
          </label>
          <input
            type="date"
            value={dueAtLocal}
            onChange={(e) => setDueAtLocal(e.target.value)}
            className="w-full rounded-2xl border border-rose-100 bg-white px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
        </motion.div>

        {submitErr && (
          <div className="rounded-2xl bg-rose-100/80 px-4 py-2 text-sm text-rose-700">
            {submitErr}
          </div>
        )}

        <motion.button
          type="submit"
          disabled={createMut.isPending}
          whileTap={{ scale: 0.97 }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-400 to-amber-500 py-4 text-base font-bold text-white shadow-lg shadow-rose-300/50 transition-all disabled:opacity-60"
        >
          {createMut.isPending ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              กำลังส่ง...
            </>
          ) : (
            'ส่งหนี้'
          )}
        </motion.button>
      </form>
    </div>
  )
}
