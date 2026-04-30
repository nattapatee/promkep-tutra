'use client'

import * as React from 'react'
import { cn } from '@/lib/cn'

interface MascotCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'outlined'
  children: React.ReactNode
}

export const MascotCard = React.forwardRef<HTMLDivElement, MascotCardProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-2xl bg-bg-cream p-5 transition-shadow duration-200 hover:shadow-lg',
          variant === 'outlined' && 'border-2 border-secondary-green/40',
          variant === 'default' && 'shadow-md shadow-dark/5',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    )
  },
)
MascotCard.displayName = 'MascotCard'
