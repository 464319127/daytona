/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { type CommandConfig, useRegisterCommands } from '@/components/CommandPalette'
import { CreateRegionSheet } from '@/components/CreateRegionSheet'
import { PageContent, PageFooter, PageHeader, PageIntro, PageLayout } from '@/components/PageLayout'
import RegionDetailsSheet from '@/components/RegionDetailsSheet'
import { RegionTable } from '@/components/RegionTable'
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { UpdateRegionDialog } from '@/components/UpdateRegionDialog'
import { useApi } from '@/hooks/useApi'
import { useRegions } from '@/hooks/useRegions'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { handleApiError } from '@/lib/error-handling'
import { getMaskedToken } from '@/lib/utils'
import {
  CreateRegion,
  CreateRegionResponse,
  OrganizationRolePermissionsEnum,
  Region,
  SnapshotManagerCredentials,
  UpdateRegion,
} from '@daytona/api-client'
import { Copy, PlusIcon } from 'lucide-react'
import React, { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

const Regions: React.FC = () => {
  const { organizationsApi } = useApi()
  const { selectedOrganization, authenticatedUserHasPermission } = useSelectedOrganization()
  const {
    availableRegions: regions,
    loadingAvailableRegions: loadingRegions,
    refreshAvailableRegions: refreshRegions,
  } = useRegions()

  const [regionIsLoading, setRegionIsLoading] = useState<Record<string, boolean>>({})

  const [regionToDelete, setRegionToDelete] = useState<Region | null>(null)
  const [deleteRegionDialogIsOpen, setDeleteRegionDialogIsOpen] = useState(false)

  // Regenerate API Key state
  const [showRegenerateProxyApiKeyDialog, setShowRegenerateProxyApiKeyDialog] = useState(false)
  const [showRegenerateSshGatewayApiKeyDialog, setShowRegenerateSshGatewayApiKeyDialog] = useState(false)
  const [showRegenerateSnapshotManagerCredsDialog, setShowRegenerateSnapshotManagerCredsDialog] = useState(false)
  const [regeneratedApiKey, setRegeneratedApiKey] = useState<string | null>(null)
  const [regeneratedSnapshotManagerCreds, setRegeneratedSnapshotManagerCreds] =
    useState<SnapshotManagerCredentials | null>(null)
  const [regionForRegenerate, setRegionForRegenerate] = useState<Region | null>(null)
  const [isApiKeyRevealed, setIsApiKeyRevealed] = useState(false)
  const [isSnapshotManagerPasswordRevealed, setIsSnapshotManagerPasswordRevealed] = useState(false)

  // Region Details Sheet state
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null)
  const [showRegionDetails, setShowRegionDetails] = useState(false)

  // Update Region Dialog state
  const [showUpdateRegionDialog, setShowUpdateRegionDialog] = useState(false)
  const [regionToUpdate, setRegionToUpdate] = useState<Region | null>(null)
  const createRegionSheetRef = useRef<{ open: () => void }>(null)

  const handleCreateRegion = async (createRegionData: CreateRegion): Promise<CreateRegionResponse | null> => {
    if (!selectedOrganization) {
      return null
    }

    try {
      const response = (await organizationsApi.createRegion(createRegionData, selectedOrganization.id)).data
      toast.success(`正在创建区域 ${createRegionData.name}`)
      await refreshRegions()
      return response
    } catch (error) {
      handleApiError(error, '创建区域失败')
      return null
    }
  }

  const handleDelete = async (region: Region) => {
    if (!selectedOrganization) {
      return
    }

    setRegionIsLoading((prev) => ({ ...prev, [region.id]: true }))

    try {
      await organizationsApi.deleteRegion(region.id, selectedOrganization.id)
      setRegionToDelete(null)
      setDeleteRegionDialogIsOpen(false)
      toast.success(`正在删除区域 ${region.name}`)
      await refreshRegions()
    } catch (error) {
      handleApiError(error, '删除区域失败')
    } finally {
      setRegionIsLoading((prev) => ({ ...prev, [region.id]: false }))
    }
  }

  const writePermitted = useMemo(
    () => authenticatedUserHasPermission(OrganizationRolePermissionsEnum.WRITE_REGIONS),
    [authenticatedUserHasPermission],
  )

  const deletePermitted = useMemo(
    () => authenticatedUserHasPermission(OrganizationRolePermissionsEnum.DELETE_REGIONS),
    [authenticatedUserHasPermission],
  )

  const rootCommands: CommandConfig[] = useMemo(() => {
    if (!writePermitted) {
      return []
    }

    return [
      {
        id: 'create-region',
        label: '创建区域',
        icon: <PlusIcon className="w-4 h-4" />,
        onSelect: () => createRegionSheetRef.current?.open(),
      },
    ]
  }, [writePermitted])

  useRegisterCommands(rootCommands, { groupId: 'region-actions', groupLabel: '区域操作', groupOrder: 0 })

  const handleRegenerateProxyApiKey = async (region: Region) => {
    setRegionForRegenerate(region)
    setRegeneratedApiKey(null)
    setShowRegenerateProxyApiKeyDialog(true)
  }

  const handleRegenerateSshGatewayApiKey = async (region: Region) => {
    setRegionForRegenerate(region)
    setRegeneratedApiKey(null)
    setShowRegenerateSshGatewayApiKeyDialog(true)
  }

  const handleRegenerateSnapshotManagerCredentials = async (region: Region) => {
    setRegionForRegenerate(region)
    setRegeneratedSnapshotManagerCreds(null)
    setShowRegenerateSnapshotManagerCredsDialog(true)
  }

  const handleOpenRegionDetails = (region: Region) => {
    setSelectedRegion(region)
    setShowRegionDetails(true)
  }

  const handleUpdateRegion = async (regionId: string, updateData: UpdateRegion): Promise<boolean> => {
    if (!selectedOrganization) return false

    setRegionIsLoading((prev) => ({ ...prev, [regionId]: true }))
    try {
      await organizationsApi.updateRegion(regionId, updateData, selectedOrganization.id)
      toast.success('区域已更新')
      await refreshRegions()
      return true
    } catch (error) {
      handleApiError(error, '更新区域失败')
      return false
    } finally {
      setRegionIsLoading((prev) => ({ ...prev, [regionId]: false }))
    }
  }

  const handleOpenUpdateDialog = (region: Region) => {
    setRegionToUpdate(region)
    setShowUpdateRegionDialog(true)
    setShowRegionDetails(false)
  }

  const confirmRegenerateProxyApiKey = async () => {
    if (!regionForRegenerate || !selectedOrganization) {
      return
    }

    setRegionIsLoading((prev) => ({ ...prev, [regionForRegenerate.id]: true }))

    try {
      const response = await organizationsApi.regenerateProxyApiKey(regionForRegenerate.id, selectedOrganization.id)
      setRegeneratedApiKey(response.data.apiKey)
      setShowRegenerateProxyApiKeyDialog(true)
      toast.success('Proxy API 密钥已重新生成')
    } catch (error) {
      handleApiError(error, '重新生成 Proxy API 密钥失败')
      setShowRegenerateProxyApiKeyDialog(false)
      setRegionForRegenerate(null)
    } finally {
      setRegionIsLoading((prev) => ({ ...prev, [regionForRegenerate.id]: false }))
    }
  }

  const confirmRegenerateSshGatewayApiKey = async () => {
    if (!regionForRegenerate || !selectedOrganization) {
      return
    }

    setRegionIsLoading((prev) => ({ ...prev, [regionForRegenerate.id]: true }))

    try {
      const response = await organizationsApi.regenerateSshGatewayApiKey(
        regionForRegenerate.id,
        selectedOrganization.id,
      )
      setRegeneratedApiKey(response.data.apiKey)
      setShowRegenerateSshGatewayApiKeyDialog(true)
      toast.success('SSH Gateway API 密钥已重新生成')
    } catch (error) {
      handleApiError(error, '重新生成 SSH Gateway API 密钥失败')
      setShowRegenerateSshGatewayApiKeyDialog(false)
      setRegionForRegenerate(null)
    } finally {
      setRegionIsLoading((prev) => ({ ...prev, [regionForRegenerate.id]: false }))
    }
  }

  const confirmRegenerateSnapshotManagerCredentials = async () => {
    if (!regionForRegenerate || !selectedOrganization) {
      return
    }

    setRegionIsLoading((prev) => ({ ...prev, [regionForRegenerate.id]: true }))

    try {
      const response = await organizationsApi.regenerateSnapshotManagerCredentials(
        regionForRegenerate.id,
        selectedOrganization.id,
      )
      setRegeneratedSnapshotManagerCreds(response.data)
      setShowRegenerateSnapshotManagerCredsDialog(true)
      toast.success('Snapshot Manager 凭据已重新生成')
    } catch (error) {
      handleApiError(error, '重新生成 Snapshot Manager 凭据失败')
      setShowRegenerateSnapshotManagerCredsDialog(false)
      setRegionForRegenerate(null)
    } finally {
      setRegionIsLoading((prev) => ({ ...prev, [regionForRegenerate.id]: false }))
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('已复制到剪贴板')
    } catch (err) {
      console.error('复制文本失败：', err)
      toast.error('复制到剪贴板失败')
    }
  }

  return (
    <PageLayout contained>
      <PageHeader />

      <PageContent size="full" className="overflow-hidden">
        <PageIntro
          title="区域"
          actions={
            <CreateRegionSheet
              onCreateRegion={handleCreateRegion}
              writePermitted={writePermitted}
              loadingData={loadingRegions}
              ref={createRegionSheetRef}
            />
          }
        />
        <RegionTable
          data={regions}
          loading={loadingRegions}
          isLoadingRegion={(region) => regionIsLoading[region.id] || false}
          deletePermitted={deletePermitted}
          writePermitted={writePermitted}
          onDelete={(region) => {
            setRegionToDelete(region)
            setDeleteRegionDialogIsOpen(true)
          }}
          onOpenDetails={handleOpenRegionDetails}
        />
      </PageContent>
      <PageFooter />

      <RegionDetailsSheet
        region={selectedRegion}
        open={showRegionDetails}
        onOpenChange={(open) => {
          setShowRegionDetails(open)
          if (!open) {
            setSelectedRegion(null)
          }
        }}
        regionIsLoading={regionIsLoading}
        writePermitted={writePermitted}
        deletePermitted={deletePermitted}
        onDelete={(region) => {
          setRegionToDelete(region)
          setDeleteRegionDialogIsOpen(true)
          setShowRegionDetails(false)
        }}
        onUpdate={handleOpenUpdateDialog}
        onRegenerateProxyApiKey={handleRegenerateProxyApiKey}
        onRegenerateSshGatewayApiKey={handleRegenerateSshGatewayApiKey}
        onRegenerateSnapshotManagerCredentials={handleRegenerateSnapshotManagerCredentials}
      />

      {regionToUpdate && (
        <UpdateRegionDialog
          region={regionToUpdate}
          open={showUpdateRegionDialog}
          onOpenChange={(isOpen) => {
            setShowUpdateRegionDialog(isOpen)
            if (!isOpen) setRegionToUpdate(null)
          }}
          onUpdateRegion={handleUpdateRegion}
          loading={regionToUpdate ? regionIsLoading[regionToUpdate.id] || false : false}
        />
      )}

      {regionToDelete && (
        <Dialog
          open={deleteRegionDialogIsOpen}
          onOpenChange={(isOpen) => {
            setDeleteRegionDialogIsOpen(isOpen)
            if (!isOpen) {
              setRegionToDelete(null)
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>确认删除区域</DialogTitle>
              <DialogDescription>
                确定要删除此区域吗？此操作无法撤销。
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
                onClick={() => handleDelete(regionToDelete)}
                disabled={regionIsLoading[regionToDelete.id]}
              >
                {regionIsLoading[regionToDelete.id] ? '正在删除...' : '删除'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Regenerate Proxy API Key Dialog */}
      <AlertDialog
        open={showRegenerateProxyApiKeyDialog}
        onOpenChange={(isOpen) => {
          setShowRegenerateProxyApiKeyDialog(isOpen)
          if (!isOpen) {
            setRegionForRegenerate(null)
            setRegeneratedApiKey(null)
            setIsApiKeyRevealed(false)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {regeneratedApiKey ? 'Proxy API 密钥已重新生成' : '重新生成 Proxy API 密钥'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {regeneratedApiKey ? (
                '新 API 密钥已生成。请立即复制，该密钥不会再次显示。'
              ) : (
                <>
                  <strong>警告：</strong>此操作会立即使当前 Proxy API 密钥失效。需要使用新 API 密钥重新部署
                  Proxy。
                </>
              )}
              {regeneratedApiKey && (
                <div className="space-y-4 mt-4">
                  <div className="p-3 flex justify-between items-center rounded-md bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400">
                    <span
                      className="overflow-x-auto pr-2 cursor-text select-all"
                      onMouseEnter={() => setIsApiKeyRevealed(true)}
                      onMouseLeave={() => setIsApiKeyRevealed(false)}
                    >
                      {isApiKeyRevealed ? regeneratedApiKey : getMaskedToken(regeneratedApiKey)}
                    </span>
                    <Copy
                      className="w-4 h-4 cursor-pointer flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => copyToClipboard(regeneratedApiKey)}
                    />
                  </div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            {!regeneratedApiKey ? (
              <>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmRegenerateProxyApiKey}
                  disabled={!regionForRegenerate || regionIsLoading[regionForRegenerate?.id || '']}
                  className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
                >
                  {regionForRegenerate && regionIsLoading[regionForRegenerate.id] ? '正在重新生成...' : '重新生成'}
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction
                onClick={() => {
                  setShowRegenerateProxyApiKeyDialog(false)
                  setRegionForRegenerate(null)
                  setRegeneratedApiKey(null)
                  setIsApiKeyRevealed(false)
                }}
                className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
              >
                关闭
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Regenerate SSH Gateway API Key Dialog */}
      <AlertDialog
        open={showRegenerateSshGatewayApiKeyDialog}
        onOpenChange={(isOpen) => {
          setShowRegenerateSshGatewayApiKeyDialog(isOpen)
          if (!isOpen) {
            setRegionForRegenerate(null)
            setRegeneratedApiKey(null)
            setIsApiKeyRevealed(false)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {regeneratedApiKey ? 'SSH Gateway API 密钥已重新生成' : '重新生成 SSH Gateway API 密钥'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {regeneratedApiKey ? (
                '新 API 密钥已生成。请立即复制，该密钥不会再次显示。'
              ) : (
                <>
                  <strong>警告：</strong>此操作会立即使当前 SSH Gateway API 密钥失效。需要使用新 API 密钥重新部署
                  SSH Gateway。
                </>
              )}
              {regeneratedApiKey && (
                <div className="space-y-4 mt-4">
                  <div className="p-3 flex justify-between items-center rounded-md bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400">
                    <span
                      className="overflow-x-auto pr-2 cursor-text select-all"
                      onMouseEnter={() => setIsApiKeyRevealed(true)}
                      onMouseLeave={() => setIsApiKeyRevealed(false)}
                    >
                      {isApiKeyRevealed ? regeneratedApiKey : getMaskedToken(regeneratedApiKey)}
                    </span>
                    <Copy
                      className="w-4 h-4 cursor-pointer flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => copyToClipboard(regeneratedApiKey)}
                    />
                  </div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            {!regeneratedApiKey ? (
              <>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmRegenerateSshGatewayApiKey}
                  disabled={!regionForRegenerate || regionIsLoading[regionForRegenerate?.id || '']}
                  className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
                >
                  {regionForRegenerate && regionIsLoading[regionForRegenerate.id] ? '正在重新生成...' : '重新生成'}
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction
                onClick={() => {
                  setShowRegenerateSshGatewayApiKeyDialog(false)
                  setRegionForRegenerate(null)
                  setRegeneratedApiKey(null)
                  setIsApiKeyRevealed(false)
                }}
                className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
              >
                关闭
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Regenerate Snapshot Manager Credentials Dialog */}
      <AlertDialog
        open={showRegenerateSnapshotManagerCredsDialog}
        onOpenChange={(isOpen) => {
          setShowRegenerateSnapshotManagerCredsDialog(isOpen)
          if (!isOpen) {
            setRegionForRegenerate(null)
            setRegeneratedSnapshotManagerCreds(null)
            setIsSnapshotManagerPasswordRevealed(false)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {regeneratedSnapshotManagerCreds
                ? 'Snapshot Manager 凭据已重新生成'
                : '重新生成 Snapshot Manager 凭据'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {regeneratedSnapshotManagerCreds ? (
                '新凭据已生成。请立即复制，这些凭据不会再次显示。'
              ) : (
                <>
                  <strong>警告：</strong>此操作会立即使当前 Snapshot Manager 凭据失效。
                  需要使用新凭据重新配置 Snapshot Manager。
                </>
              )}
              {regeneratedSnapshotManagerCreds && (
                <div className="space-y-4 mt-4">
                  <div>
                    <span className="text-xs text-muted-foreground">用户名</span>
                    <div className="p-3 flex justify-between items-center rounded-md bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400">
                      <span className="overflow-x-auto pr-2 cursor-text select-all">
                        {regeneratedSnapshotManagerCreds.username}
                      </span>
                      <Copy
                        className="w-4 h-4 cursor-pointer flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => copyToClipboard(regeneratedSnapshotManagerCreds.username)}
                      />
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">密码</span>
                    <div className="p-3 flex justify-between items-center rounded-md bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400">
                      <span
                        className="overflow-x-auto pr-2 cursor-text select-all"
                        onMouseEnter={() => setIsSnapshotManagerPasswordRevealed(true)}
                        onMouseLeave={() => setIsSnapshotManagerPasswordRevealed(false)}
                      >
                        {isSnapshotManagerPasswordRevealed
                          ? regeneratedSnapshotManagerCreds.password
                          : getMaskedToken(regeneratedSnapshotManagerCreds.password)}
                      </span>
                      <Copy
                        className="w-4 h-4 cursor-pointer flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => copyToClipboard(regeneratedSnapshotManagerCreds.password)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            {!regeneratedSnapshotManagerCreds ? (
              <>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmRegenerateSnapshotManagerCredentials}
                  disabled={!regionForRegenerate || regionIsLoading[regionForRegenerate?.id || '']}
                  className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
                >
                  {regionForRegenerate && regionIsLoading[regionForRegenerate.id] ? '正在重新生成...' : '重新生成'}
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction
                onClick={() => {
                  setShowRegenerateSnapshotManagerCredsDialog(false)
                  setRegionForRegenerate(null)
                  setRegeneratedSnapshotManagerCreds(null)
                  setIsSnapshotManagerPasswordRevealed(false)
                }}
                className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
              >
                关闭
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  )
}

export default Regions
