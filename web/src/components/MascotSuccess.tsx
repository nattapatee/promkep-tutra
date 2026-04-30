'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MascotAvatar } from './MascotAvatar'
import { cn } from '@/lib/cn'

interface MascotSuccessProps {
  message?: string
  onDismiss?: () => void
  duration?: number
  className?: string
}

const confettiColors = ['#7CB342', '#F48FB1', '#FFD700', '#FFECB3', '#FFFFFF']

interface Particle {
  id: number
  x: number
  y: number
  color: string
  size: number
  rotation: number
  delay: number
}

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: (Math.random() - 0.5) * 240,
    y: (Math.random() - 0.5) * 120 - 40,
    color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
    size: Math.random() * 6 + 4,
    rotation: Math.random() * 360,
    delay: Math.random() * 0.15,
  }))
}

export function MascotSuccess({
  message,
  onDismiss,
  duration = 3000,
  className,
}: MascotSuccessProps) {
  const [visible, setVisible] = useState(true)
  const [particles] = useState(() => generateParticles(24))

  const handleDismiss = useCallback(() => {
    setVisible(false)
    setTimeout(() => onDismiss?.(), 350)
  }, [onDismiss])

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(handleDismiss, duration)
      return () => clearTimeout(timer)
    }
  }, [duration, handleDismiss])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className={cn(
            'relative flex flex-col items-center gap-4 overflow-hidden rounded-3xl border border-secondary-green/30 bg-bg-cream p-8 shadow-lg',
            className,
          )}
        >
          {/* Confetti particles */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {particles.map((p) => (
              <motion.div
                key={p.id}
                initial={{
                  x: 0,
                  y: 0,
                  opacity: 1,
                  scale: 0,
                  rotate: 0,
                }}
                animate={{
                  x: p.x,
                  y: [0, p.y, p.y + 120],
                  opacity: [1, 1, 0],
                  scale: [0, 1, 0.6],
                  rotate: p.rotation,
                }}
                transition={{
                  duration: 1.2,
                  delay: p.delay,
                  ease: 'easeOut',
                }}
                className="absolute rounded-sm"
                style={{
                  width: p.size,
                  height: p.size * 0.6,
                  backgroundColor: p.color,
                }}
              />
            ))}
          </div>

          <MascotAvatar size="lg" animate="celebrate" />

          {message && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.3 }}
              className="text-center text-base font-semibold text-dark"
            >
              {message}
            </motion.p>
          )}

          {onDismiss && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              onClick={handleDismiss}
              className="mt-1 rounded-full bg-secondary-green/10 px-4 py-1.5 text-xs font-medium text-secondary-green transition-colors hover:bg-secondary-green/20"
            >
              ปิด
            </motion.button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
