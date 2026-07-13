/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { CopyButton } from '@/components/CopyButton'
import { TimestampTooltip } from '@/components/TimestampTooltip'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { getRelativeTimeString } from '@/lib/utils'
import { ChevronDown, ChevronUp, RefreshCw, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { EndpointMessageOut } from 'svix'
import { MessageAttemptsTable } from '../MessageAttemptsTable'

interface EventDetailsSheetProps {
  event: EndpointMessageOut | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate: (direction: 'prev' | 'next') => void
  hasPrev: boolean
  hasNext: boolean
  onReplay: (msgId: string) => void
}

export function EventDetailsSheet({
  event,
  open,
  onOpenChange,
  onNavigate,
  hasPrev,
  hasNext,
  onReplay,
}: EventDetailsSheetProps) {
  const [attemptsReloadKey, setAttemptsReloadKey] = useState(0)

  const handleReplay = useCallback(
    (msgId: string) => {
      onReplay(msgId)
      setAttemptsReloadKey((prev) => prev + 1)
    },
    [onReplay],
  )

  if (!event) return null

  const hasPayload = event.payload && Object.keys(event.payload).length > 0
  const payload = hasPayload
    ? typeof event.payload === 'string'
      ? event.payload
      : JSON.stringify(event.payload, null, 2)
    : ''
  const { relativeTimeString } = getRelativeTimeString(event.timestamp)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-dvw sm:w-[520px] p-0 flex flex-col gap-0 [&>button]:hidden" side="right">
        <SheetHeader className="flex flex-row items-center justify-between p-4 px-5 space-y-0">
          <SheetTitle>事件详情</SheetTitle>
          <div className="flex items-center">
            <Button variant="ghost" size="icon-sm" disabled={!hasPrev} onClick={() => onNavigate('prev')}>
              <ChevronUp className="size-4" />
              <span className="sr-only">上一个事件</span>
            </Button>
            <Button variant="ghost" size="icon-sm" disabled={!hasNext} onClick={() => onNavigate('next')}>
              <ChevronDown className="size-4" />
              <span className="sr-only">下一个事件</span>
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)}>
              <X className="size-4" />
              <span className="sr-only">关闭</span>
            </Button>
          </div>
        </SheetHeader>

        <Separator />
        <ScrollArea fade="mask" className="flex-1 min-h-0">
          <div className="flex flex-col px-5 py-4 gap-3">
            <span className="text-base font-medium">概览</span>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">消息 ID</span>
              <div className="flex items-center gap-1 group/copy-button">
                <span className="text-sm font-mono">{event.id}</span>
                <CopyButton value={event.id} size="icon-xs" tooltipText="复制消息 ID" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">状态</span>
              <Badge variant={event.status === 0 ? 'success' : event.status === 1 ? 'secondary' : 'destructive'}>
                {event.status === 0 ? '成功' : event.status === 1 ? '待处理' : '失败'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">事件类型</span>
              <Badge variant="secondary">{event.eventType}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">发送时间</span>
              <TimestampTooltip
                timestamp={event.timestamp instanceof Date ? event.timestamp.toISOString() : String(event.timestamp)}
              >
                <span className="text-sm cursor-default">{relativeTimeString}</span>
              </TimestampTooltip>
            </div>
            {event.nextAttempt && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">下次尝试</span>
                <TimestampTooltip
                  timestamp={
                    event.nextAttempt instanceof Date ? event.nextAttempt.toISOString() : String(event.nextAttempt)
                  }
                >
                  <span className="text-sm cursor-default">
                    {getRelativeTimeString(event.nextAttempt).relativeTimeString}
                  </span>
                </TimestampTooltip>
              </div>
            )}
            {event.channels && event.channels.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">渠道</span>
                <div className="flex items-center gap-1 flex-wrap justify-end">
                  {event.channels.map((channel) => (
                    <Badge key={channel} variant="outline" className="font-normal text-xs">
                      {channel}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {event.tags && event.tags.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">标签</span>
                <div className="flex items-center gap-1 flex-wrap justify-end">
                  {event.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="font-normal text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {event.eventId && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">事件 ID</span>
                <div className="flex items-center gap-1 group/copy-button">
                  <span className="text-sm font-mono">{event.eventId}</span>
                  <CopyButton value={event.eventId} size="icon-xs" tooltipText="复制事件 ID" />
                </div>
              </div>
            )}
            <Button variant="outline" size="sm" className="w-full mt-1" onClick={() => handleReplay(event.id)}>
              <RefreshCw className="size-3.5 mr-1.5" />
              重放
            </Button>
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
                <span className="italic text-muted-foreground">此事件没有载荷</span>
              </div>
            )}
          </div>

          <Separator />

          <div className="flex flex-col px-5 py-4">
            <MessageAttemptsTable messageId={event.id} reloadKey={attemptsReloadKey} />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
