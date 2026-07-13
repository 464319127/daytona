/*
 * Copyright Daytona Platforms Inc.
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

export enum VolumeBulkAction {
  Delete = 'delete',
}

interface VolumeBulkActionAlertDialogProps {
  action: VolumeBulkAction | null
  count: number
  onConfirm: () => void
  onCancel: () => void
}

export function VolumeBulkActionAlertDialog({ action, count, onConfirm, onCancel }: VolumeBulkActionAlertDialogProps) {
  if (!action) return null

  const countText = count === 1 ? '此存储卷' : `选中的 ${count} 个存储卷`

  return (
    <AlertDialog open={action !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除存储卷</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除{countText}吗？此操作无法撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} variant="destructive">
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
