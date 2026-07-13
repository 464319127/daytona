/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { type CommandConfig, useRegisterCommands } from '@/components/CommandPalette'
import { CreateRunnerSheet } from '@/components/CreateRunnerSheet'
import { PageContent, PageFooter, PageHeader, PageIntro, PageLayout } from '@/components/PageLayout'
import { RefreshIntervalValue } from '@/components/RefreshSegmentedButton'
import RunnerDetailsSheet from '@/components/RunnerDetailsSheet'
import { RunnerTable } from '@/components/RunnerTable'
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
import { useApi } from '@/hooks/useApi'
import { useNotificationSocket } from '@/hooks/useNotificationSocket'
import { useRegions } from '@/hooks/useRegions'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { handleApiError } from '@/lib/error-handling'
import {
  CreateRunner,
  CreateRunnerResponse,
  OrganizationRolePermissionsEnum,
  Runner,
  RunnerState,
} from '@daytona/api-client'
import { PlusIcon } from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

const Runners: React.FC = () => {
  const { runnersApi } = useApi()
  const { notificationSocket } = useNotificationSocket()
  const { customRegions: regions, loadingAvailableRegions: loadingRegions, getRegionName } = useRegions()

  const [runners, setRunners] = useState<Runner[]>([])
  const [loadingRunnersData, setLoadingRunnersData] = useState(false)
  const [runnerIsLoading, setRunnerIsLoading] = useState<Record<string, boolean>>({})

  const [runnerToDelete, setRunnerToDelete] = useState<Runner | null>(null)
  const [deleteRunnerDialogIsOpen, setDeleteRunnerDialogIsOpen] = useState(false)

  const [runnerToToggleScheduling, setRunnerToToggleScheduling] = useState<Runner | null>(null)
  const [toggleRunnerSchedulingDialogIsOpen, setToggleRunnerSchedulingDialogIsOpen] = useState(false)

  const [selectedRunner, setSelectedRunner] = useState<Runner | null>(null)
  const [showRunnerDetails, setShowRunnerDetails] = useState(false)

  const [refreshInterval, setRefreshInterval] = useState<RefreshIntervalValue>(false)
  const [runnersUpdatedAt, setRunnersUpdatedAt] = useState<number | undefined>()
  const createRunnerSheetRef = useRef<{ open: () => void }>(null)

  const { selectedOrganization, authenticatedUserHasPermission } = useSelectedOrganization()

  const fetchRunners = useCallback(
    async (showTableLoadingState = true) => {
      if (!selectedOrganization) {
        return
      }
      if (showTableLoadingState) {
        setLoadingRunnersData(true)
      }
      try {
        const response = (await runnersApi.listRunners(undefined, selectedOrganization.id)).data
        setRunners(response || [])
        setRunnersUpdatedAt(Date.now())
      } catch (error) {
        handleApiError(error, '获取 Runner 失败')
        setRunners([])
      } finally {
        setLoadingRunnersData(false)
      }
    },
    [runnersApi, selectedOrganization],
  )

  useEffect(() => {
    fetchRunners()
  }, [fetchRunners])

  useEffect(() => {
    if (typeof refreshInterval !== 'number') return
    const interval = setInterval(() => {
      fetchRunners(false)
    }, refreshInterval)
    return () => clearInterval(interval)
  }, [refreshInterval, fetchRunners])

  useEffect(() => {
    const handleRunnerCreatedEvent = (runner: Runner) => {
      if (!runners.some((r) => r.id === runner.id)) {
        setRunners((prev) => [runner, ...prev])
      }
    }

    const handleRunnerStateUpdatedEvent = (data: { runner: Runner; oldState: RunnerState; newState: RunnerState }) => {
      if (!runners.some((r) => r.id === data.runner.id)) {
        setRunners((prev) => [data.runner, ...prev])
      } else {
        setRunners((prev) =>
          prev.map((r) =>
            r.id === data.runner.id
              ? {
                  ...r,
                  state: data.newState,
                }
              : r,
          ),
        )
      }
    }

    const handleRunnerUnschedulableUpdatedEvent = (runner: Runner) => {
      if (!runners.some((r) => r.id === runner.id)) {
        setRunners((prev) => [runner, ...prev])
      } else {
        setRunners((prev) => prev.map((r) => (r.id === runner.id ? runner : r)))
      }
    }

    if (!notificationSocket) {
      return
    }

    notificationSocket.on('runner.created', handleRunnerCreatedEvent)
    notificationSocket.on('runner.state.updated', handleRunnerStateUpdatedEvent)
    notificationSocket.on('runner.unschedulable.updated', handleRunnerUnschedulableUpdatedEvent)

    return () => {
      notificationSocket.off('runner.created', handleRunnerCreatedEvent)
      notificationSocket.off('runner.state.updated', handleRunnerStateUpdatedEvent)
      notificationSocket.off('runner.unschedulable.updated', handleRunnerUnschedulableUpdatedEvent)
    }
  }, [notificationSocket, runners])

  useEffect(() => {
    if (!selectedRunner || !runners) return
    const found = runners.find((r) => r.id === selectedRunner.id)
    if (!found) {
      setSelectedRunner(null)
      setShowRunnerDetails(false)
      return
    }
    setSelectedRunner(found)
  }, [runners, selectedRunner])

  const handleCreateRunner = async (createRunnerData: CreateRunner): Promise<CreateRunnerResponse | null> => {
    try {
      const response = (await runnersApi.createRunner(createRunnerData, selectedOrganization?.id)).data
      toast.success('Runner 已成功创建')
      return response
    } catch (error) {
      handleApiError(error, '创建 Runner 失败')
      return null
    }
  }

  const handleToggleEnabled = async (runner: Runner) => {
    setRunnerToToggleScheduling(runner)
    setToggleRunnerSchedulingDialogIsOpen(true)
  }

  const confirmToggleScheduling = async () => {
    if (!runnerToToggleScheduling) return

    setRunnerIsLoading((prev) => ({ ...prev, [runnerToToggleScheduling.id]: true }))
    try {
      await runnersApi.updateRunnerScheduling(runnerToToggleScheduling.id, selectedOrganization?.id, {
        data: { unschedulable: !runnerToToggleScheduling.unschedulable },
      })
      toast.success(
        `Runner 现在${runnerToToggleScheduling.unschedulable ? '可以' : '无法'}调度新的 Sandbox`,
      )
    } catch (error) {
      handleApiError(error, '更新 Runner 调度状态失败')
    } finally {
      setRunnerIsLoading((prev) => ({ ...prev, [runnerToToggleScheduling.id]: false }))
      setToggleRunnerSchedulingDialogIsOpen(false)
      setRunnerToToggleScheduling(null)
    }
  }

  const handleDelete = async (runner: Runner) => {
    setRunnerToDelete(runner)
    setDeleteRunnerDialogIsOpen(true)
  }

  const confirmDelete = async () => {
    if (!runnerToDelete) return

    setRunnerIsLoading((prev) => ({ ...prev, [runnerToDelete.id]: true }))
    try {
      await runnersApi.deleteRunner(runnerToDelete.id, selectedOrganization?.id)
      toast.success('Runner 已成功删除')
      await fetchRunners(false)
    } catch (error) {
      handleApiError(error, '删除 Runner 失败')
    } finally {
      setRunnerIsLoading((prev) => ({ ...prev, [runnerToDelete.id]: false }))
      setDeleteRunnerDialogIsOpen(false)
      setRunnerToDelete(null)
    }
  }

  const writePermitted = useMemo(
    () => authenticatedUserHasPermission(OrganizationRolePermissionsEnum.WRITE_RUNNERS),
    [authenticatedUserHasPermission],
  )

  const deletePermitted = useMemo(
    () => authenticatedUserHasPermission(OrganizationRolePermissionsEnum.DELETE_RUNNERS),
    [authenticatedUserHasPermission],
  )

  const rootCommands: CommandConfig[] = useMemo(() => {
    if (!writePermitted || regions.length === 0) {
      return []
    }

    return [
      {
        id: 'create-runner',
        label: '创建 Runner',
        icon: <PlusIcon className="w-4 h-4" />,
        onSelect: () => createRunnerSheetRef.current?.open(),
      },
    ]
  }, [writePermitted, regions.length])

  useRegisterCommands(rootCommands, { groupId: 'runner-actions', groupLabel: 'Runner 操作', groupOrder: 0 })

  return (
    <PageLayout contained>
      <PageHeader />

      <PageContent size="full" className="overflow-hidden">
        <PageIntro
          title="Runner"
          actions={
            writePermitted && regions.length > 0 ? (
              <CreateRunnerSheet regions={regions} onCreateRunner={handleCreateRunner} ref={createRunnerSheetRef} />
            ) : undefined
          }
        />
        <RunnerTable
          data={runners}
          regions={regions}
          loading={loadingRunnersData || loadingRegions}
          isLoadingRunner={(runner) => runnerIsLoading[runner.id] || false}
          writePermitted={writePermitted}
          deletePermitted={deletePermitted}
          onToggleEnabled={handleToggleEnabled}
          onDelete={handleDelete}
          getRegionName={getRegionName}
          onRowClick={(runner: Runner) => {
            setSelectedRunner(runner)
            setShowRunnerDetails(true)
          }}
          refreshInterval={refreshInterval}
          onRefreshIntervalChange={setRefreshInterval}
          onRefresh={() => fetchRunners(false)}
          isRefreshing={loadingRunnersData}
          lastUpdatedAt={runnersUpdatedAt}
        />
      </PageContent>
      <PageFooter />

      {runnerToToggleScheduling && (
        <Dialog open={toggleRunnerSchedulingDialogIsOpen} onOpenChange={setToggleRunnerSchedulingDialogIsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>更新 Runner</DialogTitle>
              <DialogDescription>
                确定要更新此 Runner 的调度状态吗？这会使 Runner
                {runnerToToggleScheduling.unschedulable ? '可用于' : '不可用于'}调度新沙箱。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  取消
                </Button>
              </DialogClose>
              <Button
                variant={runnerToToggleScheduling.unschedulable ? 'default' : 'destructive'}
                onClick={confirmToggleScheduling}
                disabled={runnerIsLoading[runnerToToggleScheduling.id]}
              >
                {runnerIsLoading[runnerToToggleScheduling.id]
                  ? '正在更新...'
                  : runnerToToggleScheduling.unschedulable
                    ? '标记为可调度'
                    : '标记为不可调度'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {runnerToDelete && (
        <Dialog open={deleteRunnerDialogIsOpen} onOpenChange={setDeleteRunnerDialogIsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>确认删除 Runner</DialogTitle>
              <DialogDescription>
                确定要删除此 Runner 吗？此操作无法撤销。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  取消
                </Button>
              </DialogClose>
              <Button variant="destructive" onClick={confirmDelete} disabled={runnerIsLoading[runnerToDelete.id]}>
                {runnerIsLoading[runnerToDelete.id] ? '正在删除...' : '删除'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <RunnerDetailsSheet
        runner={selectedRunner}
        open={showRunnerDetails}
        onOpenChange={setShowRunnerDetails}
        runnerIsLoading={runnerIsLoading}
        writePermitted={writePermitted}
        deletePermitted={deletePermitted}
        onDelete={(runner) => {
          setRunnerToDelete(runner)
          setDeleteRunnerDialogIsOpen(true)
          setShowRunnerDetails(false)
        }}
        getRegionName={getRegionName}
      />
    </PageLayout>
  )
}

export default Runners
