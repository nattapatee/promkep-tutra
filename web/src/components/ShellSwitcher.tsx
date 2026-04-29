'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { AppShell } from './AppShell'

interface ShellSwitcherProps {
  children: React.ReactNode
}

export function ShellSwitcher({ children }: ShellSwitcherProps) {
  const pathname = usePathname()
  if (pathname === '/register') {
    return <>{children}</>
  }
  return <AppShell>{children}</AppShell>
}
