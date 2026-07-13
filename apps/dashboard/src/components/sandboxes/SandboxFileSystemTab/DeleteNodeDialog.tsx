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
} from '@/components/ui/alert-dialog'
import { Ref, useImperativeHandle, useState } from 'react'

import type { SandboxFileSystemNode } from './types'

export type DeleteNodeDialogHandle = {
  close: () => void
  open: (node: SandboxFileSystemNode) => void
}

export function DeleteNodeDialog({
  isPending,
  onDelete,
  ref,
}: {
  isPending: boolean
  onDelete: (node: SandboxFileSystemNode) => Promise<void>
  ref?: Ref<DeleteNodeDialogHandle>
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [target, setTarget] = useState<SandboxFileSystemNode | null>(null)

  const resetState = () => {
    setIsOpen(false)
    setTarget(null)
  }

  useImperativeHandle(
    ref,
    () => ({
      close: () => {
        if (isPending) {
          return
        }

        resetState()
      },
      open: (node: SandboxFileSystemNode) => {
        setTarget(node)
        setIsOpen(true)
      },
    }),
    [isPending],
  )

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      if (isPending) {
        return
      }

      resetState()
      return
    }

    setIsOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!target || isPending) {
      return
    }

    await onDelete(target)
    resetState()
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-sm sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>删除{target?.isDir ? '目录' : '文件'}？</AlertDialogTitle>
          <AlertDialogDescription className="break-words">
            {target ? (
              <>
                <span>这将永久删除</span>
                <span className="mt-2 block break-all whitespace-normal text-foreground">{target.path}</span>
                {target.isDir ? <span className="mt-2 block">其中的内容也会被删除。</span> : null}
              </>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>取消</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            onClick={async (event) => {
              event.preventDefault()
              await handleConfirmDelete()
            }}
          >
            {isPending ? '删除中…' : '删除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
