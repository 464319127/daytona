/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { CreateOrganizationRoleSheet } from '@/components/OrganizationRoles/CreateOrganizationRoleSheet'
import { type CommandConfig, useRegisterCommands } from '@/components/CommandPalette'
import { OrganizationRoleTable } from '@/components/OrganizationRoles/OrganizationRoleTable'
import { PageContent, PageHeader, PageIntro, PageLayout } from '@/components/PageLayout'
import { useApi } from '@/hooks/useApi'
import { useOrganizationRoles } from '@/hooks/useOrganizationRoles'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { handleApiError } from '@/lib/error-handling'
import { OrganizationRolePermissionsEnum } from '@daytona/api-client'
import { PlusIcon } from 'lucide-react'
import React, { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

const OrganizationRoles: React.FC = () => {
  const { organizationsApi } = useApi()

  const { selectedOrganization } = useSelectedOrganization()
  const { roles, loadingRoles, refreshRoles } = useOrganizationRoles()

  const [loadingRoleAction, setLoadingRoleAction] = useState<Record<string, boolean>>({})
  const createRoleSheetRef = useRef<{ open: () => void }>(null)

  const handleCreateRole = async (
    name: string,
    description: string,
    permissions: OrganizationRolePermissionsEnum[],
  ): Promise<boolean> => {
    if (!selectedOrganization) {
      return false
    }
    try {
      await organizationsApi.createOrganizationRole(selectedOrganization.id, {
        name: name.trim(),
        description: description?.trim(),
        permissions,
      })
      toast.success('角色已创建')
      await refreshRoles(false)
      return true
    } catch (error) {
      handleApiError(error, '创建角色失败')
      return false
    }
  }

  const handleUpdateRole = async (
    roleId: string,
    name: string,
    description: string,
    permissions: OrganizationRolePermissionsEnum[],
  ): Promise<boolean> => {
    if (!selectedOrganization) {
      return false
    }
    setLoadingRoleAction((prev) => ({ ...prev, [roleId]: true }))
    try {
      await organizationsApi.updateOrganizationRole(selectedOrganization.id, roleId, {
        name: name.trim(),
        description: description?.trim(),
        permissions,
      })
      toast.success('角色已更新')
      await refreshRoles(false)
      return true
    } catch (error) {
      handleApiError(error, '更新角色失败')
      return false
    } finally {
      setLoadingRoleAction((prev) => ({ ...prev, [roleId]: false }))
    }
  }

  const handleDeleteRole = async (roleId: string): Promise<boolean> => {
    if (!selectedOrganization) {
      return false
    }
    setLoadingRoleAction((prev) => ({ ...prev, [roleId]: true }))
    try {
      await organizationsApi.deleteOrganizationRole(selectedOrganization.id, roleId)
      toast.success('角色已删除')
      await refreshRoles(false)
      return true
    } catch (error) {
      handleApiError(error, '删除角色失败')
      return false
    } finally {
      setLoadingRoleAction((prev) => ({ ...prev, [roleId]: false }))
    }
  }

  const rootCommands: CommandConfig[] = useMemo(
    () => [
      {
        id: 'create-role',
        label: '创建角色',
        icon: <PlusIcon className="w-4 h-4" />,
        onSelect: () => createRoleSheetRef.current?.open(),
      },
    ],
    [],
  )

  useRegisterCommands(rootCommands, { groupId: 'role-actions', groupLabel: '角色操作', groupOrder: 0 })

  return (
    <PageLayout>
      <PageHeader />

      <PageContent>
        <PageIntro
          title="角色"
          actions={<CreateOrganizationRoleSheet onCreateRole={handleCreateRole} ref={createRoleSheetRef} />}
        />
        <OrganizationRoleTable
          data={roles}
          loadingData={loadingRoles}
          onUpdateRole={handleUpdateRole}
          onDeleteRole={handleDeleteRole}
          loadingRoleAction={loadingRoleAction}
        />
      </PageContent>
    </PageLayout>
  )
}

export default OrganizationRoles
