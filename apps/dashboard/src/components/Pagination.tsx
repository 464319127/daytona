/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { cn } from '@/lib/utils'
import { Table } from '@tanstack/react-table'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { PAGE_SIZE_OPTIONS } from '../constants/Pagination'
import { Button } from './ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

interface PaginationProps<TData> {
  table: Table<TData>
  selectionEnabled?: boolean
  className?: string
  entityName?: string
  totalItems?: number
}

export function Pagination<TData>({
  table,
  selectionEnabled,
  className,
  entityName,
  totalItems,
}: PaginationProps<TData>) {
  return (
    <div className={cn('flex flex-col sm:flex-row gap-4 sm:items-center justify-between w-full', className)}>
      <div className="flex items-center gap-4">
        <Select
          value={`${table.getState().pagination.pageSize}`}
          onValueChange={(value) => {
            table.setPageSize(Number(value))
          }}
        >
          <SelectTrigger className="h-8 w-[140px]">
            <SelectValue placeholder={table.getState().pagination.pageSize + 'per page'} />
          </SelectTrigger>
          <SelectContent side="top">
            {PAGE_SIZE_OPTIONS.map((pageSize) => (
              <SelectItem key={pageSize} value={`${pageSize}`}>
                {pageSize} per page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectionEnabled ? (
          <div className="flex-1 text-sm text-muted-foreground">
            {table.getFilteredSelectedRowModel().rows.length} of {totalItems ?? table.getFilteredRowModel().rows.length}{' '}
            item(s) selected.
          </div>
        ) : (
          <div className="flex-1 text-sm text-muted-foreground">
            {totalItems ?? table.getFilteredRowModel().rows.length} total item(s)
          </div>
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-end text-sm font-medium text-muted-foreground">
          第 {table.getState().pagination.pageIndex + 1} 页，共 {table.getPageCount() || 1} 页
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">跳到第一页</span>
            <ChevronsLeft />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">跳到上一页</span>
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">跳到下一页</span>
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">跳到最后一页</span>
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  )
}
