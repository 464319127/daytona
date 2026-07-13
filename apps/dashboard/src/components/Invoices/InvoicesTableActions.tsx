/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { MoreHorizontalIcon } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../ui/alert-dialog'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { InvoicesTableActionsProps } from './types'

export function InvoicesTableActions({ invoice, onView, onVoid, onPay }: InvoicesTableActionsProps) {
  if (!onView && !onVoid && !onPay) {
    return null
  }

  return (
    <div className="flex items-center justify-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="打开菜单">
            <MoreHorizontalIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onView && <DropdownMenuItem onSelect={() => onView?.(invoice)}>查看</DropdownMenuItem>}
          {onPay && <DropdownMenuItem onSelect={() => onPay?.(invoice)}>支付</DropdownMenuItem>}
          {onVoid && (
            <>
              <DropdownMenuSeparator />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} variant="destructive">
                    作废
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent className="sm:max-w-md">
                  <AlertDialogHeader>
                    <AlertDialogTitle>作废发票</AlertDialogTitle>
                    <AlertDialogDescription>
                      确定要作废发票 <span className="font-bold">{invoice.number}</span> 吗？
                      <br />
                      此操作无法撤销。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onVoid?.(invoice)} variant="destructive">
                      作废
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
