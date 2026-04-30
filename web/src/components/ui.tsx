'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { cn } from '@/lib/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink/40 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-accent-pink text-dark shadow-md shadow-accent-pink/30 hover:opacity-90 hover:shadow-lg active:scale-95',
        outline:
          'border-2 border-secondary-green/40 bg-primary-white/80 text-secondary-green hover:bg-secondary-green/5 backdrop-blur',
        ghost: 'text-dark/80 hover:bg-accent-pink/10',
        destructive: 'bg-red-500 text-white hover:bg-red-600 shadow-md shadow-red-200/50',
      },
      size: {
        default: 'h-11 px-5 py-2',
        sm: 'h-9 px-3 text-xs',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-3xl border border-secondary-green/20 bg-bg-cream shadow-[0_4px_20px_rgba(124,179,66,0.10)]',
        className,
      )}
      {...props}
    />
  ),
)
Card.displayName = 'Card'

export const MotionCard = React.forwardRef<
  HTMLDivElement,
  HTMLMotionProps<'div'> & { className?: string }
>(({ className, ...props }, ref) => (
  <motion.div
    ref={ref}
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.35, ease: 'easeOut' }}
    className={cn(
      'rounded-3xl border border-secondary-green/20 bg-bg-cream shadow-[0_4px_20px_rgba(124,179,66,0.10)]',
      className,
    )}
    {...props}
  />
))
MotionCard.displayName = 'MotionCard'

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col gap-1 p-5 pb-2', className)} {...props} />
))
CardHeader.displayName = 'CardHeader'

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn('text-base font-semibold leading-none tracking-tight', className)}
    {...props}
  />
))
CardTitle.displayName = 'CardTitle'

export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-5 pt-2', className)} {...props} />
))
CardContent.displayName = 'CardContent'

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'flex h-11 w-full rounded-2xl border border-secondary-green/20 bg-primary-white px-4 py-2 text-sm placeholder:text-dark/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink/40 disabled:opacity-50',
      className,
    )}
    {...props}
  />
))
Input.displayName = 'Input'

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn('text-sm font-medium text-dark/80', className)}
    {...props}
  />
))
Label.displayName = 'Label'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[88px] w-full rounded-2xl border border-secondary-green/20 bg-primary-white px-4 py-3 text-sm placeholder:text-dark/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink/40 disabled:opacity-50',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'income' | 'expense' | 'outline' | 'pending' | 'paid' | 'rejected' | 'later'
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variantCls = {
    default: 'bg-accent-pink/20 text-dark',
    income: 'bg-secondary-green/20 text-secondary-green',
    expense: 'bg-accent-pink/20 text-dark',
    outline: 'border border-secondary-green/40 text-secondary-green bg-primary-white/60 backdrop-blur',
    pending: 'bg-gold/20 text-dark',
    paid: 'bg-secondary-green/20 text-secondary-green',
    rejected: 'bg-red-100 text-red-700',
    later: 'bg-dark/10 text-dark/70',
  }[variant]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        variantCls,
        className,
      )}
      {...props}
    />
  )
}
