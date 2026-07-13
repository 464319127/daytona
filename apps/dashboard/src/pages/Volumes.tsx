/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { CreateVolumeSheet } from '@/components/CreateVolumeSheet'
import { PageContent, PageFooter, PageHeader, PageIntro, PageLayout } from '@/components/PageLayout'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { VolumeTable } from '@/components/VolumeTable'
import { useDeleteVolumeMutation } from '@/hooks/mutations/useDeleteVolumeMutation'
import { queryKeys } from '@/hooks/queries/queryKeys'
import { useVolumesQuery } from '@/hooks/queries/useVolumesQuery'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { useVolumeWsSync } from '@/hooks/useVolumeWsSync'
import { createBulkActionToast } from '@/lib/bulk-action-toast'
import { handleApiError } from '@/lib/error-handling'
import { OrganizationRolePermissionsEnum, VolumeDto, VolumeState } from '@daytona/api-client'
import { useQueryClient } from '@tanstack/react-query'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

const Volumes: React.FC = () => {
  const queryClient = useQueryClient()

  const [volumeToDelete, setVolumeToDelete] = useState<VolumeDto | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [processingVolumeAction, setProcessingVolumeAction] = useState<Record<string, boolean>>({})
  const createVolumeSheetRef = useRef<{ open: () => void }>(null)

  const { selectedOrganization, authenticatedUserHasPermission } = useSelectedOrganization()
  useVolumeWsSync()

  const queryKey = useMemo(() => queryKeys.volumes.list(selectedOrganization?.id ?? ''), [selectedOrganization?.id])
  const { data: volumes = [], isLoading: loadingVolumes, error: volumesError } = useVolumesQuery()
  const deleteVolumeMutation = useDeleteVolumeMutation({ invalidateOnSuccess: false })

  useEffect(() => {
    if (volumesError) {
      handleApiError(volumesError, '获取卷失败')
    }
  }, [volumesError])

  const updateVolumeStateInCache = useCallback(
    (volumeId: string, state: VolumeState) => {
      queryClient.setQueriesData<VolumeDto[]>({ queryKey }, (previousVolumes) => {
        if (!previousVolumes) return previousVolumes

        return previousVolumes.map((volume) => (volume.id === volumeId ? { ...volume, state } : volume))
      })
    },
    [queryClient, queryKey],
  )

  const handleDelete = async (volume: VolumeDto) => {
    setProcessingVolumeAction((prev) => ({ ...prev, [volume.id]: true }))

    updateVolumeStateInCache(volume.id, VolumeState.PENDING_DELETE)

    try {
      await deleteVolumeMutation.mutateAsync({
        volumeId: volume.id,
        organizationId: selectedOrganization?.id,
      })
      if (selectedOrganization?.id) {
        await queryClient.invalidateQueries({ queryKey })
      }
      setVolumeToDelete(null)
      setShowDeleteDialog(false)
      toast.success(`正在删除存储卷 ${volume.name}`)
    } catch (error) {
      handleApiError(error, '删除卷失败')
      updateVolumeStateInCache(volume.id, volume.state)
    } finally {
      setProcessingVolumeAction((prev) => ({ ...prev, [volume.id]: false }))
    }
  }

  const handleBulkDelete = async (volumes: VolumeDto[]) => {
    const previousStatesById = new Map(volumes.map((volume) => [volume.id, volume.state]))
    let isCancelled = false
    let processedCount = 0
    let successCount = 0
    let failureCount = 0

    const totalLabel = `${volumes.length} 个卷`
    const onCancel = () => {
      isCancelled = true
    }

    const bulkToast = createBulkActionToast(`正在删除 0 / ${totalLabel}`, {
      action: { label: '取消', onClick: onCancel },
    })

    try {
      for (const volume of volumes) {
        if (isCancelled) break

        processedCount += 1
        bulkToast.loading(`正在删除 ${processedCount} / ${totalLabel}`, {
          action: { label: '取消', onClick: onCancel },
        })

        setProcessingVolumeAction((prev) => ({ ...prev, [volume.id]: true }))
        updateVolumeStateInCache(volume.id, VolumeState.PENDING_DELETE)

        try {
          await deleteVolumeMutation.mutateAsync({
            volumeId: volume.id,
            organizationId: selectedOrganization?.id,
          })
          successCount += 1
        } catch (error) {
          failureCount += 1
          updateVolumeStateInCache(volume.id, previousStatesById.get(volume.id) ?? volume.state)
          console.error('Deleting volume failed', volume.id, error)
        } finally {
          setProcessingVolumeAction((prev) => ({ ...prev, [volume.id]: false }))
        }
      }

      if (selectedOrganization?.id) {
        await queryClient.invalidateQueries({ queryKey })
      }

      bulkToast.result(
        { successCount, failureCount },
        {
          successTitle: `已删除 ${volumes.length} 个卷。`,
          errorTitle: `删除 ${volumes.length} 个卷失败。`,
          warningTitle: '部分卷删除失败。',
          canceledTitle: '已取消删除。',
        },
      )
    } catch (error) {
      console.error('Deleting volumes failed', error)
      bulkToast.error('删除卷失败。')
    }
  }

  const writePermitted = useMemo(
    () => authenticatedUserHasPermission(OrganizationRolePermissionsEnum.WRITE_VOLUMES),
    [authenticatedUserHasPermission],
  )

  return (
    <PageLayout contained>
      <PageHeader />

      <PageContent size="full" className="overflow-hidden">
        <PageIntro
          title="卷"
          actions={writePermitted ? <CreateVolumeSheet disabled={loadingVolumes} ref={createVolumeSheetRef} /> : null}
        />
        <VolumeTable
          data={volumes}
          loading={loadingVolumes}
          processingVolumeAction={processingVolumeAction}
          onCreateVolume={
            writePermitted
              ? () => {
                  createVolumeSheetRef.current?.open()
                }
              : undefined
          }
          onDelete={(volume) => {
            setVolumeToDelete(volume)
            setShowDeleteDialog(true)
          }}
          onBulkDelete={handleBulkDelete}
        />

        {volumeToDelete && (
          <Dialog
            open={showDeleteDialog}
            onOpenChange={(isOpen) => {
              setShowDeleteDialog(isOpen)
              if (!isOpen) {
                setVolumeToDelete(null)
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>确认删除存储卷</DialogTitle>
                <DialogDescription>
                  确定要删除此存储卷吗？此操作无法撤销。
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    取消
                  </Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={() => handleDelete(volumeToDelete)}
                  disabled={processingVolumeAction[volumeToDelete.id]}
                >
                  {processingVolumeAction[volumeToDelete.id] && <Spinner />}
                  删除
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </PageContent>
      <PageFooter />
    </PageLayout>
  )
}

export default Volumes
