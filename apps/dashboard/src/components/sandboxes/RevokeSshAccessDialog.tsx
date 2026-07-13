/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useRevokeSshAccessMutation } from '@/hooks/mutations/useRevokeSshAccessMutation'
import { handleApiError } from '@/lib/error-handling'

interface RevokeSshAccessDialogProps {
  sandboxId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RevokeSshAccessDialog({ sandboxId, open, onOpenChange }: RevokeSshAccessDialogProps) {
  const [token, setToken] = useState('')
  const revokeMutation = useRevokeSshAccessMutation()

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen)
    if (!isOpen) {
      setToken('')
      revokeMutation.reset()
    }
  }

  const handleRevoke = async () => {
    if (!token.trim()) {
      toast.error('请输入要撤销的令牌')
      return
    }
    try {
      await revokeMutation.mutateAsync({ sandboxId, token })
      toast.success('SSH 访问已撤销')
      handleOpenChange(false)
    } catch (error) {
      handleApiError(error, '撤销 SSH 访问失败')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>撤销 SSH 访问</DialogTitle>
          <DialogDescription>输入要撤销的 SSH 访问令牌。</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="ssh-revoke-token">SSH 令牌</FieldLabel>
          <Input
            id="ssh-revoke-token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="在此粘贴令牌"
          />
        </Field>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">取消</Button>
          </DialogClose>
          <Button variant="destructive" onClick={handleRevoke} disabled={!token.trim() || revokeMutation.isPending}>
            {revokeMutation.isPending && <Spinner />}
            撤销
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
