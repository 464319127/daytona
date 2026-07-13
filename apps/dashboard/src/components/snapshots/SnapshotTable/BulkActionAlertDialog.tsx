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
} from '../../ui/alert-dialog'

export enum SnapshotBulkAction {
  Delete = 'delete',
  Deactivate = 'deactivate',
}

interface BulkActionData {
  title: string
  description: string
  buttonLabel: string
  buttonVariant?: 'destructive'
}

function getBulkActionData(action: SnapshotBulkAction, count: number): BulkActionData {
  const countText = count === 1 ? '此 Snapshot' : `选中的 ${count} 个 Snapshot`

  switch (action) {
    case SnapshotBulkAction.Delete:
      return {
        title: '删除 Snapshot',
        description: `确定要删除${countText}吗？此操作无法撤销。`,
        buttonLabel: '删除',
        buttonVariant: 'destructive',
      }
    case SnapshotBulkAction.Deactivate:
      return {
        title: '停用 Snapshot',
        description: `确定要停用${countText}吗？停用后仍可重新启用。`,
        buttonLabel: '停用',
      }
  }
}

interface SnapshotBulkActionAlertDialogProps {
  action: SnapshotBulkAction | null
  count: number
  onConfirm: () => void
  onCancel: () => void
}

export function SnapshotBulkActionAlertDialog({
  action,
  count,
  onConfirm,
  onCancel,
}: SnapshotBulkActionAlertDialogProps) {
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
