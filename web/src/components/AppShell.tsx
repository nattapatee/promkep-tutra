'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  ListOrdered,
  Plus,
  CreditCard,
  Settings,
} from 'lucide-react'
import { useAuth } from '@/app/providers'
import { api, type ApiUser } from '@/lib/api'
import { cn } from '@/lib/cn'
import { MascotAvatar } from './MascotAvatar'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transactions', label: 'รายการ', icon: ListOrdered },
  { href: '/debts', label: 'หนี้', icon: CreditCard },
  { href: '/settings/promptpay', label: 'ตั้งค่า', icon: Settings },
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname()
  const { profile, ready, authHeaders } = useAuth()

  const meQuery = useQuery<ApiUser>({
    queryKey: ['me', authHeaders.lineUserId],
    queryFn: () => api.me(authHeaders),
    enabled: ready,
    retry: false,
  })

  const avatarUrl = meQuery.data?.avatarUrl ?? profile?.avatarUrl ?? null
  const displayName = meQuery.data?.displayName ?? profile?.displayName ?? '...'
  const initial = displayName?.[0] ?? '?'

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      <header className="sticky top-0 z-30 border-b border-secondary-green/20 bg-primary-white/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-accent-pink text-white shadow-md shadow-accent-pink/30">
              <MascotAvatar size="sm" className="h-6 w-6" />
            </span>
            <span className="text-base font-bold tracking-tight text-dark">
              PromKep-Tutra
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-1.5 rounded-2xl px-3 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-secondary-green text-primary-white shadow-md shadow-secondary-green/30'
                      : 'text-dark/70 hover:bg-accent-pink/10 hover:text-secondary-green',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-2">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={displayName}
                className="h-9 w-9 rounded-full ring-2 ring-secondary-green/40"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-pink/20 text-sm font-bold text-dark">
                {initial}
              </div>
            )}
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="mx-auto max-w-3xl px-4 py-5"
        >
          {children}
        </motion.main>
      </AnimatePresence>

      {/* Bottom mobile nav: Dashboard / Transactions / FAB(+) / Debts / Settings */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-secondary-green/20 bg-primary-white/85 backdrop-blur-xl md:hidden">
        <div className="mx-auto grid max-w-3xl grid-cols-5 items-end px-2 pb-2 pt-1">
          {[NAV_ITEMS[0], NAV_ITEMS[1]].map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-[10px] font-medium transition-colors',
                  active ? 'text-secondary-green' : 'text-dark/60 hover:text-secondary-green',
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
              </Link>
            )
          })}

          {/* FAB */}
          <div className="flex justify-center">
            <Link
              href="/transactions/new"
              aria-label="เพิ่มรายการ"
              className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-accent-pink text-primary-white shadow-lg shadow-accent-pink/40 ring-4 ring-primary-white transition-transform active:scale-95"
            >
              <Plus className="h-6 w-6" />
            </Link>
          </div>

          {[NAV_ITEMS[2], NAV_ITEMS[3]].map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-[10px] font-medium transition-colors',
                  active ? 'text-secondary-green' : 'text-dark/60 hover:text-secondary-green',
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
