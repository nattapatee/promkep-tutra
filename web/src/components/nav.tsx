'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ListOrdered, PlusCircle, CreditCard, Settings, Users } from 'lucide-react'
import { useAuth } from '@/app/providers'
import { cn } from '@/lib/cn'

const links = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transactions', label: 'รายการ', icon: ListOrdered },
  { href: '/transactions/new', label: 'ใหม่', icon: PlusCircle },
  { href: '/debts', label: 'หนี้', icon: CreditCard },
  { href: '/groups', label: 'กลุ่ม', icon: Users },
  { href: '/settings/promptpay', label: 'ตั้งค่า', icon: Settings },
]

export function Nav() {
  const pathname = usePathname()
  const { profile } = useAuth()

  return (
    <header className="sticky top-0 z-20 border-b border-secondary-green/20 bg-primary-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          {links.map(({ href, label, icon: Icon }) => {
            const active =
              href === '/'
                ? pathname === '/'
                : pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-dark text-primary-white'
                    : 'text-dark/70 hover:bg-accent-pink/10 hover:text-dark',
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            )
          })}
        </div>
        <div className="flex items-center gap-2 pl-2">
          {profile?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarUrl}
              alt={profile.displayName}
              className="h-7 w-7 rounded-full"
            />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-pink/20 text-xs font-semibold text-dark">
              {profile?.displayName?.[0] ?? '?'}
            </div>
          )}
          <span className="hidden text-sm text-dark/80 sm:inline">
            {profile?.displayName ?? '...'}
          </span>
        </div>
      </div>
    </header>
  )
}
