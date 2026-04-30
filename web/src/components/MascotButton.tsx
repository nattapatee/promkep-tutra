'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const mascotButtonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink/40 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-accent-pink text-dark shadow-md shadow-accent-pink/30 hover:opacity-90 hover:shadow-lg active:scale-95',
        secondary:
          'border-2 border-secondary-green bg-primary-white text-secondary-green hover:bg-secondary-green/5 hover:shadow-md active:scale-95',
        accent:
          'bg-secondary-green text-primary-white shadow-md shadow-secondary-green/30 hover:opacity-90 hover:shadow-lg active:scale-95',
      },
      size: {
        default: 'h-11 px-5 py-2',
        sm: 'h-9 px-3 text-xs',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
)

export interface MascotButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof mascotButtonVariants> {
  asChild?: boolean
}

export const MascotButton = React.forwardRef<HTMLButtonElement, MascotButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(mascotButtonVariants({ variant, size }), className)}
        {...props}
      />
    )
  },
)
MascotButton.displayName = 'MascotButton'
