/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface DeleteOrganizationDialogProps {
  organizationName: string
  onDeleteOrganization: () => Promise<boolean>
  loading: boolean
}

export const DeleteOrganizationDialog: React.FC<DeleteOrganizationDialogProps> = ({
  organizationName,
  onDeleteOrganization,
  loading,
}) => {
  const [open, setOpen] = useState(false)
  const [confirmName, setConfirmName] = useState('')

  const handleDeleteOrganization = async () => {
    const success = await onDeleteOrganization()
    if (success) {
      setOpen(false)
      setConfirmName('')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen)
        if (!isOpen) {
          setConfirmName('')
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive" className="w-auto px-4">
          删除组织
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>删除组织</DialogTitle>
          <DialogDescription>
            此操作将永久删除所有关联数据，且无法撤销。
          </DialogDescription>
        </DialogHeader>
        <form
          id="delete-organization-form"
          className="space-y-6 overflow-y-auto px-1 pb-1"
          onSubmit={async (e) => {
            e.preventDefault()
            await handleDeleteOrganization()
          }}
        >
          <div className="space-y-6">
            <div className="space-y-3">
              <Label htmlFor="confirm-action">
                请输入 <span className="font-bold cursor-text select-all">{organizationName}</span> 以确认
              </Label>
              <Input
                id="confirm-action"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={organizationName}
              />
            </div>
          </div>
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary" disabled={loading}>
              取消
            </Button>
          </DialogClose>
          {loading ? (
            <Button type="button" variant="destructive" disabled>
              正在删除...
            </Button>
          ) : (
            <Button
              type="submit"
              form="delete-organization-form"
              variant="destructive"
              disabled={confirmName !== organizationName}
            >
              删除
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
