'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { useAuth, useInvalidateMe } from '@/app/providers'
import { api, type ApiUser } from '@/lib/api'

function fireConfetti() {
  const duration = 1200
  const end = Date.now() + duration
  const colors = ['#FB7185', '#F59E0B', '#10B981', '#0EA5E9', '#FACC15']
  const frame = () => {
    confetti({
      particleCount: 4,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors,
    })
    confetti({
      particleCount: 4,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors,
    })
    if (Date.now() < end) requestAnimationFrame(frame)
  }
  frame()
}

export default function RegisterPage() {
  const router = useRouter()
  const { ready, error, profile, authHeaders, retry } = useAuth()
  const invalidateMe = useInvalidateMe()

  const meQuery = useQuery<ApiUser>({
    queryKey: ['me', authHeaders.lineUserId],
    queryFn: () => api.me(authHeaders),
    enabled: ready,
    retry: false,
  })

  React.useEffect(() => {
    if (meQuery.data?.registered === true) {
      router.replace('/')
    }
  }, [meQuery.data, router])

  const registerMut = useMutation({
    mutationFn: () => api.register(authHeaders, {}),
    onSuccess: () => {
      fireConfetti()
      invalidateMe()
      setTimeout(() => router.push('/'), 700)
    },
  })

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-rose-200 via-orange-200 to-amber-100 p-6">
        <div className="rounded-3xl bg-white/80 p-6 shadow-lg backdrop-blur">
          <p className="mb-3 text-rose-600">Auth error: {error}</p>
          <button
            onClick={retry}
            className="rounded-2xl bg-gradient-to-r from-[#FB7185] to-[#F59E0B] px-4 py-2 text-sm font-semibold text-white"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-rose-200 via-orange-200 to-amber-100">
        <p className="text-rose-700">Loading...</p>
      </div>
    )
  }

  const submitting = registerMut.isPending
  const submitErr = registerMut.error instanceof Error ? registerMut.error.message : null

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-200 via-orange-200 to-amber-100">
      <div className="mx-auto max-w-md px-5 py-10">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8 flex items-center gap-4"
        >
          {profile?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarUrl}
              alt={profile.displayName}
              className="h-16 w-16 rounded-full ring-4 ring-white shadow-md"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-2xl font-bold text-rose-600 shadow-md ring-4 ring-white">
              {profile?.displayName?.[0] ?? '?'}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-zinc-800">
              ยินดีต้อนรับ {profile?.displayName ?? ''}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              ระบบจะดึงชื่อจาก LINE อัตโนมัติ
            </p>
          </div>
        </motion.div>

        {submitErr && (
          <div className="mb-4 rounded-2xl bg-rose-100/80 px-4 py-2 text-sm text-rose-700">
            {submitErr}
          </div>
        )}

        <motion.button
          type="button"
          disabled={submitting}
          whileTap={{ scale: 0.97 }}
          onClick={() => registerMut.mutate()}
          className="w-full rounded-2xl bg-gradient-to-r from-rose-400 to-amber-500 py-4 text-base font-bold text-white shadow-lg shadow-rose-300/50 transition-all hover:shadow-xl disabled:opacity-60"
        >
          {submitting ? 'กำลังบันทึก...' : 'ลงทะเบียน'}
        </motion.button>
      </div>
    </div>
  )
}
