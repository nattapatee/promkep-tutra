'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
import { ImagePlus, Loader2, X, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import { api, type ApiCategory } from '@/lib/api'
import { bangkokLocalToIsoUtc, nowBangkokIsoLocal } from '@/lib/format'
import { cn } from '@/lib/cn'

const MAX_FILES = 5
const MAX_BYTES = 10 * 1024 * 1024

const schema = z.object({
  type: z.enum(['income', 'expense']),
  amountBaht: z.coerce
    .number()
    .positive('กรอกจำนวนเงินที่มากกว่า 0')
    .max(999999.99, 'จำนวนเงินสูงสุด 999,999.99'),
  categoryId: z.coerce.number().int().positive('เลือกหมวดหมู่'),
  occurredAt: z.string().min(1, 'เลือกวันที่'),
  title: z
    .string()
    .max(80, 'ชื่อรายการยาวสูงสุด 80 ตัวอักษร')
    .optional()
    .or(z.literal('')),
  note: z.string().max(1000, 'โน้ตยาวสูงสุด 1000 ตัวอักษร').optional().or(z.literal('')),
})

type FormInput = z.input<typeof schema>
type FormValues = z.output<typeof schema>

function fireConfetti() {
  const colors = ['#FB7185', '#F59E0B', '#10B981', '#0EA5E9', '#FACC15']
  confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 }, colors })
}

function formatAmountDisplay(raw: string): string {
  if (!raw) return ''
  const [intPart, decPart] = raw.split('.')
  const withCommas = intPart ? Number(intPart).toLocaleString('en-US') : '0'
  if (decPart === undefined) return withCommas
  return `${withCommas}.${decPart}`
}

function sanitizeAmount(input: string): string {
  let cleaned = input.replace(/[^0-9.]/g, '')
  const firstDot = cleaned.indexOf('.')
  if (firstDot !== -1) {
    cleaned =
      cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '')
    const [i, d = ''] = cleaned.split('.')
    cleaned = `${i}.${d.slice(0, 2)}`
  }
  return cleaned
}

