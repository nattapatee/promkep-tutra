'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Loader2,
  QrCode,
  Trash2,
  ArrowLeftRight,
  Download,
  X,
  ClipboardPaste,
  ShieldCheck,
  CheckCircle2,
  Clock,
} from 'lucide-react'
import { useAuth } from '@/app/providers'
import { api, type ApiPaymentRequest, type ApiPromptPayLink } from '@/lib/api'
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

type Tab = 'receive' | 'pay' | 'verify' | 'edit'

const VERIFY_POLL_INTERVAL_MS = 4000
const VERIFY_TTL_OPTIONS = [5, 10, 15, 30] as const

export default function PromptPaySettingsPage() {
  const { ready, error, authHeaders, retry } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = React.useState<Tab>('receive')
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [receiveAmount, setReceiveAmount] = React.useState('')
  const [payIdentifier, setPayIdentifier] = React.useState('')
  const [payKind, setPayKind] = React.useState<'phone' | 'national_id'>('phone')
  const [payAmount, setPayAmount] = React.useState('')
  const [payPaste, setPayPaste] = React.useState('')
  const [payPasteError, setPayPasteError] = React.useState<string | null>(null)
  const [payPasteLoading, setPayPasteLoading] = React.useState(false)
  const [verifyAmount, setVerifyAmount] = React.useState('')
  const [verifyTtlMin, setVerifyTtlMin] = React.useState<number>(VERIFY_TTL_OPTIONS[1])
  const [verifyNote, setVerifyNote] = React.useState('')
  const [verifyRequest, setVerifyRequest] = React.useState<ApiPaymentRequest | null>(null)
  const [verifyQrUrl, setVerifyQrUrl] = React.useState<string | null>(null)
  const [verifyLoading, setVerifyLoading] = React.useState(false)
  const [verifyError, setVerifyError] = React.useState<string | null>(null)
  const [verifyCountdownMs, setVerifyCountdownMs] = React.useState<number>(0)
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

  async function applyPastedPayload() {
    setPayPasteError(null)
    const trimmed = payPaste.trim()
    if (!trimmed) {
      setPayPasteError('วาง PromptPay payload ก่อน')
      return
    }
    setPayPasteLoading(true)
    try {
      const result = await api.parsePromptPay(trimmed)
      setPayKind(result.kind)
      setPayIdentifier(result.identifier)
      if (result.amountBaht && result.amountBaht > 0) {
        setPayAmount(String(result.amountBaht))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'parse failed'
      setPayPasteError(`อ่าน QR ไม่สำเร็จ: ${msg}`)
    } finally {
      setPayPasteLoading(false)
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

  React.useEffect(() => {
    return () => {
      if (verifyQrUrl) URL.revokeObjectURL(verifyQrUrl)
    }
  }, [verifyQrUrl])

  // Poll the active payment request until terminal status.
  React.useEffect(() => {
    if (!verifyRequest || verifyRequest.status !== 'pending') return
    let cancelled = false
    const poll = async () => {
      try {
        const fresh = await api.getPaymentRequest(authHeaders, verifyRequest.id)
        if (cancelled) return
        setVerifyRequest(fresh)
        setVerifyCountdownMs(fresh.remainingMs)
      } catch (err) {
        console.warn('[verify] poll failed', err)
      }
    }
    const interval = window.setInterval(poll, VERIFY_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [verifyRequest, authHeaders])

  // 1-second countdown ticker (separate from server poll).
  React.useEffect(() => {
    if (!verifyRequest || verifyRequest.status !== 'pending') return
    const tick = () => {
      const remaining = new Date(verifyRequest.expiresAt).getTime() - Date.now()
      setVerifyCountdownMs(Math.max(0, remaining))
    }
    tick()
    const t = window.setInterval(tick, 1000)
    return () => window.clearInterval(t)
  }, [verifyRequest])

  async function startVerifyRequest() {
    setVerifyError(null)
    const amount = parseFloat(verifyAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setVerifyError('กรอกจำนวนเงินที่ถูกต้อง')
      return
    }
    setVerifyLoading(true)
    try {
      const created = await api.createPaymentRequest(authHeaders, {
        amountBaht: amount,
        expiresInMinutes: verifyTtlMin,
        note: verifyNote.trim() ? verifyNote.trim() : undefined,
      })
      setVerifyRequest(created)
      setVerifyCountdownMs(created.remainingMs)
      const blob = await api.fetchPaymentRequestQr(authHeaders, created.id)
      setVerifyQrUrl(URL.createObjectURL(blob))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'create failed'
      setVerifyError(`สร้างคำขอไม่สำเร็จ: ${msg}`)
    } finally {
      setVerifyLoading(false)
    }
  }

  async function confirmVerifyPaid() {
    if (!verifyRequest) return
    try {
      const updated = await api.confirmPaymentRequest(authHeaders, verifyRequest.id)
      setVerifyRequest(updated)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'confirm failed'
      setVerifyError(msg)
    }
  }

  async function cancelVerifyRequest() {
    if (!verifyRequest) return
    try {
      await api.cancelPaymentRequest(authHeaders, verifyRequest.id)
    } catch {}
    resetVerify()
  }

  function resetVerify() {
    if (verifyQrUrl) URL.revokeObjectURL(verifyQrUrl)
    setVerifyQrUrl(null)
    setVerifyRequest(null)
    setVerifyCountdownMs(0)
    setVerifyError(null)
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

      <div className="grid grid-cols-4 gap-1.5 rounded-full bg-rose-100 p-1.5">
        {[
          { value: 'receive' as Tab, label: 'รับ', icon: QrCode },
          { value: 'pay' as Tab, label: 'จ่าย', icon: ArrowLeftRight },
          { value: 'verify' as Tab, label: 'ตรวจ', icon: ShieldCheck },
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
              <p className="mb-3 text-sm font-semibold text-zinc-700">วาง PromptPay payload (ถ้ามี)</p>
              <textarea
                value={payPaste}
                onChange={(e) => setPayPaste(e.target.value)}
                placeholder="00020101021129370016A000000677010111..."
                rows={2}
                className="mb-2 w-full resize-none rounded-2xl border border-rose-100 bg-white px-4 py-3 font-mono text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
              />
              {payPasteError && (
                <p className="mb-2 text-xs font-semibold text-rose-600">{payPasteError}</p>
              )}
              <button
                type="button"
                onClick={applyPastedPayload}
                disabled={payPasteLoading || !payPaste.trim()}
                className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 py-2.5 text-xs font-bold text-rose-700 shadow-sm disabled:opacity-60"
              >
                {payPasteLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ClipboardPaste className="h-4 w-4" />
                )}
                อ่าน QR แล้วเติมข้อมูล
              </button>

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

        {tab === 'verify' && (
          <motion.div
            key="verify"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="space-y-4"
          >
            {!verifyRequest ? (
              <div className="rounded-3xl border border-rose-100/60 bg-white p-5 shadow-[0_4px_20px_rgba(251,113,133,0.10)]">
                <p className="mb-1 text-sm font-semibold text-zinc-700">ขอรับเงินพร้อมตรวจสอบ</p>
                <p className="mb-4 text-xs text-zinc-500">
                  สร้าง QR ด้วยจำนวนเงินที่กำหนด ระบบจะตรวจสอบสถานะให้ทุก {VERIFY_POLL_INTERVAL_MS / 1000} วินาที
                </p>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="จำนวนเงิน (บาท)"
                  value={verifyAmount}
                  onChange={(e) => setVerifyAmount(e.target.value)}
                  className="mb-3 w-full rounded-2xl border border-rose-100 bg-white px-4 py-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                />
                <p className="mb-2 text-xs font-semibold text-zinc-600">หมดอายุภายใน</p>
                <div className="mb-3 grid grid-cols-4 gap-2">
                  {VERIFY_TTL_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setVerifyTtlMin(opt)}
                      className={cn(
                        'rounded-2xl border py-2 text-xs font-bold transition-all',
                        verifyTtlMin === opt
                          ? 'border-rose-400 bg-gradient-to-r from-rose-400 to-amber-500 text-white shadow-md'
                          : 'border-rose-100 bg-white text-rose-700',
                      )}
                    >
                      {opt} นาที
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  maxLength={120}
                  placeholder="โน้ต (ไม่บังคับ) เช่น ค่ากาแฟ"
                  value={verifyNote}
                  onChange={(e) => setVerifyNote(e.target.value)}
                  className="mb-3 w-full rounded-2xl border border-rose-100 bg-white px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                />
                {verifyError && (
                  <p className="mb-2 text-xs font-semibold text-rose-600">{verifyError}</p>
                )}
                <button
                  type="button"
                  onClick={startVerifyRequest}
                  disabled={verifyLoading || !verifyAmount}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-400 to-amber-500 py-3 text-sm font-bold text-white shadow-md disabled:opacity-60"
                >
                  {verifyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  สร้าง QR + ตรวจสอบ
                </button>
              </div>
            ) : (
              <div className="rounded-3xl border border-rose-100/60 bg-white p-5 shadow-[0_4px_20px_rgba(251,113,133,0.10)]">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-zinc-700">
                    รอรับ {verifyRequest.amountBaht.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
                  </p>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold',
                      verifyRequest.status === 'pending' && 'bg-amber-100 text-amber-700',
                      verifyRequest.status === 'paid' && 'bg-emerald-100 text-emerald-700',
                      verifyRequest.status === 'expired' && 'bg-zinc-100 text-zinc-600',
                      verifyRequest.status === 'cancelled' && 'bg-zinc-100 text-zinc-600',
                    )}
                  >
                    {verifyRequest.status === 'pending' && <><Loader2 className="h-3 w-3 animate-spin" /> รอชำระ</>}
                    {verifyRequest.status === 'paid' && <><CheckCircle2 className="h-3 w-3" /> ชำระแล้ว</>}
                    {verifyRequest.status === 'expired' && <><Clock className="h-3 w-3" /> หมดอายุ</>}
                    {verifyRequest.status === 'cancelled' && <><X className="h-3 w-3" /> ยกเลิก</>}
                  </span>
                </div>

                {verifyRequest.note && (
                  <p className="mb-3 text-xs text-zinc-500">โน้ต: {verifyRequest.note}</p>
                )}

                {verifyQrUrl && verifyRequest.status === 'pending' && (
                  <div className="mb-3 mx-auto w-full max-w-[260px] rounded-2xl border-4 border-secondary-green/20 bg-white p-3 shadow-md">
                    <img src={verifyQrUrl} alt="PromptPay QR" className="w-full rounded-xl" />
                  </div>
                )}

                {verifyRequest.status === 'pending' && (
                  <div className="mb-3 flex items-center justify-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                    <Clock className="h-4 w-4" />
                    เหลือเวลา {Math.ceil(verifyCountdownMs / 1000)} วินาที
                  </div>
                )}

                {verifyRequest.status === 'paid' && (
                  <div className="mb-3 flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    ได้รับเงินแล้ว
                  </div>
                )}

                {verifyError && (
                  <p className="mb-2 text-xs font-semibold text-rose-600">{verifyError}</p>
                )}

                {verifyRequest.status === 'pending' ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={cancelVerifyRequest}
                      className="flex-1 rounded-2xl border border-rose-200 bg-white py-3 text-sm font-bold text-rose-600"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      onClick={confirmVerifyPaid}
                      className="flex-1 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-400 py-3 text-sm font-bold text-white shadow-md"
                    >
                      ฉันได้รับเงินแล้ว
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={resetVerify}
                    className="w-full rounded-2xl bg-gradient-to-r from-rose-400 to-amber-500 py-3 text-sm font-bold text-white shadow-md"
                  >
                    สร้างคำขอใหม่
                  </button>
                )}
              </div>
            )}
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
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-white p-6 shadow-2xl"
          >
            <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-accent-pink/10 blur-2xl" />
            <div className="absolute -left-8 -bottom-8 h-24 w-24 rounded-full bg-secondary-green/10 blur-2xl" />
            <button
              type="button"
              onClick={closeQr}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition-colors hover:bg-rose-100 hover:text-rose-500"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="relative mb-4 flex flex-col items-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-secondary-green to-emerald-400 text-white shadow-md">
                <QrCode className="h-6 w-6" />
              </div>
              <p className="text-center text-sm font-bold text-zinc-800">สแกนเพื่อชำระเงิน</p>
              <p className="text-center text-xs text-zinc-500">ผ่านแอปธนาคารหรือ TrueMoney</p>
            </div>
            <div className="relative mx-auto w-full max-w-[280px] rounded-2xl border-4 border-secondary-green/20 bg-white p-3 shadow-lg">
              <img src={qrUrl} alt="PromptPay QR" className="w-full rounded-xl" />
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-accent-pink to-rose-400 px-3 py-1 text-[10px] font-bold text-white shadow-md">
                PromptPay
              </div>
            </div>
            <a
              href={qrUrl}
              download="promptpay-qr.png"
              className="relative mt-6 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-secondary-green to-emerald-500 py-3 text-sm font-bold text-white shadow-lg shadow-secondary-green/30 transition-transform active:scale-95"
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
