/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { type CommandConfig, useRegisterCommands } from '@/components/CommandPalette'
import { CreateApiKeySheet } from '@/components/CreateApiKeySheet'
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
import { useRevokeApiKeyMutation } from '@/hooks/mutations/useRevokeApiKeyMutation'
import { useApiKeysQuery } from '@/hooks/queries/useApiKeysQuery'
import { useConfig } from '@/hooks/useConfig'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { handleApiError } from '@/lib/error-handling'
import { ApiKeyList, CreateApiKeyPermissionsEnum, OrganizationUserRoleEnum } from '@daytona/api-client'
import { PlusIcon } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ApiKeyTable } from '../components/ApiKeyTable'

const Keys: React.FC = () => {
  const { apiUrl } = useConfig()
  const [loadingKeys, setLoadingKeys] = useState<Record<string, boolean>>({})
  const [apiKeyToRevoke, setApiKeyToRevoke] = useState<ApiKeyList | null>(null)
  const [showRevokeDialog, setShowRevokeDialog] = useState(false)
  const createApiKeySheetRef = useRef<{ open: () => void }>(null)

  const { selectedOrganization, authenticatedUserOrganizationMember } = useSelectedOrganization()
  const revokeApiKeyMutation = useRevokeApiKeyMutation()
  const apiKeysQuery = useApiKeysQuery(selectedOrganization?.id)

  const availablePermissions = useMemo<CreateApiKeyPermissionsEnum[]>(() => {
    if (!authenticatedUserOrganizationMember) {
      return []
    }
    if (authenticatedUserOrganizationMember.role === OrganizationUserRoleEnum.OWNER) {
      return Object.values(CreateApiKeyPermissionsEnum).filter(
        (value) => value !== CreateApiKeyPermissionsEnum.UNKNOWN_DEFAULT_OPEN_API,
      )
    }
    return Array.from(new Set(authenticatedUserOrganizationMember.assignedRoles.flatMap((role) => role.permissions)))
  }, [authenticatedUserOrganizationMember])

  const handleRevoke = async (key: ApiKeyList) => {
    if (!selectedOrganization) {
      return
    }
    const loadingId = getLoadingKeyId(key)
    setLoadingKeys((prev) => ({ ...prev, [loadingId]: true }))
    try {
      await revokeApiKeyMutation.mutateAsync({
        userId: key.userId,
        name: key.name,
        organizationId: selectedOrganization.id,
      })
      toast.success('API 密钥已撤销')
    } catch (error) {
      handleApiError(error, '撤销 API 密钥失败')
    } finally {
      setLoadingKeys((prev) => ({ ...prev, [loadingId]: false }))
    }
  }

  const getLoadingKeyId = useCallback((key: ApiKeyList) => {
    return `${key.userId}-${key.name}`
  }, [])

  const isLoadingKey = useCallback(
    (key: ApiKeyList) => {
      const loadingId = getLoadingKeyId(key)
      return loadingKeys[loadingId]
    },
    [getLoadingKeyId, loadingKeys],
  )

  const rootCommands: CommandConfig[] = useMemo(() => {
    if (!selectedOrganization?.id) {
      return []
    }

    return [
      {
        id: 'create-key',
        label: '创建 API 密钥',
        icon: <PlusIcon className="w-4 h-4" />,
        onSelect: () => createApiKeySheetRef.current?.open(),
      },
    ]
  }, [selectedOrganization?.id])

  useRegisterCommands(rootCommands, { groupId: 'api-key-actions', groupLabel: 'API 密钥操作', groupOrder: 0 })

  return (
    <PageLayout contained>
      <PageHeader />

      <PageContent size="full" className="overflow-hidden">
        <PageIntro
          title="API 密钥"
          actions={
            <CreateApiKeySheet
              availablePermissions={availablePermissions}
              apiUrl={apiUrl}
              organizationId={selectedOrganization?.id}
              ref={createApiKeySheetRef}
            />
          }
        />
        <ApiKeyTable
          data={apiKeysQuery.data ?? []}
          loading={apiKeysQuery.isLoading}
          isLoadingKey={isLoadingKey}
          onRevokeRequest={(key) => {
            setApiKeyToRevoke(key)
            setShowRevokeDialog(true)
          }}
        />

        {apiKeyToRevoke && (
          <Dialog
            open={showRevokeDialog}
            onOpenChange={(isOpen) => {
              setShowRevokeDialog(isOpen)
              if (!isOpen) {
                setApiKeyToRevoke(null)
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>确认撤销 API 密钥</DialogTitle>
                <DialogDescription>
                  确定要撤销 API 密钥“{apiKeyToRevoke.name}”吗？此操作无法撤销。
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
                  onClick={() => handleRevoke(apiKeyToRevoke)}
                  disabled={isLoadingKey(apiKeyToRevoke)}
                >
                  {isLoadingKey(apiKeyToRevoke) && <Spinner />}
                  撤销
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

export default Keys
