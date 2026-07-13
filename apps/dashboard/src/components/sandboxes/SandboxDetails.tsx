/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { OrganizationSuspendedError } from '@/api/errors'
import { PageHeader, PageLayout, PageTitle } from '@/components/PageLayout'
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
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ScrollArea } from '@/components/ui/scroll-area'
import { RoutePath } from '@/enums/RoutePath'
import { useArchiveSandboxMutation } from '@/hooks/mutations/useArchiveSandboxMutation'
import { useDeleteSandboxMutation } from '@/hooks/mutations/useDeleteSandboxMutation'
import { useRecoverSandboxMutation } from '@/hooks/mutations/useRecoverSandboxMutation'
import { useStartSandboxMutation } from '@/hooks/mutations/useStartSandboxMutation'
import { useStopSandboxMutation } from '@/hooks/mutations/useStopSandboxMutation'
import { useSandboxQuery } from '@/hooks/queries/useSandboxQuery'
import { useApi } from '@/hooks/useApi'
import { useConfig } from '@/hooks/useConfig'
import { useMatchMedia } from '@/hooks/useMatchMedia'
import { useRegions } from '@/hooks/useRegions'
import { useSandboxDetailsWsSync } from '@/hooks/useSandboxWsSync'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { handleApiError } from '@/lib/error-handling'
import { isStoppable, isTransitioning } from '@/lib/utils/sandbox'
import { SandboxSessionProvider } from '@/providers/SandboxSessionProvider'
import { OrganizationRolePermissionsEnum, OrganizationUserRoleEnum } from '@daytona/api-client'
import { isAxiosError } from 'axios'
import { Container, GripVertical, RefreshCw } from 'lucide-react'
import { useQueryState } from 'nuqs'
import { useEffect, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { CreateSshAccessSheet } from './CreateSshAccessSheet'
import { RevokeSshAccessDialog } from './RevokeSshAccessDialog'
import { SandboxContentTabs } from './SandboxContentTabs'
import { SandboxHeader } from './SandboxHeader'
import { InfoPanelSkeleton, SandboxInfoPanel } from './SandboxInfoPanel'
import { tabParser } from './SearchParams'

export default function SandboxDetails() {
  const { sandboxId } = useParams<{ sandboxId: string }>()
  const navigate = useNavigate()
  const config = useConfig()
  const { sandboxApi } = useApi()
  const { authenticatedUserOrganizationMember, selectedOrganization, authenticatedUserHasPermission } =
    useSelectedOrganization()
  const { getRegionName } = useRegions()

  const spendingTabAvailable = !!config.analyticsApiUrl

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [createSshDialogOpen, setCreateSshDialogOpen] = useState(false)
  const [revokeSshDialogOpen, setRevokeSshDialogOpen] = useState(false)
  const [tab, setTab] = useQueryState('tab', tabParser)
  const isDesktop = useMatchMedia('(min-width: 1024px)')

  // On desktop (lg+), the overview tab is hidden in the sidebar, so switch to a content tab
  useEffect(() => {
    if (isDesktop && tab === 'overview') {
      setTab('logs')
    }
  }, [isDesktop, tab, setTab])

  useEffect(() => {
    if (!spendingTabAvailable && tab === 'spending') {
      setTab('terminal')
    }
  }, [spendingTabAvailable, tab, setTab])

  const { data: sandbox, isLoading, isError, error, refetch, isFetching } = useSandboxQuery(sandboxId ?? '')
  const isNotFound = isError && isAxiosError(error.cause) && error.cause?.status === 404

  useSandboxDetailsWsSync(sandboxId)

  const startMutation = useStartSandboxMutation({ invalidate: false })
  const stopMutation = useStopSandboxMutation({ invalidate: false })
  const archiveMutation = useArchiveSandboxMutation({ invalidate: false })
  const recoverMutation = useRecoverSandboxMutation({ invalidate: false })
  const deleteMutation = useDeleteSandboxMutation()

  const writePermitted = authenticatedUserHasPermission(OrganizationRolePermissionsEnum.WRITE_SANDBOXES)
  const deletePermitted = authenticatedUserHasPermission(OrganizationRolePermissionsEnum.DELETE_SANDBOXES)
  const transitioning = sandbox ? isTransitioning(sandbox) : false
  const anyMutating =
    startMutation.isPending ||
    stopMutation.isPending ||
    archiveMutation.isPending ||
    recoverMutation.isPending ||
    deleteMutation.isPending
  const actionsDisabled = anyMutating || transitioning

  const handleStart = async () => {
    if (!sandbox) return
    try {
      await startMutation.mutateAsync({ sandboxId: sandbox.id })
      toast.success('沙箱已启动')
    } catch (error) {
      handleApiError(error, '启动沙箱失败', {
        action:
          error instanceof OrganizationSuspendedError &&
          config.billingApiUrl &&
          authenticatedUserOrganizationMember?.role === OrganizationUserRoleEnum.OWNER ? (
            <Button variant="secondary" onClick={() => navigate(RoutePath.BILLING_WALLET)}>
              前往账单
            </Button>
          ) : null,
      })
    }
  }

  const handleStop = async () => {
    if (!sandbox) return
    try {
      await stopMutation.mutateAsync({ sandboxId: sandbox.id })
      toast.success('沙箱已停止')
    } catch (error) {
      handleApiError(error, '停止沙箱失败')
    }
  }

  const handleArchive = async () => {
    if (!sandbox) return
    try {
      await archiveMutation.mutateAsync({ sandboxId: sandbox.id })
      toast.success('沙箱已归档')
    } catch (error) {
      handleApiError(error, '归档 Sandbox 失败')
    }
  }

  const handleRecover = async () => {
    if (!sandbox) return
    try {
      await recoverMutation.mutateAsync({ sandboxId: sandbox.id })
      toast.success('沙箱恢复已开始')
    } catch (error) {
      handleApiError(error, '恢复沙箱失败')
    }
  }

  const handleDelete = async () => {
    if (!sandbox) return
    try {
      await deleteMutation.mutateAsync({ sandboxId: sandbox.id })
      toast.success('沙箱已删除')
      setDeleteDialogOpen(false)
      navigate(RoutePath.SANDBOXES)
    } catch (error) {
      handleApiError(error, '删除 Sandbox 失败')
    }
  }

  const handleScreenRecordings = async () => {
    if (!sandbox || !isStoppable(sandbox)) {
      toast.error('必须先启动沙箱才能访问屏幕录像')
      return
    }
    try {
      const response = await sandboxApi.getSignedPortPreviewUrl(sandbox.id, 33333, selectedOrganization?.id)
      window.open(response.data.url, '_blank', 'noopener,noreferrer')
      toast.success('正在打开屏幕录像控制台...')
    } catch (error) {
      handleApiError(error, '打开屏幕录像失败')
    }
  }

  return (
    <SandboxSessionProvider>
      <PageLayout className="max-h-screen overflow-hidden">
        <PageHeader>
          <PageTitle>沙箱</PageTitle>
        </PageHeader>

        <SandboxHeader
          sandbox={sandbox}
          isLoading={isLoading}
          writePermitted={writePermitted}
          deletePermitted={deletePermitted}
          actionsDisabled={actionsDisabled}
          isFetching={isFetching}
          onStart={handleStart}
          onStop={handleStop}
          onArchive={handleArchive}
          onRecover={handleRecover}
          onDelete={() => setDeleteDialogOpen(true)}
          onRefresh={() => refetch()}
          onBack={() => navigate(RoutePath.SANDBOXES)}
          onCreateSshAccess={() => setCreateSshDialogOpen(true)}
          onRevokeSshAccess={() => setRevokeSshDialogOpen(true)}
          onScreenRecordings={handleScreenRecordings}
        />

        {isNotFound ? (
          <div className="flex flex-1 min-h-0 items-center justify-center">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Container className="size-4" />
                </EmptyMedia>
                <EmptyTitle>未找到沙箱</EmptyTitle>
                <EmptyDescription>请确认当前选择的组织是否正确。</EmptyDescription>
              </EmptyHeader>
              <Button variant="outline" size="sm" onClick={() => navigate(RoutePath.SANDBOXES)}>
                Back to Sandboxes
              </Button>
            </Empty>
          </div>
        ) : (
          <Group orientation="horizontal" className="flex flex-1 min-h-0 overflow-hidden">
            {isDesktop && (
              <>
                <Panel
                  id="overview"
                  minSize={250}
                  maxSize={550}
                  defaultSize={320}
                  className="flex flex-col overflow-hidden"
                >
                  <div className="flex items-center px-5 border-b border-border shrink-0 h-[41px]">
                    <span className="text-sm font-medium">概览</span>
                  </div>
                  <ScrollArea fade="mask" className="flex-1 min-h-0">
                    {isLoading ? (
                      <InfoPanelSkeleton />
                    ) : isError || !sandbox ? (
                      <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
                        <p className="text-sm">加载沙箱详情失败。</p>
                        <Button variant="outline" size="sm" onClick={() => refetch()}>
                          <RefreshCw className="size-4" />
                          Retry
                        </Button>
                      </div>
                    ) : (
                      <SandboxInfoPanel
                        sandbox={sandbox}
                        getRegionName={getRegionName}
                        actionsDisabled={actionsDisabled}
                        writePermitted={writePermitted}
                        onCreateSshAccess={() => setCreateSshDialogOpen(true)}
                        onRevokeSshAccess={() => setRevokeSshDialogOpen(true)}
                        onScreenRecordings={handleScreenRecordings}
                      />
                    )}
                  </ScrollArea>
                </Panel>
                <ResizableSeparator />
              </>
            )}
            <Panel id="content" className="flex-1 min-w-0 flex flex-col overflow-hidden">
              <SandboxContentTabs
                sandbox={sandbox}
                isLoading={isLoading}
                spendingTabAvailable={!!spendingTabAvailable}
                tab={tab}
                onTabChange={setTab}
              />
            </Panel>
          </Group>
        )}

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>删除 Sandbox</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this sandbox? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteMutation.isPending}>取消</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? '正在删除...' : '删除'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {sandboxId && (
          <>
            <CreateSshAccessSheet
              sandboxId={sandboxId}
              open={createSshDialogOpen}
              onOpenChange={setCreateSshDialogOpen}
            />
            <RevokeSshAccessDialog
              sandboxId={sandboxId}
              open={revokeSshDialogOpen}
              onOpenChange={setRevokeSshDialogOpen}
            />
          </>
        )}
      </PageLayout>
    </SandboxSessionProvider>
  )
}

function ResizableSeparator() {
  return (
    <Separator className="group relative flex w-px items-center justify-center bg-transparent text-muted-foreground focus-visible:outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border after:transition-colors data-[separator=hover]:text-primary data-[separator=hover]:after:bg-primary data-[separator=active]:text-primary data-[separator=active]:after:bg-primary focus-visible:text-primary">
      <div className="z-10 flex h-6 w-3.5 items-center justify-center rounded-sm border border-border bg-background transition-colors group-data-[separator=hover]:border-current group-data-[separator=active]:border-current group-focus-visible:border-current">
        <GripVertical className="size-3 text-current" />
      </div>
    </Separator>
  )
}
