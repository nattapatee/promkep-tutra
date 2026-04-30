'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMutation } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/app/providers'
import { api } from '@/lib/api'
import { MascotButton } from '@/components/MascotButton'
import { Input, Label } from '@/components/ui'

export default function NewGroupPage() {
  const router = useRouter()
  const { ready, error, authHeaders, retry } = useAuth()
  const [name, setName] = React.useState('')
  const [submitErr, setSubmitErr] = React.useState<string | null>(null)
  const [createdCode, setCreatedCode] = React.useState<string | null>(null)

  const createMut = useMutation({
    mutationFn: () => api.createGroup(authHeaders, { name: name.trim() }),
    onSuccess: (data) => {
      setCreatedCode(data.code)
      setTimeout(() => {
        router.push('/groups')
      }, 2500)
    },
    onError: (e: unknown) => {
      setSubmitErr(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitErr(null)
    if (!name.trim()) {
      setSubmitErr('กรุณากรอกชื่อกลุ่ม')
      return
    }
    createMut.mutate()
  }

  if (error) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-rose-600">Auth error: {error}</p>
        <MascotButton onClick={retry}>Retry</MascotButton>
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

  if (createdCode) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-4 py-16 text-center"
      >
        <CheckCircle2 className="h-16 w-16 text-secondary-green" />
        <div className="space-y-1">
          <p className="text-lg font-bold text-dark">สร้างกลุ่มสำเร็จ!</p>
          <p className="text-sm text-zinc-500">รหัสเข้าร่วมกลุ่มของคุณ</p>
        </div>
        <div className="rounded-2xl bg-bg-warm px-8 py-4">
          <p className="text-3xl font-extrabold tracking-widest text-dark">{createdCode}</p>
        </div>
        <p className="text-xs text-zinc-400">กำลังกลับไปยังหน้ากลุ่ม...</p>
      </motion.div>
    )
  }

  return (
    <div className="space-y-5 pb-24">
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
          className="text-xl font-bold text-zinc-800"
        >
          สร้างกลุ่มใหม่
        </motion.h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-3xl border border-rose-100/60 bg-white p-5 shadow-[0_4px_20px_rgba(251,113,133,0.10)]"
        >
          <Label htmlFor="group-name" className="mb-2 block">
            ชื่อกลุ่ม <span className="text-rose-500">*</span>
          </Label>
          <Input
            id="group-name"
            type="text"
            maxLength={200}
            placeholder="เช่น ทริปเชียงใหม่, กลุ่มบ้าน"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full"
          />
        </motion.div>

        {submitErr && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl bg-rose-100/80 px-4 py-2 text-sm text-rose-700"
          >
            {submitErr}
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex gap-3"
        >
          <MascotButton
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={() => router.push('/groups')}
          >
            ยกเลิก
          </MascotButton>
          <MascotButton
            type="submit"
            disabled={createMut.isPending}
            className="flex-1"
          >
            {createMut.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                กำลังสร้าง...
              </>
            ) : (
              'สร้างกลุ่ม'
            )}
          </MascotButton>
        </motion.div>
      </form>
    </div>
  )
}
