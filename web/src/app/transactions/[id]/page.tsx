'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Calendar,
  Check,
  ImagePlus,
  Loader2,
  Pencil,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react'
import { useAuth } from '@/app/providers'
import {
  api,
  type ApiAttachment,
  type ApiCategory,
  type ApiTransaction,
  type ApiUser,
  type AuthHeaders,
} from '@/lib/api'
import {
  bangkokLocalToIsoUtc,
  formatBaht,
  formatBangkokDate,
  isoToBangkokLocalInput,
} from '@/lib/format'
import { cn } from '@/lib/cn'

type UpdateBody = Partial<{
  type: 'income' | 'expense'
  amountBaht: number
  categoryId: number
  occurredAt: string
  title: string | null
  note: string | null
}>

export default function TransactionDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()
  const qc = useQueryClient()
  const { ready, error, authHeaders, profile, retry } = useAuth()
  const [editing, setEditing] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [previewAttachmentId, setPreviewAttachmentId] = React.useState<string | null>(null)

  const txQuery = useQuery<ApiTransaction>({
    queryKey: ['transaction', id, authHeaders.lineUserId],
    queryFn: () => api.getTransaction(authHeaders, id),
    enabled: ready && !!id,
  })

  const meQuery = useQuery<ApiUser>({
    queryKey: ['me', authHeaders.lineUserId],
    queryFn: () => api.me(authHeaders),
    enabled: ready,
  })

  const { data: categories } = useQuery<ApiCategory[]>({
    queryKey: ['categories'],
    queryFn: () => api.listCategories(),
    enabled: ready,
  })

  const updateMut = useMutation({
    mutationFn: (body: UpdateBody) => api.updateTransaction(authHeaders, id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transaction', id] })
      setEditing(false)
    },
  })

  const deleteMut = useMutation({
    mutationFn: () => api.deleteTransaction(authHeaders, id),
    onSuccess: () => router.push('/transactions'),
  })

  const deleteAttachMut = useMutation({
    mutationFn: (attachmentId: string) => api.deleteAttachment(authHeaders, attachmentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transaction', id] }),
  })

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
  if (!ready || txQuery.isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-zinc-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
      </div>
    )
  }
  if (txQuery.isError || !txQuery.data) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-rose-600">
          {txQuery.error instanceof Error ? txQuery.error.message : 'not found'}
        </p>
        <Link
          href="/transactions"
          className="inline-flex items-center gap-1 rounded-2xl bg-white/80 px-3 py-2 text-sm text-rose-700"
        >
          <ArrowLeft className="h-4 w-4" /> ย้อนกลับ
        </Link>
      </div>
    )
  }

  const t = txQuery.data
  const isOwner = profile?.lineUserId === t.createdBy.lineUserId
  const isAdmin = meQuery.data?.role === 'admin'
  const canEdit = isOwner || isAdmin

  const heroBg = t.category.color ?? (t.type === 'income' ? '#10B981' : '#FB7185')
  const previewAttachment = t.attachments.find((a) => a.id === previewAttachmentId) ?? null

  return (
    <div data-testid="transaction-detail-page" className="space-y-5 pb-24">
      <div className="flex items-center justify-between">
        <Link
          href="/transactions"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-rose-600 shadow-sm backdrop-blur"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        {editing && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-zinc-600 shadow-sm"
          >
            ยกเลิก
          </button>
        )}
      </div>

      {!editing ? (
        <>
          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="relative overflow-hidden rounded-3xl p-6 text-white shadow-xl"
            style={{ backgroundColor: heroBg }}
          >
            <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-10 -left-6 h-32 w-32 rounded-full bg-white/10 blur-2xl" />

            <div className="relative">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-2xl font-bold leading-tight">
                    {t.title ?? t.category.name}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-wider text-white/70">
                    หมวด · {t.category.name}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-white/25 px-3 py-1 text-xs font-bold backdrop-blur">
                  {t.type === 'income' ? 'รายรับ' : 'รายจ่าย'}
                </span>
              </div>

              <p className="mt-4 text-center text-5xl font-extrabold tracking-tight">
                {t.type === 'income' ? '+' : '−'}
                {formatBaht(t.amountBaht)}
              </p>
            </div>
          </motion.div>

          {/* Meta */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-3xl border border-rose-100/60 bg-white p-5 shadow-[0_4px_20px_rgba(251,113,133,0.10)]"
          >
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
                  <Calendar className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs text-zinc-500">เกิดขึ้นเมื่อ</p>
                  <p className="font-semibold text-zinc-800">
                    {formatBangkokDate(t.occurredAt, 'dd MMM yyyy HH:mm')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {t.createdBy.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.createdBy.avatarUrl}
                    alt={t.createdBy.displayName}
                    className="h-9 w-9 rounded-2xl object-cover"
                  />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                    <UserIcon className="h-4 w-4" />
                  </span>
                )}
                <div>
                  <p className="text-xs text-zinc-500">บันทึกโดย</p>
                  <p className="font-semibold text-zinc-800">{t.createdBy.displayName}</p>
                </div>
              </div>
              <p className="pt-1 text-xs text-zinc-400">
                สร้างเมื่อ {formatBangkokDate(t.createdAt, 'dd MMM yyyy HH:mm')}
              </p>
            </div>
          </motion.div>

          {/* Note */}
          {t.note && (
            <div className="rounded-3xl border border-rose-100/60 bg-white p-5 shadow-[0_4px_20px_rgba(251,113,133,0.10)]">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                โน้ต
              </p>
              <p className="whitespace-pre-wrap text-sm text-zinc-700">{t.note}</p>
            </div>
          )}

          {/* Attachments */}
          <div className="rounded-3xl border border-rose-100/60 bg-white p-5 shadow-[0_4px_20px_rgba(251,113,133,0.10)]">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              รูปภาพ ({t.attachments.length})
            </p>
            {t.attachments.length === 0 ? (
              <p className="text-sm text-zinc-400">ไม่มีรูปแนบ</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 md:grid-cols-4">
                {t.attachments.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setPreviewAttachmentId(a.id)}
                    className="group relative aspect-square overflow-hidden rounded-2xl border border-rose-100 bg-zinc-50 shadow-sm"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={api.attachmentFileUrl(a.id)}
                      alt={a.filename}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <EditForm
          tx={t}
          categories={categories ?? []}
          onCancel={() => setEditing(false)}
          onSubmit={(body) => updateMut.mutate(body)}
          submitting={updateMut.isPending}
          err={updateMut.error instanceof Error ? updateMut.error.message : null}
          authHeaders={authHeaders}
          onUploaded={() => qc.invalidateQueries({ queryKey: ['transaction', id] })}
          onDeleteAttachment={(attId) => deleteAttachMut.mutate(attId)}
          isOwnerOrAdmin={canEdit}
        />
      )}

      {/* FAB pair */}
      {canEdit && !editing && (
        <div className="fixed bottom-24 right-4 z-30 flex flex-col gap-2 md:bottom-8">
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={() => setEditing(true)}
            aria-label="Edit"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#FB7185] to-[#F59E0B] text-white shadow-lg shadow-rose-300/60 ring-4 ring-white"
          >
            <Pencil className="h-5 w-5" />
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 text-white shadow-lg ring-4 ring-white"
          >
            <Trash2 className="h-5 w-5" />
          </motion.button>
        </div>
      )}

      {/* Confirm delete dialog */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/60 p-4 backdrop-blur"
            onClick={() => setConfirmDelete(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 28 }}
              className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100">
                <Trash2 className="h-6 w-6 text-rose-500" />
              </div>
              <h2 className="text-lg font-bold text-zinc-800">ลบรายการนี้?</h2>
              <p className="mt-1 text-sm text-zinc-600">
                การลบไม่สามารถย้อนกลับได้ รายการและรูปแนบทั้งหมดจะถูกลบถาวร
              </p>
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 rounded-2xl bg-zinc-100 py-3 text-sm font-semibold text-zinc-700"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={deleteMut.isPending}
                  onClick={() => deleteMut.mutate()}
                  className="flex-1 rounded-2xl bg-rose-500 py-3 text-sm font-semibold text-white shadow-md disabled:opacity-60"
                >
                  {deleteMut.isPending ? 'กำลังลบ...' : 'ลบเลย'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Attachment preview modal */}
      <AnimatePresence>
        {previewAttachment && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
            onClick={() => setPreviewAttachmentId(null)}
          >
            <button
              type="button"
              onClick={() => setPreviewAttachmentId(null)}
              aria-label="Close"
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
            >
              <X className="h-5 w-5" />
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm('ลบรูปนี้?')) {
                    deleteAttachMut.mutate(previewAttachment.id)
                    setPreviewAttachmentId(null)
                  }
                }}
                className="absolute left-4 top-4 flex h-10 items-center gap-1 rounded-full bg-rose-500/90 px-4 text-sm font-semibold text-white shadow"
              >
                <Trash2 className="h-4 w-4" /> ลบ
              </button>
            )}
            <motion.img
              key={previewAttachment.id}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={api.attachmentFileUrl(previewAttachment.id)}
              alt={previewAttachment.filename}
              className="max-h-[90vh] max-w-full rounded-2xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface EditFormProps {
  tx: ApiTransaction
  categories: ApiCategory[]
  onCancel: () => void
  onSubmit: (body: UpdateBody) => void
  submitting: boolean
  err: string | null
  authHeaders: AuthHeaders
  onUploaded: () => void
  onDeleteAttachment: (id: string) => void
  isOwnerOrAdmin: boolean
}

