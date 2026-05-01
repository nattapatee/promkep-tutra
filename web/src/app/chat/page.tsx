'use client'

import * as React from 'react'
import { useMutation } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, Send, Bot, User, Trash2 } from 'lucide-react'
import { useAuth } from '@/app/providers'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'

interface ChatMessage {
  id: string
  role: 'user' | 'model'
  text: string
  timestamp: number
}

const STORAGE_KEY = 'promkep-chat-history'

function loadHistory(): ChatMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ChatMessage[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveHistory(messages: ChatMessage[]) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
}

export default function ChatPage() {
  const { ready, error, authHeaders, retry, profile } = useAuth()
  const [input, setInput] = React.useState('')
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    setMessages(loadHistory())
  }, [])

  React.useEffect(() => {
    saveHistory(messages)
  }, [messages])

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const chatMut = useMutation({
    mutationFn: (message: string) => api.chatWithSecretary(authHeaders, message),
    onSuccess: (data) => {
      const modelMsg: ChatMessage = {
        id: `m-${Date.now()}`,
        role: 'model',
        text: data.response,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, modelMsg])
    },
    onError: (err: unknown) => {
      const detail = err instanceof Error ? err.message : ''
      const reasonMatch = detail.match(/"reason":"([^"]+)"/)
      const reason = reasonMatch ? reasonMatch[1] : null
      const baseText = 'ขอโทษนะ ตุ๊ต๊ะพึ่งพักไปกินข้าว ลองใหม่ในอีกสักครู่น้า 🍚'
      const errorMsg: ChatMessage = {
        id: `m-${Date.now()}`,
        role: 'model',
        text: reason ? `${baseText}\n(reason: ${reason})` : baseText,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, errorMsg])
    },
  })

  function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || chatMut.isPending) return
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    chatMut.mutate(trimmed)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function clearChat() {
    setMessages([])
    sessionStorage.removeItem(STORAGE_KEY)
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="text-center">
          <p className="mb-3 text-rose-600">{error}</p>
          <button
            onClick={retry}
            className="rounded-2xl bg-gradient-to-r from-rose-400 to-amber-500 px-5 py-2 text-sm font-bold text-white"
          >
            ลองใหม่
          </button>
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="flex items-center justify-between pb-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-800">คุยกับตุ๊ต๊ะ</h1>
          <p className="text-xs text-zinc-500">เลขาส่วนตัวที่น่ารัก... แต่โหดตอนทวง 💪</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-50 text-rose-500 transition-colors hover:bg-rose-100"
            aria-label="ลบประวัติ"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-3xl border border-rose-100/60 bg-white/50 p-4 shadow-[0_4px_20px_rgba(251,113,133,0.06)] backdrop-blur"
      >
        {messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center gap-3 py-12 text-center"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-secondary-green to-emerald-400 text-white shadow-lg">
              <Bot className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <p className="font-bold text-zinc-700">สวัสดี! ฉันคือตุ๊ต๊ะ</p>
              <p className="max-w-xs text-xs text-zinc-500">
                ถามได้เลยเรื่องรายรับรายจ่าย หนี้สิน หรือขอคำแนะนำการเงิน
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {['สรุปรายรับรายจ่ายเดือนนี้', 'มีหนี้อะไรบ้าง', 'ช่วยวางแผนการออม'].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setInput(suggestion)
                    inputRef.current?.focus()
                  }}
                  className="rounded-full bg-rose-100 px-3 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-200"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              {msg.role === 'model' && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-secondary-green to-emerald-400 text-white shadow">
                  <Bot className="h-4 w-4" />
                </div>
              )}
              <div
                className={cn(
                  'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm',
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-rose-400 to-amber-500 text-white'
                    : 'bg-white text-zinc-700',
                )}
              >
                {msg.text}
              </div>
              {msg.role === 'user' && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-pink/20 text-xs font-bold text-dark">
                  {(profile?.displayName ?? 'คุณ')[0]}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {chatMut.isPending && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-2"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-secondary-green to-emerald-400 text-white shadow">
              <Bot className="h-4 w-4" />
            </div>
            <div className="rounded-2xl bg-white px-4 py-2.5 shadow-sm">
              <div className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-300" style={{ animationDelay: '0ms' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-300" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-300" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </motion.div>
        )}
      </div>

      <div className="pt-3">
        <div className="flex gap-2 rounded-2xl border border-rose-100 bg-white p-2 shadow-md">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="ถามตุ๊ต๊ะได้เลย..."
            disabled={chatMut.isPending}
            className="min-w-0 flex-1 rounded-xl bg-transparent px-3 py-2 text-sm outline-none placeholder:text-zinc-400"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={chatMut.isPending || !input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-rose-400 to-amber-500 text-white shadow-md transition-transform active:scale-95 disabled:opacity-50"
          >
            {chatMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
