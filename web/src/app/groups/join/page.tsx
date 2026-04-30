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

export default function JoinGroupPage() {
  const router = useRouter()
  const { ready, error, authHeaders, retry } = useAuth()
  const [code, setCode] = React.useState('')
  const [submitErr, setSubmitErr] = React.useState<string | null>(null)
  const [joinedName, setJoinedName] = React.useState<string | null>(null)

  const joinMut = useMutation({
    mutationFn: () => api.joinGroup(authHeaders, { code: code.trim() }),
    onSuccess: (data) => {
      setJoinedName(data.name)
      setTimeout(() => {
        router.push('/groups')
      }, 2000)
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'เกิดข้อผิดพลาด'
      if (msg.includes('already_member')) {
        setSubmitErr('คุณเป็นสมาชิกกลุ่มนี้อยู่แล้ว')
      } else if (msg.includes('group_not_found') || msg.includes('404')) {
        setSubmitErr('ไม่พบกลุ่มที่มีรหัสนี้')
      } else {
        setSubmitErr(msg)
      }
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitErr(null)
    const trimmed = code.trim()
    if (!trimmed) {
      setSubmitErr('กรุณากรอกรหัส 6 หลัก')
      return
    }
    if (!/^\d{6}$/.test(trimmed)) {
      setSubmitErr('รหัสต้องเป็นตัวเลข 6 หลัก')
      return
    }
    joinMut.mutate()
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

  if (joinedName) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-4 py-16 text-center"
      >
        <CheckCircle2 className="h-16 w-16 text-secondary-green" />
        <div className="space-y-1">
          <p className="text-lg font-bold text-dark">เข้าร่วมสำเร็จ!</p>
          <p className="text-sm text-zinc-500">
            คุณได้เข้าร่วมกลุ่ม <span className="font-semibold text-dark">{joinedName}</span>
          </p>
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
          เข้าร่วมกลุ่ม
        </motion.h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-3xl border border-rose-100/60 bg-white p-5 shadow-[0_4px_20px_rgba(251,113,133,0.10)]"
        >
          <Label htmlFor="group-code" className="mb-2 block">
            รหัส 6 หลัก <span className="text-rose-500">*</span>
          </Label>
          <Input
            id="group-code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 6)
              setCode(val)
            }}
            className="w-full text-center text-2xl font-bold tracking-widest"
          />
          <p className="mt-2 text-xs text-zinc-400">กรอกรหัส 6 หลักที่ได้จากเจ้าของกลุ่ม</p>
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
            disabled={joinMut.isPending}
            className="flex-1"
          >
            {joinMut.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                กำลังเข้าร่วม...
              </>
            ) : (
              'เข้าร่วมกลุ่ม'
            )}
          </MascotButton>
        </motion.div>
      </form>
    </div>
  )
}
