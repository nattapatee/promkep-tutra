'use client'

import { motion, type Transition, type Variants } from 'framer-motion'
import { cn } from '@/lib/cn'

export type MascotAnimation =
  | boolean
  | 'bounce'
  | 'wiggle'
  | 'celebrate'
  | 'thinking'

interface MascotAvatarProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  animate?: MascotAnimation
  className?: string
}

const sizeMap = {
  sm: 'h-10 w-10',
  md: 'h-16 w-16',
  lg: 'h-24 w-24',
  xl: 'h-32 w-32',
}

const bounceTransition: Transition = {
  repeat: Infinity,
  duration: 0.6,
  ease: 'easeInOut',
}

const wiggleTransition: Transition = {
  duration: 0.5,
  ease: 'easeInOut',
}

const celebrateTransition: Transition = {
  repeat: Infinity,
  repeatType: 'reverse',
  duration: 0.4,
  ease: 'easeOut',
}

const thinkingTransition: Transition = {
  repeat: Infinity,
  repeatType: 'reverse',
  duration: 1.2,
  ease: 'easeInOut',
}

const containerVariants: Record<string, Variants> = {
  bounce: {
    animate: { y: [0, -10, 0] },
  },
  wiggle: {
    animate: { rotate: [-5, 5, -5, 5, 0] },
  },
  celebrate: {
    animate: { y: [0, -14, 0] },
  },
  thinking: {
    animate: { rotate: [-4, 4, -4, 4, -4] },
  },
}

const armVariants: Record<string, Variants> = {
  celebrate: {
    animate: {
      rotate: [0, -35, 0, -35, 0],
    },
  },
}

const headVariants: Record<string, Variants> = {
  thinking: {
    animate: {
      rotate: [-6, 6, -6, 6, -6],
      x: [0, 2, 0, -2, 0],
    },
  },
}

function resolveAnimation(
  animate: MascotAnimation,
): { variant: string | null; transition: Transition | undefined } {
  if (animate === true || animate === 'bounce') {
    return { variant: 'bounce', transition: bounceTransition }
  }
  if (animate === 'wiggle') {
    return { variant: 'wiggle', transition: wiggleTransition }
  }
  if (animate === 'celebrate') {
    return { variant: 'celebrate', transition: celebrateTransition }
  }
  if (animate === 'thinking') {
    return { variant: 'thinking', transition: thinkingTransition }
  }
  return { variant: null, transition: undefined }
}

export function MascotAvatar({
  size = 'md',
  animate = false,
  className,
}: MascotAvatarProps) {
  const { variant, transition } = resolveAnimation(animate)

  const MotionSvg = motion.create('svg')
  const MotionG = motion.create('g')

  return (
    <div
      className={cn(
        'relative inline-flex items-center justify-center',
        sizeMap[size],
        className,
      )}
    >
      <MotionSvg
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
        {...(variant && containerVariants[variant]
          ? {
              animate: 'animate',
              variants: containerVariants[variant],
              transition,
            }
          : {})}
      >
        {/* Body / Shirt */}
        <ellipse cx="60" cy="100" rx="42" ry="18" fill="#212121" />
        <path
          d="M24 92 Q18 85 20 78 Q22 70 30 68 L90 68 Q98 70 100 78 Q102 85 96 92 Z"
          fill="#212121"
        />
        {/* Neck */}
        <rect x="50" y="55" width="20" height="15" fill="#FFFFFF" />

        {/* Left Arm */}
        <MotionG
          {...(variant === 'celebrate' && armVariants.celebrate
            ? {
                animate: 'animate',
                variants: armVariants.celebrate,
                transition: celebrateTransition,
              }
            : {})}
          style={{ originX: '0.18', originY: '0.73' }}
        >
          <ellipse
            cx="22"
            cy="88"
            rx="10"
            ry="14"
            fill="#FFFFFF"
            stroke="#212121"
            strokeWidth="2"
          />
        </MotionG>

        {/* Right Arm */}
        <MotionG
          {...(variant === 'celebrate' && armVariants.celebrate
            ? {
                animate: 'animate',
                variants: {
                  animate: {
                    rotate: [0, 35, 0, 35, 0],
                  },
                },
                transition: celebrateTransition,
              }
            : {})}
          style={{ originX: '0.82', originY: '0.73' }}
        >
          <ellipse
            cx="98"
            cy="88"
            rx="10"
            ry="14"
            fill="#FFFFFF"
            stroke="#212121"
            strokeWidth="2"
          />
        </MotionG>

        {/* Head Group */}
        <MotionG
          {...(variant === 'thinking' && headVariants.thinking
            ? {
                animate: 'animate',
                variants: headVariants.thinking,
                transition: thinkingTransition,
              }
            : {})}
        >
          {/* Head */}
          <circle
            cx="60"
            cy="48"
            r="32"
            fill="#FFFFFF"
            stroke="#212121"
            strokeWidth="2.5"
          />
          {/* Green sprout on head */}
          <path
            d="M60 16 Q52 6 44 12 Q48 18 56 20 Q58 18 60 16 Z"
            fill="#7CB342"
            stroke="#212121"
            strokeWidth="1.5"
          />
          <path
            d="M60 16 Q68 6 76 12 Q72 18 64 20 Q62 18 60 16 Z"
            fill="#7CB342"
            stroke="#212121"
            strokeWidth="1.5"
          />
          <path
            d="M60 16 Q60 4 60 2"
            stroke="#7CB342"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          {/* Eyes */}
          <circle cx="48" cy="44" r="4" fill="#212121" />
          <circle cx="72" cy="44" r="4" fill="#212121" />
          {/* Eye highlights */}
          <circle cx="49.5" cy="42.5" r="1.5" fill="#FFFFFF" />
          <circle cx="73.5" cy="42.5" r="1.5" fill="#FFFFFF" />
          {/* Eyebrows */}
          <path
            d="M42 36 Q48 32 54 36"
            stroke="#212121"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M66 36 Q72 32 78 36"
            stroke="#212121"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
          {/* Smile */}
          <path
            d="M48 56 Q60 66 72 56"
            stroke="#212121"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
          {/* Pink cheeks */}
          <circle cx="40" cy="52" r="5" fill="#F48FB1" opacity="0.7" />
          <circle cx="80" cy="52" r="5" fill="#F48FB1" opacity="0.7" />
        </MotionG>

        {/* Shirt collar detail */}
        <path
          d="M50 68 L60 78 L70 68"
          stroke="#212121"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />
      </MotionSvg>
    </div>
  )
}
