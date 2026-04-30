'use client'

import * as React from 'react'
import ReactSimplePullToRefresh from 'react-simple-pull-to-refresh'
import { RefreshCw } from 'lucide-react'

interface PullToRefreshProps {
  onRefresh: () => Promise<unknown>
  children: React.ReactNode
  pullingContent?: React.ReactNode
  refreshingContent?: React.ReactNode
}

const defaultPullingContent = (
  <div className="flex items-center justify-center gap-2 py-3 text-sm text-secondary-green">
    <RefreshCw className="h-4 w-4" />
    <span>ปล่อยเพื่อรีเฟรช</span>
  </div>
)

const defaultRefreshingContent = (
  <div className="flex items-center justify-center gap-2 py-3 text-sm text-secondary-green">
    <RefreshCw className="h-4 w-4 animate-spin" />
    <span>กำลังโหลด...</span>
  </div>
)

export function PullToRefresh({
  onRefresh,
  children,
  pullingContent,
  refreshingContent,
}: PullToRefreshProps) {
  const handleRefresh = React.useCallback(async () => {
    await onRefresh()
  }, [onRefresh])

  return (
    <ReactSimplePullToRefresh
      onRefresh={handleRefresh}
      pullDownThreshold={70}
      maxPullDownDistance={95}
      resistance={2}
      pullingContent={pullingContent ?? defaultPullingContent}
      refreshingContent={refreshingContent ?? defaultRefreshingContent}
    >
      <div>{children}</div>
    </ReactSimplePullToRefresh>
  )
}
