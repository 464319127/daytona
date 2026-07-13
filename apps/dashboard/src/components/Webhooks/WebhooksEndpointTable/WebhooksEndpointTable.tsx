/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { PageFooterPortal } from '@/components/PageLayout'
import { Pagination } from '@/components/Pagination'
import { SearchInput } from '@/components/SearchInput'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableEmptyState,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DEFAULT_PAGE_SIZE } from '@/constants/Pagination'
import { RoutePath } from '@/enums/RoutePath'
import { cn } from '@/lib/utils'
import { getColumnSizeStyles } from '@/lib/utils/table'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { Mail } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { EndpointOut } from 'svix'
import { columns } from './columns'

interface WebhooksEndpointTableProps {
  data: EndpointOut[]
  loading: boolean
  onDisable: (endpoint: EndpointOut) => void
  onDelete: (endpoint: EndpointOut) => void
  isLoadingEndpoint: (endpoint: EndpointOut) => boolean
}

export function WebhooksEndpointTable({
  data,
  loading,
  onDisable,
  onDelete,
  isLoadingEndpoint,
}: WebhooksEndpointTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [deleteEndpoint, setDeleteEndpoint] = useState<EndpointOut | null>(null)
  const [disableEndpoint, setDisableEndpoint] = useState<EndpointOut | null>(null)
  const navigate = useNavigate()

  const handleConfirmDelete = () => {
    if (deleteEndpoint) {
      onDelete(deleteEndpoint)
      setDeleteEndpoint(null)
    }
  }

  const handleConfirmDisable = () => {
    if (disableEndpoint) {
      onDisable(disableEndpoint)
      setDisableEndpoint(null)
    }
  }

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue) => {
      const endpoint = row.original
      const searchValue = filterValue.toLowerCase()
      return (
        endpoint.url.toLowerCase().includes(searchValue) ||
        (endpoint.description?.toLowerCase().includes(searchValue) ?? false) ||
        endpoint.id.toLowerCase().includes(searchValue)
      )
    },
    state: {
      sorting,
      globalFilter,
    },
    initialState: {
      pagination: {
        pageSize: DEFAULT_PAGE_SIZE,
      },
      columnPinning: {
        right: ['actions'],
      },
    },
    meta: {
      webhookEndpoints: {
        onDisable: setDisableEndpoint,
        onDelete: setDeleteEndpoint,
        isLoadingEndpoint,
      },
    },
  })

  const isEmpty = !loading && table.getRowModel().rows.length === 0
  const hasSearch = globalFilter.trim().length > 0

  const handleRowClick = (endpoint: EndpointOut) => {
    navigate(RoutePath.WEBHOOK_ENDPOINT_DETAILS.replace(':endpointId', endpoint.id))
  }

  const handleChangeFilter = (value: string) => {
    setGlobalFilter(value)
    table.setPageIndex(0)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <SearchInput
          debounced
          value={globalFilter ?? ''}
          onValueChange={handleChangeFilter}
          placeholder="按 URL 或描述搜索"
          containerClassName="min-w-0 flex-1 sm:max-w-sm"
        />
      </div>
      <TableContainer
        className={cn({
          'min-h-[26rem]': isEmpty,
        })}
        empty={
          isEmpty ? (
            <TableEmptyState
              overlay
              colSpan={columns.length}
              message={hasSearch ? '未找到匹配的 Webhook 端点。' : '暂无 Webhook 端点。'}
              icon={<Mail />}
              description={
                hasSearch ? null : (
                  <div className="space-y-2">
                    <p>创建端点以开始接收 Webhook 事件。</p>
                    <p>
                      <a
                        href="https://www.daytona.io/docs/en/tools/api/#daytona/webhook/undefined/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium"
                      >
                        查看文档
                      </a>{' '}
                      了解更多信息。
                    </p>
                  </div>
                )
              }
              action={
                hasSearch ? (
                  <Button variant="outline" onClick={() => handleChangeFilter('')}>
                    清除筛选条件
                  </Button>
                ) : null
              }
            />
          ) : null
        }
      >
        <Table className="table-fixed" style={{ minWidth: table.getTotalSize() }}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      className="px-2"
                      key={header.id}
                      style={getColumnSizeStyles(header.column)}
                      sticky={header.column.getIsPinned()}
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <>
                {Array.from({ length: DEFAULT_PAGE_SIZE }).map((_, i) => (
                  <TableRow key={i}>
                    {table.getVisibleLeafColumns().map((column, colIndex, arr) =>
                      colIndex === arr.length - 1 ? null : (
                        <TableCell key={column.id} className="px-2" style={getColumnSizeStyles(column)}>
                          <Skeleton className="h-4 w-10/12" />
                        </TableCell>
                      ),
                    )}
                  </TableRow>
                ))}
              </>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const isLoading = isLoadingEndpoint(row.original)
                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    className={`${isLoading ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none'}`}
                    tabIndex={isLoading ? undefined : 0}
                    role={isLoading ? undefined : 'link'}
                    onClick={() => {
                      if (!isLoading) {
                        handleRowClick(row.original)
                      }
                    }}
                    onKeyDown={(e) => {
                      if (!isLoading && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault()
                        handleRowClick(row.original)
                      }
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        className="px-2"
                        key={cell.id}
                        style={getColumnSizeStyles(cell.column)}
                        sticky={cell.column.getIsPinned()}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>
      <PageFooterPortal>
        <Pagination table={table} entityName="端点" />
      </PageFooterPortal>

      <AlertDialog open={!!deleteEndpoint} onOpenChange={(open) => !open && setDeleteEndpoint(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 Webhook 端点</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除此 Webhook 端点吗？此操作无法撤销。
              {deleteEndpoint && (
                <div className="mt-2 text-sm">
                  <strong>URL:</strong> {deleteEndpoint.url}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDelete}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!disableEndpoint} onOpenChange={(open) => !open && setDisableEndpoint(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{disableEndpoint?.disabled ? '启用' : '停用'} Webhook 端点</AlertDialogTitle>
            <AlertDialogDescription>
              确定要{disableEndpoint?.disabled ? '启用' : '停用'}此 Webhook 端点吗？
              {disableEndpoint && (
                <div className="mt-2 text-sm">
                  <strong>URL:</strong> {disableEndpoint.url}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDisable}>
              {disableEndpoint?.disabled ? '启用' : '停用'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
