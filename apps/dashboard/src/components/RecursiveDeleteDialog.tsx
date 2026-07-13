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
import { buttonVariants } from '@/components/ui/button'
import { useApi } from '@/hooks/useApi'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { Sandbox } from '@daytona/api-client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { SandboxState } from './sandboxes/SandboxState'

interface RecursiveDeleteDialogProps {
  sandboxId: string
  open: boolean
  onClose: () => void
  onDeleted: () => void
}

export function RecursiveDeleteDialog({ sandboxId, open, onClose, onDeleted }: RecursiveDeleteDialogProps) {
  const { sandboxApi } = useApi()
  const { selectedOrganization } = useSelectedOrganization()
  const [sandboxesToDelete, setSandboxesToDelete] = useState<Sandbox[]>([])
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteProgress, setDeleteProgress] = useState(0)

  useEffect(() => {
    if (!open || !sandboxId || !selectedOrganization?.id) return

    const fetchAll = async () => {
      setLoading(true)
      setSandboxesToDelete([])
      setDeleteProgress(0)
      try {
        const collected: Sandbox[] = []

        const collectChildren = async (id: string) => {
          const res = await sandboxApi.getSandboxForks(id, selectedOrganization.id)
          for (const fork of res.data) {
            await collectChildren(fork.id)
            collected.push(fork)
          }
        }

        await collectChildren(sandboxId)

        const currentRes = await sandboxApi.getSandbox(sandboxId, selectedOrganization.id)
        collected.push(currentRes.data)

        setSandboxesToDelete(collected)
      } catch {
        toast.error('加载 Sandbox 树失败')
      } finally {
        setLoading(false)
      }
    }

    fetchAll()
  }, [open, sandboxId, selectedOrganization?.id, sandboxApi])

  const handleDelete = async () => {
    if (!selectedOrganization?.id) return
    setDeleting(true)
    setDeleteProgress(0)

    let deleted = 0
    for (const sandbox of sandboxesToDelete) {
      try {
        await sandboxApi.deleteSandbox(sandbox.id, selectedOrganization.id)
        deleted++
        setDeleteProgress(deleted)
      } catch {
        toast.error(`删除 Sandbox 失败：${sandbox.name}`)
      }
    }

    toast.success(`已删除 ${deleted} 个 Sandbox`)
    setDeleting(false)
    onDeleted()
    onClose()
  }

  const total = sandboxesToDelete.length

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && !deleting && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除 Sandbox 及其所有 Fork</AlertDialogTitle>
          <AlertDialogDescription>
            {loading
              ? '正在加载 Sandbox 树...'
              : `这将删除 ${total} 个 Sandbox。此操作无法撤销。`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {!loading && sandboxesToDelete.length > 0 && (
          <div className="max-h-48 overflow-y-auto space-y-1 rounded-md border p-2">
            {sandboxesToDelete.map((sandbox) => (
              <div key={sandbox.id} className="flex items-center gap-2 py-1 px-2 rounded-md bg-muted/50">
                <span className="text-sm truncate flex-1">{sandbox.name}</span>
                <SandboxState state={sandbox.state} />
              </div>
            ))}
          </div>
        )}

        {deleting && (
          <p className="text-sm text-muted-foreground">
            正在删除 {deleteProgress}/{total}...
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'destructive' })}
            disabled={loading || deleting}
            onClick={(e) => {
              e.preventDefault()
              handleDelete()
            }}
          >
            {deleting ? `正在删除 ${deleteProgress}/${total}...` : `删除${total > 1 ? `全部 ${total} 个` : ''}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
