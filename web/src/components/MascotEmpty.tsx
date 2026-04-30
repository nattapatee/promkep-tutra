'use client'

import { motion } from 'framer-motion'
import { MascotAvatar } from './MascotAvatar'
import { cn } from '@/lib/cn'

interface MascotEmptyProps {
  message: string
  children?: React.ReactNode
  className?: string
}

export function MascotEmpty({ message, children, className }: MascotEmptyProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={cn(
        'flex flex-col items-center gap-5 rounded-3xl border border-secondary-green/20 bg-bg-cream p-8 text-center shadow-sm',
        className,
      )}
    >
      <MascotAvatar size="lg" animate="thinking" />

      <div className="flex flex-col items-center gap-2">
        <p className="text-base font-medium text-dark">{message}</p>
        {children && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
          >
            {children}
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
