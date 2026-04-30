'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Loader2,
  Users,
  Receipt,
  CreditCard,
  Trash2,
  LogOut,
  Crown,
  User,
} from 'lucide-react'
import { useAuth } from '@/app/providers'
import { api, type ApiGroupMember, type ApiTransaction, type ApiDebtRequest } from '@/lib/api'
import { MascotButton } from '@/components/MascotButton'
import { MascotCard } from '@/components/MascotCard'
import { Card, CardContent, Badge } from '@/components/ui'
import { PullToRefresh } from '@/components/PullToRefresh'
import { formatBaht, formatBangkokDate } from '@/lib/format'
import { cn } from '@/lib/cn'

type Tab = 'members' | 'transactions' | 'debts'

const TAB_OPTIONS: { value: Tab; label: string; icon: React.ElementType }[] = [
  { value: 'members', label: 'สมาชิก', icon: Users },
  { value: 'transactions', label: 'รายการ', icon: Receipt },
  { value: 'debts', label: 'หนี้', icon: CreditCard },
]

export default function GroupDetailPage() {
  const router = useRouter()
  const params = useParams()
  const groupId = String(params.id)
  const { ready, error, authHeaders, profile, retry } = useAuth()
  const queryClient = useQueryClient()
  const [tab, setTab] = React.useState<Tab>('members')
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false)

  const groupQuery = useQuery({
    queryKey: ['group', groupId, authHeaders.lineUserId],
    queryFn: () => api.getGroup(authHeaders, groupId),
    enabled: ready && !!groupId,
  })

  const membersQuery = useQuery({
    queryKey: ['group-members', groupId, authHeaders.lineUserId],
    queryFn: () => api.getGroupMembers(authHeaders, groupId),
    enabled: ready && !!groupId,
  })

  const transactionsQuery = useQuery({
    queryKey: ['transactions', 'group', groupId, authHeaders.lineUserId],
    queryFn: () => api.listTransactions(authHeaders, { groupId, pageSize: 50 }),
    enabled: ready && !!groupId && tab === 'transactions',
  })

  const debtsQuery = useQuery({
    queryKey: ['debts', 'group', groupId, authHeaders.lineUserId],
    queryFn: () => api.listDebts(authHeaders, { groupId }),
    enabled: ready && !!groupId && tab === 'debts',
  })

  const leaveMut = useMutation({
    mutationFn: () => api.leaveGroup(authHeaders, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      router.push('/groups')
    },
    onError: (e: unknown) => {
      alert(e instanceof Error ? e.message : 'ไม่สามารถออกจากกลุ่มได้')
    },
  })

  const deleteMut = useMutation({
    mutationFn: () => api.deleteGroup(authHeaders, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      router.push('/groups')
    },
    onError: (e: unknown) => {
      alert(e instanceof Error ? e.message : 'ไม่สามารถลบกลุ่มได้')
    },
  })

  async function handleRefresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['group', groupId] }),
      queryClient.invalidateQueries({ queryKey: ['group-members', groupId] }),
      queryClient.invalidateQueries({ queryKey: ['transactions', 'group', groupId] }),
      queryClient.invalidateQueries({ queryKey: ['debts', 'group', groupId] }),
    ])
  }

  if (error) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-rose-600">Auth error: {error}</p>
        <MascotButton onClick={retry}>Retry</MascotButton>
      </div>
    )
  }

  if (!ready || groupQuery.isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-zinc-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
      </div>
    )
  }

  const group = groupQuery.data
  const members = membersQuery.data?.members ?? []
  const transactions = transactionsQuery.data?.data ?? []
  const debts = debtsQuery.data?.data ?? []

  const isAdmin = group?.isAdmin ?? false
  const isOnlyAdmin = isAdmin && members.filter((m) => m.role === 'admin').length <= 1

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <Link
          href="/groups"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-rose-600 shadow-sm backdrop-blur"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <motion.h1
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          className="min-w-0 flex-1 truncate text-xl font-bold text-zinc-800"
        >
          {group?.name ?? 'กลุ่ม'}
        </motion.h1>
      </div>

      {group && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <MascotCard className="relative overflow-hidden">
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-accent-pink/10 blur-2xl" />
            <div className="relative space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500">รหัสกลุ่ม</p>
                  <p className="text-2xl font-extrabold tracking-widest text-dark">{group.code}</p>
                </div>
                <div className="flex items-center gap-1.5 rounded-full bg-bg-warm px-3 py-1.5 text-xs font-semibold text-dark">
                  <Users className="h-3.5 w-3.5" />
                  {group.memberCount} คน
                </div>
              </div>
              <div className="flex gap-2">
                {!isOnlyAdmin && (
                  <MascotButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    disabled={leaveMut.isPending}
                    onClick={() => {
                      if (window.confirm('ต้องการออกจากกลุ่มนี้หรือไม่?')) {
                        leaveMut.mutate()
                      }
                    }}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    ออกจากกลุ่ม
                  </MascotButton>
                )}
                {isAdmin && (
                  <MascotButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="flex-1 border-rose-200 text-rose-600 hover:bg-rose-50"
                    disabled={deleteMut.isPending}
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    ลบกลุ่ม
                  </MascotButton>
                )}
              </div>
            </div>
          </MascotCard>
        </motion.div>
      )}

      {groupQuery.isError && (
        <p className="text-rose-600">
          Error: {groupQuery.error instanceof Error ? groupQuery.error.message : 'failed'}
        </p>
      )}

      <div className="grid grid-cols-3 gap-1.5 rounded-full bg-rose-100 p-1.5">
        {TAB_OPTIONS.map((t) => {
          const selected = tab === t.value
          const Icon = t.icon
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={cn(
                'flex items-center justify-center gap-1 rounded-full py-2 text-xs font-bold transition-all',
                selected
                  ? 'bg-gradient-to-r from-rose-400 to-amber-500 text-white shadow-md'
                  : 'text-rose-700',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          )
        })}
      </div>

      <PullToRefresh onRefresh={handleRefresh}>
        <AnimatePresence mode="wait">
          {tab === 'members' && (
            <motion.div
              key="members"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="space-y-3"
            >
              {membersQuery.isLoading ? (
                <div className="flex items-center justify-center py-10 text-zinc-400">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  กำลังโหลด...
                </div>
              ) : membersQuery.isError ? (
                <p className="text-rose-600">
                  Error: {membersQuery.error instanceof Error ? membersQuery.error.message : 'failed'}
                </p>
              ) : (
                <div className="space-y-2">
                  {members.map((member, i) => (
                    <motion.div
                      key={member.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <MemberRow member={member} isCurrentUser={member.userId === profile?.lineUserId} />
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {tab === 'transactions' && (
            <motion.div
              key="transactions"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="space-y-3"
            >
              {transactionsQuery.isLoading ? (
                <div className="flex items-center justify-center py-10 text-zinc-400">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  กำลังโหลด...
                </div>
              ) : transactionsQuery.isError ? (
                <p className="text-rose-600">
                  Error: {transactionsQuery.error instanceof Error ? transactionsQuery.error.message : 'failed'}
                </p>
              ) : transactions.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-zinc-400">
                  <Receipt className="h-10 w-10" />
                  <p className="text-sm font-medium">ไม่มีรายการในกลุ่มนี้</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {transactions.map((t, i) => (
                    <motion.div
                      key={t.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <TransactionRow transaction={t} />
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {tab === 'debts' && (
            <motion.div
              key="debts"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="space-y-3"
            >
              {debtsQuery.isLoading ? (
                <div className="flex items-center justify-center py-10 text-zinc-400">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  กำลังโหลด...
                </div>
              ) : debtsQuery.isError ? (
                <p className="text-rose-600">
                  Error: {debtsQuery.error instanceof Error ? debtsQuery.error.message : 'failed'}
                </p>
              ) : debts.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-zinc-400">
                  <CreditCard className="h-10 w-10" />
                  <p className="text-sm font-medium">ไม่มีรายการหนี้ในกลุ่มนี้</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {debts.map((d, i) => (
                    <motion.div
                      key={d.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <DebtRow debt={d} currentUserId={profile?.lineUserId ?? ''} />
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </PullToRefresh>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
              <Trash2 className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-zinc-800">ลบกลุ่ม?</h3>
            <p className="mt-1 text-sm text-zinc-500">
              การดำเนินการนี้ไม่สามารถย้อนกลับได้ รายการทั้งหมดในกลุ่มจะถูกลบ
            </p>
            <div className="mt-5 flex gap-3">
              <MascotButton
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => setShowDeleteConfirm(false)}
              >
                ยกเลิก
              </MascotButton>
              <MascotButton
                type="button"
                className="flex-1 bg-rose-500 text-white shadow-rose-200/50 hover:bg-rose-600"
                disabled={deleteMut.isPending}
                onClick={() => deleteMut.mutate()}
              >
                {deleteMut.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    กำลังลบ...
                  </>
                ) : (
                  'ลบกลุ่ม'
                )}
              </MascotButton>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

function MemberRow({ member, isCurrentUser }: { member: ApiGroupMember; isCurrentUser: boolean }) {
  return (
    <Card className={cn(isCurrentUser && 'border-secondary-green/40 ring-1 ring-secondary-green/20')}>
      <CardContent className="flex items-center gap-3 py-3">
        {member.avatarUrl ? (
          <img
            src={member.avatarUrl}
            alt={member.displayName}
            className="h-10 w-10 rounded-full object-cover ring-2 ring-white"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-amber-500 text-sm font-bold text-white">
            {member.displayName[0]}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-zinc-800">
            {member.displayName}
            {isCurrentUser && (
              <span className="ml-1.5 text-[10px] font-normal text-zinc-400">(คุณ)</span>
            )}
          </p>
          <p className="text-xs text-zinc-400">
            เข้าร่วม {formatBangkokDate(member.joinedAt, 'dd MMM yyyy')}
          </p>
        </div>
        <Badge
          variant={member.role === 'admin' ? 'pending' : 'default'}
          className="shrink-0"
        >
          {member.role === 'admin' ? (
            <span className="flex items-center gap-1">
              <Crown className="h-3 w-3" />
              แอดมิน
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              สมาชิก
            </span>
          )}
        </Badge>
      </CardContent>
    </Card>
  )
}

function TransactionRow({ transaction }: { transaction: ApiTransaction }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold text-white shadow-sm"
            style={{
              backgroundColor:
                transaction.category.color ??
                (transaction.type === 'income' ? '#10B981' : '#FB7185'),
            }}
          >
            {transaction.category.name[0]}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-800">
              {transaction.title ?? transaction.category.name}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {transaction.category.name} · {formatBangkokDate(transaction.occurredAt, 'dd MMM HH:mm')}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p
            className={cn(
              'text-base font-bold',
              transaction.type === 'income' ? 'text-emerald-600' : 'text-rose-600',
            )}
          >
            {transaction.type === 'income' ? '+' : '−'}
            {formatBaht(transaction.amountBaht)}
          </p>
          <Badge variant={transaction.type} className="mt-0.5">
            {transaction.type === 'income' ? 'รับ' : 'จ่าย'}
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}

const STATUS_LABELS: Record<ApiDebtRequest['status'], string> = {
  pending: 'รอดำเนินการ',
  paid: 'ชำระแล้ว',
  rejected: 'ปฏิเสธ',
  later: 'เลื่อนไปก่อน',
}

const STATUS_COLORS: Record<ApiDebtRequest['status'], string> = {
  pending: 'bg-amber-100 text-amber-700',
  paid: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
  later: 'bg-zinc-100 text-zinc-600',
}

function DebtRow({ debt, currentUserId }: { debt: ApiDebtRequest; currentUserId: string }) {
  const isCreditor = debt.creditor.lineUserId === currentUserId
  return (
    <div className="rounded-3xl border border-rose-100/60 bg-white p-4 shadow-[0_4px_20px_rgba(251,113,133,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold',
                isCreditor ? 'bg-rose-100 text-rose-700' : 'bg-sky-100 text-sky-700',
              )}
            >
              {isCreditor ? 'ส่งหนี้' : 'ถูกทวง'}
            </span>
            <p className="truncate text-sm font-semibold text-zinc-800">
              {isCreditor ? debt.debtor.displayName : debt.creditor.displayName}
            </p>
          </div>
          {debt.reason && (
            <p className="mt-1 truncate text-xs text-zinc-500">{debt.reason}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <p className={cn('text-lg font-extrabold', isCreditor ? 'text-rose-600' : 'text-sky-600')}>
            ฿{formatBaht(debt.amountBaht)}
          </p>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-bold',
              STATUS_COLORS[debt.status],
            )}
          >
            {STATUS_LABELS[debt.status]}
          </span>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-zinc-400">
        {formatBangkokDate(debt.createdAt, 'dd MMM yyyy HH:mm')}
      </p>
    </div>
  )
}
