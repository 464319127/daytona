/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog'

export enum BulkAction {
  Delete = 'delete',
  Start = 'start',
  Stop = 'stop',
  Archive = 'archive',
}

interface BulkActionData {
  title: string
  description: string
  buttonLabel: string
  buttonVariant?: 'destructive'
}

function getBulkActionData(action: BulkAction, count: number): BulkActionData {
  const countText = count === 1 ? '此 Sandbox' : `选中的 ${count} 个 Sandbox`

  switch (action) {
    case BulkAction.Delete:
      return {
        title: '删除 Sandbox',
        description: `确定要删除${countText}吗？此操作无法撤销。`,
        buttonLabel: '删除',
        buttonVariant: 'destructive',
      }
    case BulkAction.Start:
      return {
        title: '启动 Sandbox',
        description: `确定要启动${countText}吗？`,
        buttonLabel: '启动',
      }
    case BulkAction.Stop:
      return {
        title: '停止 Sandbox',
        description: `确定要停止${countText}吗？`,
        buttonLabel: '停止',
      }
    case BulkAction.Archive:
      return {
        title: '归档 Sandbox',
        description: `确定要归档${countText}吗？归档后的 Sandbox 可以稍后恢复。`,
        buttonLabel: '归档',
      }
  }
}

interface BulkActionAlertDialogProps {
  action: BulkAction | null
  count: number
  onConfirm: () => void
  onCancel: () => void
}

export function BulkActionAlertDialog({ action, count, onConfirm, onCancel }: BulkActionAlertDialogProps) {
  const data = action ? getBulkActionData(action, count) : null

  if (!data) return null

  return (
    <AlertDialog open={action !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <>
          <AlertDialogHeader>
            <AlertDialogTitle>{data.title}</AlertDialogTitle>
            <AlertDialogDescription>{data.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm} variant={data.buttonVariant}>
              {data.buttonLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </>
      </AlertDialogContent>
    </AlertDialog>
  )
}
