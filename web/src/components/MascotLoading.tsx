'use client'

import { motion } from 'framer-motion'
import { MascotAvatar } from './MascotAvatar'
import { cn } from '@/lib/cn'

interface MascotLoadingProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  text?: string
  fullScreen?: boolean
  className?: string
}

export function MascotLoading({
  size = 'md',
  text,
  fullScreen = false,
  className,
}: MascotLoadingProps) {
  const content = (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      <MascotAvatar size={size} animate="bounce" />
      {text && (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="text-sm font-medium text-dark/70"
        >
          {text}
        </motion.p>
      )}
    </div>
  )

  if (fullScreen) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-bg-cream/90 backdrop-blur-sm"
      >
        {content}
      </motion.div>
    )
  }

  return content
}
