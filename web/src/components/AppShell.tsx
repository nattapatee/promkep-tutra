'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  ListOrdered,
  CreditCard,
  Settings,
  Menu,
  Plus,
  Receipt,
  Users,
  MessageCircle,
  X,
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
  { href: '/settings', label: 'ตั้งค่า', icon: Settings },
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

interface AppShellProps {
  children: React.ReactNode
}

const MENU_ITEMS = [
  { href: '/transactions/new', label: 'เพิ่มรายการ', icon: Plus, color: 'from-accent-pink to-rose-400' },
  { href: '/categories', label: 'หมวดหมู่', icon: Receipt, color: 'from-amber-400 to-orange-400' },
  { href: '/groups', label: 'กลุ่ม', icon: Users, color: 'from-sky-400 to-blue-500' },
  { href: '/chat', label: 'คุยกับตุ๊ต๊ะ', icon: MessageCircle, color: 'from-secondary-green to-emerald-500' },
]

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname()
  const { profile, ready, authHeaders } = useAuth()
  const [menuOpen, setMenuOpen] = React.useState(false)

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
            <Link
              href="/chat"
              className={cn(
                'flex items-center gap-1.5 rounded-2xl px-3 py-1.5 text-sm font-medium transition-colors',
                isActive(pathname, '/chat')
                  ? 'bg-secondary-green text-primary-white shadow-md shadow-secondary-green/30'
                  : 'text-dark/70 hover:bg-accent-pink/10 hover:text-secondary-green',
              )}
            >
              <MessageCircle className="h-4 w-4" />
              <span>ตุ๊ต๊ะ</span>
            </Link>
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

      <nav className="fixed inset-x-0 bottom-0 z-30 md:hidden">
        <div className="mx-auto max-w-3xl px-4 pb-3">
          <div className="flex items-center justify-between rounded-3xl border border-secondary-green/15 bg-primary-white/90 px-2 py-2 shadow-[0_-4px_24px_rgba(124,179,66,0.12)] backdrop-blur-xl">
            {[NAV_ITEMS[0], NAV_ITEMS[1], NAV_ITEMS[2]].map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-semibold transition-all duration-200',
                    active
                      ? 'bg-secondary-green/10 text-secondary-green'
                      : 'text-dark/50 hover:text-secondary-green/80',
                  )}
                >
                  <Icon className={cn('h-5 w-5 transition-transform', active && 'scale-110')} />
                  <span>{label}</span>
                </Link>
              )
            })}

            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="เมนู"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-secondary-green to-emerald-400 text-primary-white shadow-lg shadow-secondary-green/30 ring-4 ring-primary-white transition-transform active:scale-90"
            >
              <Menu className="h-6 w-6" />
            </button>

            {[NAV_ITEMS[3]].map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-semibold transition-all duration-200',
                    active
                      ? 'bg-secondary-green/10 text-secondary-green'
                      : 'text-dark/50 hover:text-secondary-green/80',
                  )}
                >
                  <Icon className={cn('h-5 w-5 transition-transform', active && 'scale-110')} />
                  <span>{label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur md:hidden"
            onClick={() => setMenuOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 32 }}
              className="w-full max-w-sm rounded-t-3xl bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-zinc-800">เมนู</h2>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {MENU_ITEMS.map((item) => {
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className="flex flex-col items-center gap-2 rounded-2xl border border-rose-100/60 p-4 transition-all active:scale-95"
                    >
                      <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md', item.color)}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <span className="text-xs font-semibold text-zinc-700">{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