function EditForm({
  tx,
  categories,
  onCancel,
  onSubmit,
  submitting,
  err,
  authHeaders,
  onUploaded,
  onDeleteAttachment,
  isOwnerOrAdmin,
}: EditFormProps) {
  const [type, setType] = React.useState<'income' | 'expense'>(tx.type)
  const [amountBaht, setAmountBaht] = React.useState(String(tx.amountBaht))
  const [categoryId, setCategoryId] = React.useState<number>(tx.categoryId)
  const [occurredAtLocal, setOccurredAtLocal] = React.useState(
    isoToBangkokLocalInput(tx.occurredAt),
  )
  const [title, setTitle] = React.useState(tx.title ?? '')
  const [note, setNote] = React.useState(tx.note ?? '')
  const [uploading, setUploading] = React.useState(false)
  const [uploadErr, setUploadErr] = React.useState<string | null>(null)

  const filtered = React.useMemo(
    () => categories.filter((c) => c.type === type && !c.disabled),
    [categories, type],
  )

  React.useEffect(() => {
    if (filtered.length > 0 && !filtered.some((c) => c.id === categoryId)) {
      setCategoryId(filtered[0].id)
    }
  }, [filtered, categoryId])

  async function handleUpload(list: FileList | null) {
    if (!list || list.length === 0) return
    setUploadErr(null)
    setUploading(true)
    try {
      const arr = Array.from(list)
      const bad = arr.find((f) => !f.type.startsWith('image/') || f.size > 10 * 1024 * 1024)
      if (bad) {
        setUploadErr(`ไฟล์ ${bad.name} ไม่ใช่รูปหรือใหญ่เกิน 10 MB`)
        return
      }
      await Promise.all(arr.map((f) => api.uploadAttachment(authHeaders, tx.id, f)))
      onUploaded()
    } catch (e: unknown) {
      setUploadErr(e instanceof Error ? e.message : 'upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({
          type,
          amountBaht: Number(amountBaht),
          categoryId,
          occurredAt: bangkokLocalToIsoUtc(occurredAtLocal),
          title: title ? title : null,
          note: note || null,
        })
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-2 rounded-full bg-rose-100 p-1.5">
        {(['income', 'expense'] as const).map((opt) => {
          const selected = type === opt
          return (
            <button
              key={opt}
              type="button"
              onClick={() => setType(opt)}
              className={cn(
                'rounded-full py-2 text-sm font-bold transition-all',
                selected
                  ? opt === 'income'
                    ? 'bg-gradient-to-r from-emerald-400 to-teal-500 text-white shadow-md'
                    : 'bg-gradient-to-r from-rose-400 to-amber-500 text-white shadow-md'
                  : opt === 'income'
                    ? 'text-emerald-700'
                    : 'text-rose-700',
              )}
            >
              {opt === 'income' ? '+ รายรับ' : '− รายจ่าย'}
            </button>
          )
        })}
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-zinc-700">
          ชื่อรายการ <span className="text-zinc-400">(ไม่บังคับ)</span>
        </label>
        <input
          type="text"
          maxLength={80}
          placeholder="ตั้งชื่อรายการ (เช่น ค่าเช่า VPS เดือน เม.ย.)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-2xl border border-rose-100 bg-white px-4 py-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
        />
      </div>

      <div className="rounded-3xl border border-rose-100/60 bg-white p-5 shadow-sm">
        <p className="mb-1 text-center text-xs font-medium uppercase tracking-wider text-zinc-500">
          จำนวนเงิน
        </p>
        <div className="flex items-baseline justify-center gap-1">
          <span className="text-2xl font-semibold text-zinc-300">฿</span>
          <input
            type="number"
            step="0.01"
            value={amountBaht}
            onChange={(e) => setAmountBaht(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-center text-4xl font-bold text-zinc-800 outline-none"
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-zinc-700">หมวดหมู่</p>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {filtered.map((c) => {
            const selected = categoryId === c.id
            const bg = c.color ?? (type === 'income' ? '#10B981' : '#FB7185')
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(c.id)}
                className={cn(
                  'shrink-0 rounded-2xl px-4 py-2 text-xs font-bold text-white shadow-sm transition-all',
                  selected ? 'scale-105 ring-4 ring-rose-300 ring-offset-2' : 'opacity-90',
                )}
                style={{ backgroundColor: bg }}
              >
                {c.name}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-zinc-700">
          วันที่ / เวลา
        </label>
        <input
          type="datetime-local"
          value={occurredAtLocal}
          onChange={(e) => setOccurredAtLocal(e.target.value)}
          className="w-full rounded-2xl border border-rose-100 bg-white px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-zinc-700">โน้ต</label>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-2xl border border-rose-100 bg-white px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
        />
      </div>

      {/* Existing attachments + add */}
      <div className="rounded-3xl border border-rose-100/60 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            รูปภาพ ({tx.attachments.length})
          </p>
          <label className="flex cursor-pointer items-center gap-1 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600">
            <ImagePlus className="h-3 w-3" />
            {uploading ? 'กำลังอัพโหลด...' : 'เพิ่มรูป'}
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
          </label>
        </div>
        {uploadErr && (
          <p className="mb-2 inline-block rounded-full bg-rose-100 px-3 py-0.5 text-xs font-semibold text-rose-700">
            {uploadErr}
          </p>
        )}
        {tx.attachments.length > 0 && (
          <div className="grid grid-cols-3 gap-2 md:grid-cols-4">
            {tx.attachments.map((a: ApiAttachment) => (
              <div
                key={a.id}
                className="relative aspect-square overflow-hidden rounded-2xl border border-rose-100"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={api.attachmentFileUrl(a.id)}
                  alt={a.filename}
                  className="h-full w-full object-cover"
                />
                {isOwnerOrAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('ลบรูปนี้?')) onDeleteAttachment(a.id)
                    }}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900/70 text-white"
                    aria-label="Delete attachment"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {err && (
        <div className="rounded-2xl bg-rose-100/80 px-4 py-2 text-sm text-rose-700">{err}</div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-2xl bg-zinc-100 py-3 text-sm font-semibold text-zinc-700"
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex flex-1 items-center justify-center gap-1 rounded-2xl bg-gradient-to-r from-rose-400 to-amber-500 py-3 text-sm font-semibold text-white shadow-md disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              บันทึก...
            </>
          ) : (
            <>
              <Check className="h-4 w-4" />
              บันทึก
            </>
          )}
        </button>
      </div>
    </form>
  )
}
