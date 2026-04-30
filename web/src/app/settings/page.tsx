'use client'

import * as React from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { QrCode, Users, ChevronRight } from 'lucide-react'
import { useAuth } from '@/app/providers'

const SETTINGS_ITEMS = [
  {
    href: '/settings/promptpay',
    label: 'PromptPay',
    description: 'จัดการบัญชีรับเงิน',
    icon: QrCode,
  },
  {
    href: '/groups',
    label: 'กลุ่ม',
    description: 'จัดการกลุ่มของคุณ',
    icon: Users,
  },
]

export default function SettingsPage() {
  const { ready } = useAuth()

  if (!ready) {
    return (
      <div className="flex items-center justify-center p-8 text-zinc-500">
        กำลังโหลด...
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-24">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <h1 className="text-2xl font-bold tracking-tight text-zinc-800">ตั้งค่า</h1>
        <p className="mt-1 text-sm text-zinc-500">จัดการบัญชีและการตั้งค่า</p>
      </motion.div>

      <div className="space-y-3">
        {SETTINGS_ITEMS.map((item, i) => {
          const Icon = item.icon
          return (
            <motion.div
              key={item.href}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                href={item.href}
                className="flex items-center gap-4 rounded-3xl border border-rose-100/60 bg-white p-4 shadow-[0_4px_20px_rgba(251,113,133,0.08)] transition-all hover:shadow-lg hover:ring-2 hover:ring-secondary-green/20"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-400 to-amber-500 text-white shadow-md">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-zinc-800">{item.label}</p>
                  <p className="text-xs text-zinc-500">{item.description}</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400" />
              </Link>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
