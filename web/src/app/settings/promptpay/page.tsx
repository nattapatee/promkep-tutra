'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, QrCode, Trash2, ArrowLeftRight, Download, X } from 'lucide-react'
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

type Tab = 'receive' | 'pay' | 'edit'

export default function PromptPaySettingsPage() {
  const { ready, error, authHeaders, retry } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = React.useState<Tab>('receive')
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [receiveAmount, setReceiveAmount] = React.useState('')
  const [payIdentifier, setPayIdentifier] = React.useState('')
  const [payKind, setPayKind] = React.useState<'phone' | 'national_id'>('phone')
  const [payAmount, setPayAmount] = React.useState('')
  const [qrUrl, setQrUrl] = React.useState<string | null>(null)
  const [qrLoading, setQrLoading] = React.useState(false)

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
      setTab('receive')
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

  async function generateReceiveQr(amount?: number) {
    if (!current) return
    setQrLoading(true)
    try {
      const blob = await api.getMyPromptPayQr(authHeaders, amount)
      const url = URL.createObjectURL(blob)
      setQrUrl(url)
    } catch (e) {
      alert('ไม่สามารถสร้าง QR ได้')
    } finally {
      setQrLoading(false)
    }
  }

  async function generatePayQr() {
    const digits = payIdentifier.replace(/\D/g, '')
    if (payKind === 'phone' && digits.length !== 10) {
      alert('เบอร์โทรต้องมี 10 หลัก')
      return
    }
    if (payKind === 'national_id' && digits.length !== 13) {
      alert('เลขบัตรปชช. ต้องมี 13 หลัก')
      return
    }
    setQrLoading(true)
    try {
      const amount = payAmount ? parseFloat(payAmount) : undefined
      const blob = await api.generatePromptPayQr({
        identifier: digits,
        kind: payKind,
        amountBaht: amount && amount > 0 ? amount : undefined,
      })
      const url = URL.createObjectURL(blob)
      setQrUrl(url)
    } catch (e) {
      alert('ไม่สามารถสร้าง QR ได้')
    } finally {
      setQrLoading(false)
    }
  }

  function closeQr() {
    if (qrUrl) {
      URL.revokeObjectURL(qrUrl)
      setQrUrl(null)
    }
  }

  React.useEffect(() => {
    return () => {
      if (qrUrl) URL.revokeObjectURL(qrUrl)
    }
  }, [qrUrl])

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

  if (!current) {
    return (
      <div className="space-y-5 pb-24">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-800">PromptPay</h1>
          <p className="mt-1 text-sm text-zinc-500">ผูก PromptPay ไว้รับเงินและจ่ายเงิน</p>
        </motion.div>

        <motion.form
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onSubmit={form.handleSubmit((v) => saveMut.mutate(v))}
          className="space-y-4 rounded-3xl border border-rose-100/60 bg-white p-5 shadow-[0_4px_20px_rgba(251,113,133,0.10)]"
        >
          <p className="text-sm font-semibold text-zinc-700">เพิ่ม PromptPay</p>
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
                    selected ? 'bg-gradient-to-r from-rose-400 to-amber-500 text-white shadow-md' : 'text-rose-700',
                  )}
                >
                  {opt === 'phone' ? 'เบอร์โทร' : 'บัตรปชช.'}
                </button>
              )
            })}
          </div>
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
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-zinc-700">
              ชื่อที่แสดง <span className="text-zinc-400">(ไม่บังคับ)</span>
            </label>
            <input
              type="text"
              maxLength={64}
              placeholder="เช่น ตุ๊ต๊ะ"
              {...form.register('displayName')}
              className="w-full rounded-2xl border border-rose-100 bg-white px-4 py-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
          </div>
          {submitErr && (
            <div className="rounded-2xl bg-rose-100/80 px-4 py-2 text-sm text-rose-700">{submitErr}</div>
          )}
          <button
            type="submit"
            disabled={saveMut.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-400 to-amber-500 py-3 text-sm font-bold text-white shadow-md shadow-rose-300/50 disabled:opacity-60"
          >
            {saveMut.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> กำลังบันทึก...</> : 'บันทึก PromptPay'}
          </button>
        </motion.form>
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-24">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-800">PromptPay</h1>
        <p className="mt-1 text-sm text-zinc-500">{current.displayName || (current.kind === 'phone' ? 'เบอร์โทร' : 'บัตรปชช.')}: {current.identifier}</p>
      </motion.div>

      <div className="grid grid-cols-3 gap-1.5 rounded-full bg-rose-100 p-1.5">
        {[
          { value: 'receive' as Tab, label: 'รับเงิน', icon: QrCode },
          { value: 'pay' as Tab, label: 'จ่ายเงิน', icon: ArrowLeftRight },
          { value: 'edit' as Tab, label: 'แก้ไข', icon: Trash2 },
        ].map((t) => {
          const selected = tab === t.value
          const Icon = t.icon
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={cn(
                'flex items-center justify-center gap-1 rounded-full py-2 text-xs font-bold transition-all',
                selected ? 'bg-gradient-to-r from-rose-400 to-amber-500 text-white shadow-md' : 'text-rose-700',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      <AnimatePresence mode="wait">
        {tab === 'receive' && (
          <motion.div
            key="receive"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="space-y-4"
          >
            <div className="rounded-3xl border border-rose-100/60 bg-white p-5 shadow-[0_4px_20px_rgba(251,113,133,0.10)]">
              <p className="mb-3 text-sm font-semibold text-zinc-700">สร้าง QR รับเงิน</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => generateReceiveQr()}
                  disabled={qrLoading}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-rose-400 to-amber-500 py-3 text-sm font-bold text-white shadow-md disabled:opacity-60"
                >
                  {qrLoading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'QR ไม่ระบุจำนวน'}
                </button>
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="จำนวนเงิน (บาท)"
                  value={receiveAmount}
                  onChange={(e) => setReceiveAmount(e.target.value)}
                  className="min-w-0 flex-1 rounded-2xl border border-rose-100 bg-white px-4 py-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                />
                <button
                  type="button"
                  onClick={() => {
                    const amount = parseFloat(receiveAmount)
                    if (!isNaN(amount) && amount > 0) {
                      generateReceiveQr(amount)
                    }
                  }}
                  disabled={qrLoading || !receiveAmount}
                  className="rounded-2xl bg-secondary-green px-4 py-3 text-sm font-bold text-white shadow-md disabled:opacity-60"
                >
                  QR
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {tab === 'pay' && (
          <motion.div
            key="pay"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="space-y-4"
          >
            <div className="rounded-3xl border border-rose-100/60 bg-white p-5 shadow-[0_4px_20px_rgba(251,113,133,0.10)]">
              <p className="mb-3 text-sm font-semibold text-zinc-700">สร้าง QR จ่ายเงิน</p>
              <div className="mb-3 grid grid-cols-2 gap-2 rounded-full bg-rose-100 p-1.5">
                {(['phone', 'national_id'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setPayKind(opt)}
                    className={cn(
                      'rounded-full py-2 text-sm font-bold transition-all',
                      payKind === opt ? 'bg-gradient-to-r from-rose-400 to-amber-500 text-white shadow-md' : 'text-rose-700',
                    )}
                  >
                    {opt === 'phone' ? 'เบอร์โทร' : 'บัตรปชช.'}
                  </button>
                ))}
              </div>
              <input
                type="tel"
                inputMode="numeric"
                placeholder={payKind === 'phone' ? '0812345678' : '1234567890123'}
                value={payIdentifier}
                onChange={(e) => setPayIdentifier(e.target.value.replace(/\D/g, ''))}
                className="mb-3 w-full rounded-2xl border border-rose-100 bg-white px-4 py-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
              />
              <input
                type="number"
                inputMode="decimal"
                placeholder="จำนวนเงิน (บาท) - ไม่บังคับ"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="mb-3 w-full rounded-2xl border border-rose-100 bg-white px-4 py-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
              />
              <button
                type="button"
                onClick={generatePayQr}
                disabled={qrLoading || !payIdentifier}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-400 to-amber-500 py-3 text-sm font-bold text-white shadow-md disabled:opacity-60"
              >
                {qrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'สร้าง QR จ่ายเงิน'}
              </button>
            </div>
          </motion.div>
        )}

        {tab === 'edit' && (
          <motion.div
            key="edit"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="space-y-4"
          >
            <form
              onSubmit={form.handleSubmit((v) => saveMut.mutate(v))}
              className="space-y-4 rounded-3xl border border-rose-100/60 bg-white p-5 shadow-[0_4px_20px_rgba(251,113,133,0.10)]"
            >
              <p className="text-sm font-semibold text-zinc-700">แก้ไข PromptPay</p>
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
                        selected ? 'bg-gradient-to-r from-rose-400 to-amber-500 text-white shadow-md' : 'text-rose-700',
                      )}
                    >
                      {opt === 'phone' ? 'เบอร์โทร' : 'บัตรปชช.'}
                    </button>
                  )
                })}
              </div>
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
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-zinc-700">
                  ชื่อที่แสดง <span className="text-zinc-400">(ไม่บังคับ)</span>
                </label>
                <input
                  type="text"
                  maxLength={64}
                  placeholder="เช่น ตุ๊ต๊ะ"
                  {...form.register('displayName')}
                  className="w-full rounded-2xl border border-rose-100 bg-white px-4 py-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                />
              </div>
              {submitErr && (
                <div className="rounded-2xl bg-rose-100/80 px-4 py-2 text-sm text-rose-700">{submitErr}</div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600"
                >
                  <Trash2 className="h-4 w-4" />
                  ลบ
                </button>
                <button
                  type="submit"
                  disabled={saveMut.isPending}
                  className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-400 to-amber-500 py-3 text-sm font-bold text-white shadow-md disabled:opacity-60"
                >
                  {saveMut.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> กำลังบันทึก...</> : 'บันทึก'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {qrUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl"
          >
            <button
              type="button"
              onClick={closeQr}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500"
            >
              <X className="h-4 w-4" />
            </button>
            <p className="mb-4 text-center text-sm font-semibold text-zinc-700">สแกนเพื่อชำระเงิน</p>
            <img src={qrUrl} alt="PromptPay QR" className="mx-auto w-full max-w-[280px] rounded-2xl" />
            <a
              href={qrUrl}
              download="promptpay-qr.png"
              className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-secondary-green py-3 text-sm font-bold text-white"
            >
              <Download className="h-4 w-4" />
              ดาวน์โหลด QR
            </a>
          </motion.div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/60 p-4 backdrop-blur">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl"
          >
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100">
              <Trash2 className="h-6 w-6 text-rose-500" />
            </div>
            <h2 className="text-lg font-bold text-zinc-800">ลบ PromptPay?</h2>
            <p className="mt-1 text-sm text-zinc-600">ข้อมูล PromptPay จะถูกลบออก</p>
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
        </div>
      )}
    </div>
  )
}
