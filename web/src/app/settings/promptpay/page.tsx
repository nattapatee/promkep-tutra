'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, QrCode, Trash2 } from 'lucide-react'
import { useAuth } from '@/app/providers'
import { api, type ApiPromptPayLink } from '@/lib/api'
import { cn } from '@/lib/cn'

const schema = z
  .object({
    kind: z.enum(['phone', 'national_id']),
    identifier: z.string().min(1, 'กรอกหมายเลข'),
    displayName: z.string().max(64, 'สูงสุด 64 ตัวอักษร').optional().or(z.literal('')),
  })
  .superRefine((val, ctx) => {
    const digits = val.identifier.replace(/\D/g, '')
    if (val.kind === 'phone' && digits.length !== 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['identifier'],
        message: 'เบอร์โทรต้องมี 10 หลัก',
      })
    }
    if (val.kind === 'national_id' && digits.length !== 13) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['identifier'],
        message: 'เลขบัตรปชช. ต้องมี 13 หลัก',
      })
    }
  })

type FormValues = z.infer<typeof schema>

export default function PromptPaySettingsPage() {
  const { ready, error, authHeaders, retry } = useAuth()
  const qc = useQueryClient()
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  const ppQuery = useQuery<ApiPromptPayLink | null>({
    queryKey: ['promptpay', authHeaders.lineUserId],
    queryFn: () => api.getMyPromptPay(authHeaders),
    enabled: ready,
  })

  const current = ppQuery.data ?? null

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: 'phone',
      identifier: '',
      displayName: '',
    },
  })

  React.useEffect(() => {
    if (current) {
      form.reset({
        kind: current.kind,
        identifier: current.identifier,
        displayName: current.displayName ?? '',
      })
    }
  }, [current, form])

  const saveMut = useMutation({
    mutationFn: (v: FormValues) =>
      api.setMyPromptPay(authHeaders, {
        identifier: v.identifier.replace(/\D/g, ''),
        kind: v.kind,
        displayName: v.displayName ? v.displayName : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promptpay'] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: () => api.deleteMyPromptPay(authHeaders),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promptpay'] })
      form.reset({ kind: 'phone', identifier: '', displayName: '' })
      setConfirmDelete(false)
    },
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

  if (!ready || ppQuery.isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-zinc-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
      </div>
    )
  }

  const watchKind = form.watch('kind')
  const submitErr = saveMut.error instanceof Error ? saveMut.error.message : null

  return (
    <div className="space-y-5 pb-24">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <h1 className="text-2xl font-bold tracking-tight text-zinc-800">PromptPay</h1>
        <p className="mt-1 text-sm text-zinc-500">ผูก PromptPay ไว้รับเงินจากหนี้</p>
      </motion.div>

      {/* Current status card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-3xl border border-rose-100/60 bg-white p-5 shadow-[0_4px_20px_rgba(251,113,133,0.10)]"
      >
        {current ? (
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-400 to-amber-500 text-white shadow-md">
              <QrCode className="h-7 w-7" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {current.kind === 'phone' ? 'เบอร์โทรศัพท์' : 'เลขบัตรประชาชน'}
              </p>
              <p className="mt-0.5 truncate text-xl font-bold text-zinc-800">
                {current.identifier}
              </p>
              {current.displayName && (
                <p className="mt-0.5 text-sm text-zinc-500">{current.displayName}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete PromptPay"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-500 transition-colors hover:bg-rose-100"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-zinc-400">
            <QrCode className="h-8 w-8 shrink-0" />
            <p className="text-sm">ยังไม่ได้ผูก PromptPay</p>
          </div>
        )}
      </motion.div>

      {/* Form */}
      <motion.form
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        onSubmit={form.handleSubmit((v) => saveMut.mutate(v))}
        className="space-y-4 rounded-3xl border border-rose-100/60 bg-white p-5 shadow-[0_4px_20px_rgba(251,113,133,0.10)]"
      >
        <p className="text-sm font-semibold text-zinc-700">
          {current ? 'แก้ไข PromptPay' : 'เพิ่ม PromptPay'}
        </p>

        {/* Kind radio */}
        <div className="grid grid-cols-2 gap-2 rounded-full bg-rose-100 p-1.5">
          {(['phone', 'national_id'] as const).map((opt) => {
            const selected = watchKind === opt
            return (
              <button
                key={opt}
                type="button"
                onClick={() => form.setValue('kind', opt)}
                className={cn(
                  'rounded-full py-2 text-sm font-bold transition-all',
                  selected
                    ? 'bg-gradient-to-r from-rose-400 to-amber-500 text-white shadow-md'
                    : 'text-rose-700',
                )}
              >
                {opt === 'phone' ? 'เบอร์โทร' : 'บัตรปชช.'}
              </button>
            )
          })}
        </div>

        {/* Identifier */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-zinc-700">
            {watchKind === 'phone' ? 'เบอร์โทรศัพท์ (10 หลัก)' : 'เลขบัตรประชาชน (13 หลัก)'}
          </label>
          <input
            type="tel"
            inputMode="numeric"
            placeholder={watchKind === 'phone' ? '0812345678' : '1234567890123'}
            {...form.register('identifier')}
            className="w-full rounded-2xl border border-rose-100 bg-white px-4 py-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
          {form.formState.errors.identifier && (
            <p className="mt-1 inline-block rounded-full bg-rose-100 px-3 py-0.5 text-xs font-semibold text-rose-700">
              {form.formState.errors.identifier.message}
            </p>
          )}
        </div>

        {/* Display name */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-zinc-700">
            ชื่อที่แสดง <span className="text-zinc-400">(ไม่บังคับ, สูงสุด 64 ตัว)</span>
          </label>
          <input
            type="text"
            maxLength={64}
            placeholder="เช่น ตุ๊ต๊ะ"
            {...form.register('displayName')}
            className="w-full rounded-2xl border border-rose-100 bg-white px-4 py-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
          {form.formState.errors.displayName && (
            <p className="mt-1 inline-block rounded-full bg-rose-100 px-3 py-0.5 text-xs font-semibold text-rose-700">
              {form.formState.errors.displayName.message}
            </p>
          )}
        </div>

        {submitErr && (
          <div className="rounded-2xl bg-rose-100/80 px-4 py-2 text-sm text-rose-700">
            {submitErr}
          </div>
        )}

        {saveMut.isSuccess && (
          <div className="rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
            บันทึกสำเร็จ
          </div>
        )}

        <button
          type="submit"
          disabled={saveMut.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-400 to-amber-500 py-3 text-sm font-bold text-white shadow-md shadow-rose-300/50 disabled:opacity-60"
        >
          {saveMut.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              กำลังบันทึก...
            </>
          ) : (
            'บันทึก PromptPay'
          )}
        </button>
      </motion.form>

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
              <h2 className="text-lg font-bold text-zinc-800">ลบ PromptPay?</h2>
              <p className="mt-1 text-sm text-zinc-600">
                ข้อมูล PromptPay จะถูกลบออก คุณสามารถเพิ่มใหม่ได้ภายหลัง
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
    </div>
  )
}