export default function NewTransactionPage() {
  const router = useRouter()
  const { ready, error, authHeaders, retry } = useAuth()
  const [files, setFiles] = React.useState<File[]>([])
  const [fileErr, setFileErr] = React.useState<string | null>(null)
  const [submitErr, setSubmitErr] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [amountInput, setAmountInput] = React.useState('')

  const { data: categories } = useQuery<ApiCategory[]>({
    queryKey: ['categories'],
    queryFn: () => api.listCategories(),
    enabled: ready,
  })

  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: 'expense',
      amountBaht: 0,
      categoryId: 0,
      occurredAt: nowBangkokIsoLocal(),
      title: '',
      note: '',
    },
  })

  const watchType = form.watch('type')

  const filteredCategories = React.useMemo(
    () => (categories ?? []).filter((c) => c.type === watchType && !c.disabled),
    [categories, watchType],
  )

  React.useEffect(() => {
    const cur = Number(form.getValues('categoryId'))
    if (!filteredCategories.some((c) => c.id === cur)) {
      form.setValue('categoryId', filteredCategories[0]?.id ?? 0, { shouldValidate: false })
    }
  }, [watchType, filteredCategories, form])

  function onPickFiles(list: FileList | null) {
    if (!list) return
    setFileErr(null)
    const incoming = Array.from(list)
    const invalidType = incoming.find((f) => !f.type.startsWith('image/'))
    if (invalidType) {
      setFileErr(`ไฟล์ ${invalidType.name} ไม่ใช่รูปภาพ`)
      return
    }
    const tooBig = incoming.find((f) => f.size > MAX_BYTES)
    if (tooBig) {
      setFileErr(`ไฟล์ ${tooBig.name} ใหญ่เกิน 10 MB`)
      return
    }
    const merged = [...files, ...incoming].slice(0, MAX_FILES)
    if (files.length + incoming.length > MAX_FILES) {
      setFileErr(`อัพโหลดได้สูงสุด ${MAX_FILES} ไฟล์`)
    }
    setFiles(merged)
  }

  async function onSubmit(values: FormValues) {
    setSubmitErr(null)
    setSubmitting(true)
    try {
      const created = await api.createTransaction(authHeaders, {
        type: values.type,
        amountBaht: values.amountBaht,
        categoryId: values.categoryId,
        occurredAt: bangkokLocalToIsoUtc(values.occurredAt),
        title: values.title ? values.title : undefined,
        note: values.note ? values.note : undefined,
      })
      if (files.length > 0) {
        await Promise.all(
          files.map((f) =>
            api.uploadAttachment(authHeaders, created.id, f).catch(() => null),
          ),
        )
      }
      fireConfetti()
      setTimeout(() => router.push(`/transactions/${created.id}`), 350)
    } catch (err: unknown) {
      setSubmitErr(err instanceof Error ? err.message : 'create failed')
    } finally {
      setSubmitting(false)
    }
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
  if (!ready) return <p className="p-4 text-zinc-500">Loading...</p>

  const isIncome = watchType === 'income'

  return (
    <div className="mx-auto max-w-md space-y-5 p-1 pb-32">
      <div className="flex items-center gap-2">
        <Link
          href="/transactions"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-rose-600 shadow-sm backdrop-blur"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-bold tracking-tight text-zinc-800">เพิ่มรายการใหม่</h1>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        {/* Type toggle */}
        <Controller
          control={form.control}
          name="type"
          render={({ field }) => (
            <div
              className={cn(
                'relative grid grid-cols-2 rounded-full p-1.5 shadow-inner transition-colors',
                isIncome ? 'bg-emerald-100' : 'bg-rose-100',
              )}
            >
              {(['income', 'expense'] as const).map((opt) => {
                const selected = field.value === opt
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => field.onChange(opt)}
                    className="relative z-10 py-2.5 text-sm font-bold"
                  >
                    {selected && (
                      <motion.span
                        layoutId="type-toggle-thumb"
                        className={cn(
                          'absolute inset-0 rounded-full shadow-md',
                          opt === 'income'
                            ? 'bg-gradient-to-r from-emerald-400 to-teal-500'
                            : 'bg-gradient-to-r from-rose-400 to-amber-500',
                        )}
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                      />
                    )}
                    <span
                      className={cn(
                        'relative',
                        selected
                          ? 'text-white'
                          : opt === 'income'
                            ? 'text-emerald-700'
                            : 'text-rose-700',
                      )}
                    >
                      {opt === 'income' ? '+ รายรับ' : '− รายจ่าย'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        />

        {/* Title */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-zinc-700">
            ชื่อรายการ <span className="text-zinc-400">(ไม่บังคับ)</span>
          </label>
          <input
            type="text"
            maxLength={80}
            placeholder="ตั้งชื่อรายการ (เช่น ค่าเช่า VPS เดือน เม.ย.)"
            {...form.register('title')}
            className="w-full rounded-2xl border border-rose-100 bg-white px-4 py-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
          {form.formState.errors.title && (
            <p className="mt-1 inline-block rounded-full bg-rose-100 px-3 py-0.5 text-xs font-semibold text-rose-700">
              {form.formState.errors.title.message}
            </p>
          )}
        </div>

        {/* Amount */}
        <Controller
          control={form.control}
          name="amountBaht"
          render={({ field, fieldState }) => (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'rounded-3xl border bg-white p-6 shadow-[0_4px_20px_rgba(251,113,133,0.12)] transition-colors',
                fieldState.error ? 'border-rose-300' : 'border-rose-100/60',
              )}
            >
              <p className="mb-1 text-center text-xs font-medium uppercase tracking-wider text-zinc-500">
                จำนวนเงิน
              </p>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-3xl font-semibold text-zinc-300">฿</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={formatAmountDisplay(amountInput)}
                  onChange={(e) => {
                    const next = sanitizeAmount(e.target.value.replace(/,/g, ''))
                    setAmountInput(next)
                    field.onChange(next === '' ? 0 : Number(next))
                  }}
                  className={cn(
                    'min-w-0 flex-1 bg-transparent text-center text-5xl font-bold text-zinc-800 outline-none placeholder:text-zinc-200',
                    isIncome ? 'caret-emerald-500' : 'caret-rose-500',
                  )}
                />
              </div>
              {fieldState.error && (
                <p className="mt-2 inline-block rounded-full bg-rose-100 px-3 py-0.5 text-xs font-semibold text-rose-700">
                  {fieldState.error.message}
                </p>
              )}
            </motion.div>
          )}
        />

        {/* Category chips */}
        <div>
          <p className="mb-2 text-sm font-semibold text-zinc-700">หมวดหมู่</p>
          <Controller
            control={form.control}
            name="categoryId"
            render={({ field, fieldState }) => (
              <>
                <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                  {filteredCategories.length === 0 && (
                    <p className="text-sm text-zinc-400">
                      ยังไม่มีหมวดสำหรับ{isIncome ? 'รายรับ' : 'รายจ่าย'}
                    </p>
                  )}
                  {filteredCategories.map((c) => {
                    const selected = Number(field.value) === c.id
                    const bg = c.color ?? (isIncome ? '#10B981' : '#FB7185')
                    return (
                      <motion.button
                        key={c.id}
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        onClick={() => field.onChange(c.id)}
                        className={cn(
                          'shrink-0 rounded-2xl px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all',
                          selected
                            ? 'scale-105 ring-4 ring-rose-300 ring-offset-2'
                            : 'opacity-90',
                        )}
                        style={{ backgroundColor: bg }}
                      >
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block h-2 w-2 rounded-full bg-white/70" />
                          {c.name}
                        </span>
                      </motion.button>
                    )
                  })}
                </div>
                {fieldState.error && (
                  <p className="mt-1 inline-block rounded-full bg-rose-100 px-3 py-0.5 text-xs font-semibold text-rose-700">
                    {fieldState.error.message}
                  </p>
                )}
              </>
            )}
          />
        </div>

        {/* Date */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-zinc-700">
            วันที่ / เวลา (Asia/Bangkok)
          </label>
          <input
            type="datetime-local"
            {...form.register('occurredAt')}
            className="w-full rounded-2xl border border-rose-100 bg-white px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
          {form.formState.errors.occurredAt && (
            <p className="mt-1 inline-block rounded-full bg-rose-100 px-3 py-0.5 text-xs font-semibold text-rose-700">
              {form.formState.errors.occurredAt.message}
            </p>
          )}
        </div>

        {/* Note */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-zinc-700">
            โน้ต <span className="text-zinc-400">(ไม่บังคับ)</span>
          </label>
          <textarea
            rows={4}
            placeholder="เพิ่มรายละเอียด เช่น ร้านอาหาร, จำนวนคน..."
            {...form.register('note')}
            className="w-full rounded-2xl border border-rose-100 bg-white px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
          {form.formState.errors.note && (
            <p className="mt-1 inline-block rounded-full bg-rose-100 px-3 py-0.5 text-xs font-semibold text-rose-700">
              {form.formState.errors.note.message}
            </p>
          )}
        </div>

        {/* Photos */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-zinc-700">
            รูปภาพ <span className="text-zinc-400">(สูงสุด 5 รูป, 10 MB ต่อรูป)</span>
          </label>
          <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-rose-200 bg-rose-50/50 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50">
            <ImagePlus className="h-4 w-4" />
            เพิ่มรูป
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => onPickFiles(e.target.files)}
            />
          </label>
          {fileErr && (
            <p className="mt-1 inline-block rounded-full bg-rose-100 px-3 py-0.5 text-xs font-semibold text-rose-700">
              {fileErr}
            </p>
          )}
          {files.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <AnimatePresence>
                {files.map((f, i) => {
                  const url = URL.createObjectURL(f)
                  return (
                    <motion.div
                      key={`${f.name}-${i}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="relative aspect-square overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-sm"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={f.name} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setFiles(files.filter((_, j) => j !== i))}
                        aria-label="Remove"
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900/70 text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          )}
        </div>

        {submitErr && (
          <div className="rounded-2xl bg-rose-100/80 px-4 py-2 text-sm text-rose-700">
            {submitErr}
          </div>
        )}

        {/* Submit */}
        <div className="fixed inset-x-0 bottom-20 z-20 mx-auto max-w-md px-4 md:relative md:bottom-auto md:px-0">
          <motion.button
            type="submit"
            disabled={submitting}
            whileTap={{ scale: 0.97 }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-400 to-amber-500 py-4 text-base font-bold text-white shadow-lg shadow-rose-300/50 transition-all hover:shadow-xl disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                กำลังบันทึก...
              </>
            ) : (
              <>บันทึกรายการ</>
            )}
          </motion.button>
        </div>
      </form>
    </div>
  )
}
