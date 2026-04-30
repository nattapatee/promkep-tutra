'use client'

import { motion } from 'framer-motion'
import { MascotAvatar } from './MascotAvatar'
import { Button } from './ui'
import { cn } from '@/lib/cn'
import { RotateCcw } from 'lucide-react'

interface MascotErrorProps {
  message: string
  onRetry?: () => void
  className?: string
}

export function MascotError({ message, onRetry, className }: MascotErrorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={cn(
        'flex flex-col items-center gap-5 rounded-3xl border border-red-200 bg-red-50/60 p-8 text-center shadow-sm backdrop-blur-sm',
        className,
      )}
    >
      <motion.div
        animate={{ rotate: [-3, 3, -3, 3, 0] }}
        transition={{ duration: 0.6, delay: 0.4, ease: 'easeInOut' }}
      >
        <MascotAvatar size="lg" animate={false} />
      </motion.div>

      <div className="flex flex-col items-center gap-3">
        <p className="text-base font-medium text-red-700">{message}</p>
        {onRetry && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
          >
            <Button variant="outline" onClick={onRetry}>
              <RotateCcw className="h-4 w-4" />
              ลองใหม่อีกครั้ง
            </Button>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
