'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import { Pencil, Plus, Power, Loader2, X } from 'lucide-react'
import { useAuth } from '@/app/providers'
import { api, type ApiCategory, type ApiUser, type AuthHeaders } from '@/lib/api'
import { cn } from '@/lib/cn'

const createSchema = z.object({
  name: z.string().min(1, 'กรอกชื่อหมวด').max(50, 'สูงสุด 50 ตัวอักษร'),
  type: z.enum(['income', 'expense']),
  icon: z.string().max(50).optional().or(z.literal('')),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'ใช้ hex 6 หลัก เช่น #FB7185')
    .optional()
    .or(z.literal('')),
})

type CreateValues = z.infer<typeof createSchema>

const editSchema = z.object({
  name: z.string().min(1).max(50),
  icon: z.string().max(50).optional().or(z.literal('')),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'ใช้ hex 6 หลัก')
    .optional()
    .or(z.literal('')),
})

type EditValues = z.infer<typeof editSchema>

export default function CategoriesPage() {
  const { ready, error, authHeaders, retry } = useAuth()
  const [showDisabled, setShowDisabled] = React.useState(false)
  const [editingId, setEditingId] = React.useState<number | null>(null)
  const [showAddModal, setShowAddModal] = React.useState(false)

  const meQuery = useQuery<ApiUser>({
    queryKey: ['me', authHeaders.lineUserId],
    queryFn: () => api.me(authHeaders),
    enabled: ready,
  })
  const isAdmin = meQuery.data?.role === 'admin'

  const { data, isLoading } = useQuery<ApiCategory[]>({
    queryKey: ['categories', { includeDisabled: showDisabled }],
    queryFn: () => api.listCategories({ includeDisabled: showDisabled }),
    enabled: ready,
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
  if (!ready) return <p className="p-4 text-zinc-500">Loading...</p>

  const income = (data ?? []).filter((c) => c.type === 'income')
  const expense = (data ?? []).filter((c) => c.type === 'expense')

  return (
    <div data-testid="categories-page" className="space-y-5 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-800">หมวดหมู่</h1>
        {meQuery.data && (
          <span
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold',
              isAdmin
                ? 'bg-gradient-to-r from-emerald-400 to-teal-500 text-white shadow-sm'
                : 'bg-rose-50 text-rose-700',
            )}
          >
            {isAdmin ? '👑 Admin' : meQuery.data.role}
          </span>
        )}
      </div>

      {/* Show-disabled toggle */}
      <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-rose-100/60 bg-white px-4 py-3 shadow-sm">
        <span className="flex-1 text-sm font-medium text-zinc-700">
          แสดงรายการที่ปิดใช้
        </span>
        <span
          onClick={() => setShowDisabled((v) => !v)}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
            showDisabled ? 'bg-gradient-to-r from-rose-400 to-amber-500' : 'bg-zinc-200',
          )}
        >
          <motion.span
            layout
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className={cn(
              'inline-block h-5 w-5 rounded-full bg-white shadow',
              showDisabled ? 'ml-5' : 'ml-0.5',
            )}
          />
        </span>
        <input
          type="checkbox"
          checked={showDisabled}
          onChange={(e) => setShowDisabled(e.target.checked)}
          className="sr-only"
        />
      </label>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          กำลังโหลด...
        </div>
      )}

      <Section
        title="รายรับ"
        emoji="💰"
        accent="emerald"
        items={income}
        isAdmin={isAdmin}
        editingId={editingId}
        onStartEdit={setEditingId}
        onCancelEdit={() => setEditingId(null)}
        authHeaders={authHeaders}
      />
      <Section
        title="รายจ่าย"
        emoji="💸"
        accent="rose"
        items={expense}
        isAdmin={isAdmin}
        editingId={editingId}
        onStartEdit={setEditingId}
        onCancelEdit={() => setEditingId(null)}
        authHeaders={authHeaders}
      />

      {/* Add FAB */}
      {isAdmin && (
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          onClick={() => setShowAddModal(true)}
          aria-label="Add custom category"
          className="fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#FB7185] to-[#F59E0B] text-white shadow-lg shadow-rose-300/60 ring-4 ring-white md:bottom-8"
        >
          <Plus className="h-6 w-6" />
        </motion.button>
      )}

      {/* Add modal */}
      <AnimatePresence>
        {showAddModal && (
          <AddCategoryModal
            authHeaders={authHeaders}
            onClose={() => setShowAddModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

interface SectionProps {
  title: string
  emoji: string
  accent: 'emerald' | 'rose'
  items: ApiCategory[]
  isAdmin: boolean
  editingId: number | null
  onStartEdit: (id: number) => void
  onCancelEdit: () => void
  authHeaders: AuthHeaders
}

function Section({
  title,
  emoji,
  accent,
  items,
  isAdmin,
  editingId,
  onStartEdit,
  onCancelEdit,
  authHeaders,
}: SectionProps) {
  return (
    <section>
      <h2
        className={cn(
          'mb-3 text-2xl font-bold tracking-tight',
          accent === 'emerald' ? 'text-emerald-600' : 'text-rose-600',
        )}
      >
        {emoji} {title}
        <span className="ml-2 text-sm font-medium text-zinc-400">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-400">ไม่มีหมวด</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((c) => (
            <div key={c.id}>
              <CategoryCard
                category={c}
                isAdmin={isAdmin}
                onStartEdit={() => onStartEdit(c.id)}
                authHeaders={authHeaders}
              />
              <AnimatePresence initial={false}>
                {editingId === c.id && isAdmin && (
                  <motion.div
                    key="edit"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <EditRow
                      category={c}
                      authHeaders={authHeaders}
                      onDone={onCancelEdit}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

interface CategoryCardProps {
  category: ApiCategory
  isAdmin: boolean
  onStartEdit: () => void
  authHeaders: AuthHeaders
}

function CategoryCard({ category, isAdmin, onStartEdit, authHeaders }: CategoryCardProps) {
  const qc = useQueryClient()
  const toggleMut = useMutation({
    mutationFn: () =>
      api.updateCategory(authHeaders, category.id, { disabled: !category.disabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })

  const initials = category.name.slice(0, 2)
  const bg = category.color ?? (category.type === 'income' ? '#10B981' : '#FB7185')

  return (
    <motion.div
      layout
      className={cn(
        'flex items-center gap-3 rounded-2xl border border-rose-100/60 bg-white p-3 shadow-[0_4px_20px_rgba(251,113,133,0.08)] transition-opacity',
        category.disabled && 'opacity-60',
      )}
    >
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-sm"
        style={{ backgroundColor: bg }}
      >
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-zinc-800">{category.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-bold',
              category.isDefault
                ? 'bg-zinc-100 text-zinc-600'
                : 'bg-rose-100 text-rose-700',
            )}
          >
            {category.isDefault ? 'default' : 'custom'}
          </span>
          {category.disabled && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              ปิดใช้
            </span>
          )}
          {category.icon && (
            <span className="text-[10px] text-zinc-400">{category.icon}</span>
          )}
        </div>
      </div>
      {isAdmin && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onStartEdit}
            aria-label="Edit"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 text-rose-600 transition-colors hover:bg-rose-100"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => toggleMut.mutate()}
            disabled={toggleMut.isPending}
            aria-label={category.disabled ? 'Enable' : 'Disable'}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-50',
              category.disabled
                ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                : 'bg-amber-50 text-amber-600 hover:bg-amber-100',
            )}
          >
            <Power className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </motion.div>
  )
}

interface EditRowProps {
  category: ApiCategory
  authHeaders: AuthHeaders
  onDone: () => void
}

function EditRow({ category, authHeaders, onDone }: EditRowProps) {
  const qc = useQueryClient()
  const [err, setErr] = React.useState<string | null>(null)
  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: category.name,
      icon: category.icon ?? '',
      color: category.color ?? '',
    },
  })

  const updateMut = useMutation({
    mutationFn: (values: EditValues) =>
      api.updateCategory(authHeaders, category.id, {
        name: values.name,
        icon: values.icon ? values.icon : null,
        color: values.color ? values.color : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      setErr(null)
      onDone()
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : 'failed'),
  })

  return (
    <form
      onSubmit={form.handleSubmit((v) => updateMut.mutate(v))}
      className="mt-2 space-y-3 rounded-2xl bg-rose-50 p-4"
    >
      <div>
        <label className="mb-1 block text-xs font-semibold text-zinc-600">ชื่อ</label>
        <input
          {...form.register('name')}
          className="w-full rounded-2xl border border-rose-100 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
        />
        {form.formState.errors.name && (
          <p className="mt-1 inline-block rounded-full bg-rose-100 px-3 py-0.5 text-xs font-semibold text-rose-700">
            {form.formState.errors.name.message}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-zinc-600">
            ไอคอน (lucide)
          </label>
          <input
            placeholder="package"
            {...form.register('icon')}
            className="w-full rounded-2xl border border-rose-100 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-zinc-600">สี (hex)</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.watch('color') || '#fb7185'}
              onChange={(e) => form.setValue('color', e.target.value)}
              className="h-9 w-9 cursor-pointer rounded-xl border border-rose-100 bg-white p-1"
            />
            <input
              placeholder="#FB7185"
              {...form.register('color')}
              className="flex-1 rounded-2xl border border-rose-100 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
          </div>
          {form.formState.errors.color && (
            <p className="mt-1 inline-block rounded-full bg-rose-100 px-3 py-0.5 text-xs font-semibold text-rose-700">
              {form.formState.errors.color.message}
            </p>
          )}
        </div>
      </div>
      {err && (
        <p className="inline-block rounded-full bg-rose-100 px-3 py-0.5 text-xs font-semibold text-rose-700">
          {err}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDone}
          className="flex-1 rounded-2xl bg-white py-2 text-sm font-semibold text-zinc-700"
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={updateMut.isPending}
          className="flex-1 rounded-2xl bg-gradient-to-r from-rose-400 to-amber-500 py-2 text-sm font-semibold text-white shadow-md disabled:opacity-60"
        >
          {updateMut.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>
    </form>
  )
}

interface AddCategoryModalProps {
  authHeaders: AuthHeaders
  onClose: () => void
}

function AddCategoryModal({ authHeaders, onClose }: AddCategoryModalProps) {
  const qc = useQueryClient()
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: '', type: 'expense', icon: '', color: '#FB7185' },
  })
  const createMut = useMutation({
    mutationFn: (v: CreateValues) =>
      api.createCategory(authHeaders, {
        name: v.name,
        type: v.type,
        icon: v.icon ? v.icon : undefined,
        color: v.color ? v.color : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      onClose()
    },
  })
  const submitErr = createMut.error instanceof Error ? createMut.error.message : null
  const watchType = form.watch('type')

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/60 p-0 backdrop-blur md:items-center md:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 50, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-xl md:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-800">เพิ่มหมวดใหม่</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form
          onSubmit={form.handleSubmit((v) => createMut.mutate(v))}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-2 rounded-full bg-rose-100 p-1.5">
            {(['income', 'expense'] as const).map((opt) => {
              const selected = watchType === opt
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => form.setValue('type', opt)}
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
            <label className="mb-1 block text-xs font-semibold text-zinc-600">ชื่อ</label>
            <input
              {...form.register('name')}
              placeholder="เช่น โบนัส, อาหารเช้า"
              className="w-full rounded-2xl border border-rose-100 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
            {form.formState.errors.name && (
              <p className="mt-1 inline-block rounded-full bg-rose-100 px-3 py-0.5 text-xs font-semibold text-rose-700">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600">
                ไอคอน
              </label>
              <input
                {...form.register('icon')}
                placeholder="package"
                className="w-full rounded-2xl border border-rose-100 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600">สี</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.watch('color') || '#FB7185'}
                  onChange={(e) => form.setValue('color', e.target.value)}
                  className="h-9 w-9 cursor-pointer rounded-xl border border-rose-100 bg-white p-1"
                />
                <input
                  {...form.register('color')}
                  placeholder="#FB7185"
                  className="flex-1 rounded-2xl border border-rose-100 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                />
              </div>
              {form.formState.errors.color && (
                <p className="mt-1 inline-block rounded-full bg-rose-100 px-3 py-0.5 text-xs font-semibold text-rose-700">
                  {form.formState.errors.color.message}
                </p>
              )}
            </div>
          </div>

          {submitErr && (
            <p className="rounded-2xl bg-rose-100/80 px-4 py-2 text-sm text-rose-700">
              {submitErr}
            </p>
          )}

          <button
            type="submit"
            disabled={createMut.isPending}
            className="flex w-full items-center justify-center gap-1 rounded-2xl bg-gradient-to-r from-rose-400 to-amber-500 py-3 text-sm font-bold text-white shadow-md disabled:opacity-60"
          >
            {createMut.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                กำลังสร้าง...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> เพิ่มหมวด
              </>
            )}
          </button>
        </form>
      </motion.div>
    </motion.div>
  )
}
