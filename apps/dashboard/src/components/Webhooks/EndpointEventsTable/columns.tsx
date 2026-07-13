/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { TimestampTooltip } from '@/components/TimestampTooltip'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FacetedFilterOption } from '@/components/ui/data-table-faceted-filter'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { WEBHOOK_EVENTS } from '@/constants/webhook-events'
import { getRelativeTimeString } from '@/lib/utils'
import { ColumnDef, RowData, Table } from '@tanstack/react-table'
import { CheckCircle, Clock, MoreHorizontal, XCircle } from 'lucide-react'
import { EndpointMessageOut } from 'svix'
import { CopyButton } from '../../CopyButton'

type EndpointEventsTableMeta = {
  onReplay: (msgId: string) => void
}

declare module '@tanstack/react-table' {
  interface TableMeta<TData extends RowData> {
    endpointEvents?: TData extends EndpointMessageOut ? EndpointEventsTableMeta : never
  }
}

const getMeta = (table: Table<EndpointMessageOut>) => {
  return table.options.meta?.endpointEvents as EndpointEventsTableMeta
}

const columns: ColumnDef<EndpointMessageOut>[] = [
  {
    accessorKey: 'id',
    header: '消息 ID',
    size: 300,
    cell: ({ row }) => {
      const msgId = row.original.id
      return (
        <div className="w-full truncate flex items-center gap-2 group/copy-button">
          <span className="truncate block font-mono text-sm hover:underline focus:underline cursor-pointer">
            {msgId ?? '-'}
          </span>
          {msgId && (
            <span onClick={(e) => e.stopPropagation()}>
              <CopyButton value={msgId} size="icon-xs" autoHide tooltipText="复制消息 ID" />
            </span>
          )}
        </div>
      )
    },
  },
  {
    id: 'status',
    accessorFn: (row) => row.statusText || 'unknown',
    header: '状态',
    size: 100,
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
    cell: ({ row }) => {
      const status = row.original.status
      const variant = status === 0 ? 'success' : status === 1 ? 'secondary' : 'destructive'
      return <Badge variant={variant}>{status === 0 ? '成功' : status === 1 ? '待处理' : '失败'}</Badge>
    },
  },
  {
    accessorKey: 'eventType',
    header: '事件类型',
    size: 200,
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
    cell: ({ row }) => {
      const eventType = row.original.eventType
      return (
        <Badge variant="secondary" className="font-normal text-xs">
          {eventType}
        </Badge>
      )
    },
  },
  {
    accessorKey: 'nextAttempt',
    header: '下次尝试',
    size: 100,
    cell: ({ row }) => {
      const nextAttempt = row.original.nextAttempt
      if (!nextAttempt) {
        return <span className="text-muted-foreground">-</span>
      }
      const relativeTime = getRelativeTimeString(nextAttempt)
      return (
        <TimestampTooltip timestamp={nextAttempt.toString()}>
          <span className="cursor-default text-sm">{relativeTime.relativeTimeString}</span>
        </TimestampTooltip>
      )
    },
  },
  {
    accessorKey: 'timestamp',
    header: '发送时间',
    size: 100,
    cell: ({ row }) => {
      const timestamp = row.original.timestamp
      if (!timestamp) {
        return <span className="text-muted-foreground">-</span>
      }
      const relativeTime = getRelativeTimeString(timestamp)

      return (
        <TimestampTooltip timestamp={timestamp.toString()}>
          <span className="cursor-default">{relativeTime.relativeTimeString}</span>
        </TimestampTooltip>
      )
    },
  },
  {
    id: 'actions',
    header: () => null,
    size: 48,
    minSize: 48,
    maxSize: 48,
    enableHiding: false,
    cell: ({ row, table }) => {
      const { onReplay } = getMeta(table)
      const msgId = row.original.id
      return (
        <div className="flex justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon-sm" aria-label="打开菜单">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => onReplay(msgId)}>重放</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )
    },
  },
]

const eventTypeOptions: FacetedFilterOption[] = WEBHOOK_EVENTS.map((event) => ({
  label: event.label,
  value: event.value,
}))

const statusOptions: FacetedFilterOption[] = [
  { label: '成功', value: 'success', icon: CheckCircle },
  { label: '待处理', value: 'pending', icon: Clock },
  { label: '失败', value: 'fail', icon: XCircle },
]

export { columns, eventTypeOptions, statusOptions }
export type { EndpointEventsTableMeta }
