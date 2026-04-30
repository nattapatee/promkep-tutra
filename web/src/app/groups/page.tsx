'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Loader2, Plus, Users } from 'lucide-react'
import { useAuth } from '@/app/providers'
import { api, type ApiGroup } from '@/lib/api'
import { MascotCard } from '@/components/MascotCard'
import { MascotButton } from '@/components/MascotButton'
import { MascotAvatar } from '@/components/MascotAvatar'
import { PullToRefresh } from '@/components/PullToRefresh'
import { cn } from '@/lib/cn'

export default function GroupsPage() {
  const { ready, error, authHeaders, retry } = useAuth()

  const groupsQuery = useQuery<{ groups: ApiGroup[] }>({
    queryKey: ['groups', authHeaders.lineUserId],
    queryFn: () => api.listGroups(authHeaders),
    enabled: ready,
  })

  async function handleRefresh() {
    await groupsQuery.refetch()
  }

  if (error) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-rose-600">Auth error: {error}</p>
        <MascotButton onClick={retry}>Retry</MascotButton>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center p-8 text-zinc-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
      </div>
    )
  }

  const groups = groupsQuery.data?.groups ?? []

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-800">กลุ่ม</h1>
        <div className="flex items-center gap-2">
          <MascotButton variant="secondary" size="sm" asChild>
            <Link href="/groups/join">เข้าร่วม</Link>
          </MascotButton>
          <MascotButton size="sm" asChild>
            <Link href="/groups/new">
              <Plus className="h-4 w-4" />
              สร้าง
            </Link>
          </MascotButton>
        </div>
      </div>

      <PullToRefresh onRefresh={handleRefresh}>
        {groupsQuery.isLoading ? (
          <div className="flex items-center justify-center py-10 text-zinc-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            กำลังโหลด...
          </div>
        ) : groupsQuery.isError ? (
          <p className="text-rose-600">
            Error: {groupsQuery.error instanceof Error ? groupsQuery.error.message : 'failed'}
          </p>
        ) : groups.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-4 py-16"
          >
            <MascotAvatar size="lg" animate />
            <p className="text-sm font-medium text-zinc-500">ยังไม่มีกลุ่ม</p>
            <div className="flex gap-2">
              <MascotButton variant="secondary" size="sm" asChild>
                <Link href="/groups/join">เข้าร่วมกลุ่ม</Link>
              </MascotButton>
              <MascotButton size="sm" asChild>
                <Link href="/groups/new">
                  <Plus className="h-4 w-4" />
                  สร้างกลุ่ม
                </Link>
              </MascotButton>
            </div>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {groups.map((group, i) => (
              <motion.div
                key={group.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Link href={`/groups/${group.id}`}>
                  <MascotCard className="h-full cursor-pointer transition-all hover:shadow-lg hover:ring-2 hover:ring-secondary-green/30">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-base font-bold text-dark">{group.name}</h3>
                        <p className="mt-1 text-xs text-zinc-500">รหัส: {group.code}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                            <Users className="h-3 w-3" />
                            {group.memberCount} คน
                          </span>
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[10px] font-bold',
                              group.role === 'admin'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-zinc-100 text-zinc-600',
                            )}
                          >
                            {group.role === 'admin' ? 'แอดมิน' : 'สมาชิก'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </MascotCard>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </PullToRefresh>
    </div>
  )
}
