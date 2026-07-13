/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { CopyButton } from '@/components/CopyButton'
import { TimestampTooltip } from '@/components/TimestampTooltip'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { getRelativeTimeString } from '@/lib/utils'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { MessageOut } from 'svix'
import { MessageAttemptsTable } from '../MessageAttemptsTable'

interface MessageDetailsSheetProps {
  message: MessageOut | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate: (direction: 'prev' | 'next') => void
  hasPrev: boolean
  hasNext: boolean
}

export function MessageDetailsSheet({
  message,
  open,
  onOpenChange,
  onNavigate,
  hasPrev,
  hasNext,
}: MessageDetailsSheetProps) {
  if (!message) return null

  const hasPayload = message.payload && Object.keys(message.payload).length > 0
  const payload = hasPayload
    ? typeof message.payload === 'string'
      ? message.payload
      : JSON.stringify(message.payload, null, 2)
    : ''
  const { relativeTimeString } = getRelativeTimeString(message.timestamp)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-dvw sm:w-[520px] p-0 flex flex-col gap-0 [&>button]:hidden" side="right">
        <SheetHeader className="flex flex-row items-center justify-between p-4 px-5 space-y-0">
          <SheetTitle>消息详情</SheetTitle>
          <div className="flex items-center">
            <Button variant="ghost" size="icon-sm" disabled={!hasPrev} onClick={() => onNavigate('prev')}>
              <ChevronUp className="size-4" />
              <span className="sr-only">上一条消息</span>
            </Button>
            <Button variant="ghost" size="icon-sm" disabled={!hasNext} onClick={() => onNavigate('next')}>
              <ChevronDown className="size-4" />
              <span className="sr-only">下一条消息</span>
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)}>
              <X className="size-4" />
              <span className="sr-only">关闭</span>
            </Button>
          </div>
        </SheetHeader>

        <Separator />

        <div className="flex-1 min-h-0 overflow-auto">
          <div className="flex flex-col px-5 py-4 gap-3">
            <span className="text-base font-medium">概览</span>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">消息 ID</span>
              <div className="flex items-center gap-1 group/copy-button">
                <span className="text-sm font-mono">{message.id}</span>
                <CopyButton value={message.id} size="icon-xs" tooltipText="复制消息 ID" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">事件类型</span>
              <Badge variant="secondary">{message.eventType}</Badge>
            </div>
            {message.eventId && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">事件 ID</span>
                <div className="flex items-center gap-1 group/copy-button">
                  <span className="text-sm font-mono">{message.eventId}</span>
                  <CopyButton value={message.eventId} size="icon-xs" tooltipText="复制事件 ID" />
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">时间戳</span>
              <TimestampTooltip
                timestamp={
                  message.timestamp instanceof Date ? message.timestamp.toISOString() : String(message.timestamp)
                }
              >
                <span className="text-sm cursor-default">{relativeTimeString}</span>
              </TimestampTooltip>
            </div>
            {message.channels && message.channels.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">渠道</span>
                <div className="flex items-center gap-1 flex-wrap justify-end">
                  {message.channels.map((channel) => (
                    <Badge key={channel} variant="outline" className="font-normal text-xs">
                      {channel}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {message.tags && message.tags.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">标签</span>
                <div className="flex items-center gap-1 flex-wrap justify-end">
                  {message.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="font-normal text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Separator />

          <div className="flex flex-col px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-base font-medium">载荷</span>
              {hasPayload && <CopyButton value={payload} size="icon-xs" tooltipText="复制载荷" />}
            </div>
            {hasPayload ? (
              <pre className="text-sm font-mono bg-muted/80 p-3 rounded-md overflow-auto whitespace-pre-wrap break-all">
                {payload}
              </pre>
            ) : (
              <div className="text-sm bg-muted/80 p-3 rounded-md">
                <span className="italic text-muted-foreground">此消息没有载荷</span>
              </div>
            )}
          </div>

          <Separator />

          <div className="flex flex-col px-5 py-4">
            <MessageAttemptsTable messageId={message.id} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
