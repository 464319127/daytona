/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { VolumeDto, VolumeState } from '@daytona/api-client'
import { CheckSquare2Icon, MinusSquareIcon, PlusIcon, TrashIcon } from 'lucide-react'
import { useMemo } from 'react'
import { CommandConfig, useRegisterCommands } from '../CommandPalette'

export function isVolumeDeletable(volume: VolumeDto) {
  return (
    volume.state !== VolumeState.PENDING_DELETE &&
    volume.state !== VolumeState.DELETING &&
    volume.state !== VolumeState.DELETED
  )
}

export function getVolumeBulkActionCounts(volumes: VolumeDto[]) {
  return {
    deletable: volumes.filter(isVolumeDeletable).length,
  }
}

interface UseVolumeCommandsProps {
  writePermitted: boolean
  deletePermitted: boolean
  selectedCount: number
  selectableCount: number
  toggleAllRowsSelected: (selected: boolean) => void
  bulkActionCounts: {
    deletable: number
  }
  onDelete: () => void
  onCreateVolume?: () => void
}

export function useVolumeCommands({
  writePermitted,
  deletePermitted,
  selectedCount,
  selectableCount,
  toggleAllRowsSelected,
  bulkActionCounts,
  onDelete,
  onCreateVolume,
}: UseVolumeCommandsProps) {
  const rootCommands: CommandConfig[] = useMemo(() => {
    const commands: CommandConfig[] = []

    if (writePermitted && onCreateVolume) {
      commands.push({
        id: 'create-volume',
        label: '创建卷',
        icon: <PlusIcon className="w-4 h-4" />,
        onSelect: onCreateVolume,
      })
    }

    if (selectableCount !== selectedCount) {
      commands.push({
        id: 'select-all-volumes',
        label: '选择全部卷',
        icon: <CheckSquare2Icon className="w-4 h-4" />,
        onSelect: () => toggleAllRowsSelected(true),
        chainable: true,
      })
    }

    if (selectedCount > 0) {
      commands.push({
        id: 'deselect-all-volumes',
        label: '取消选择全部卷',
        icon: <MinusSquareIcon className="w-4 h-4" />,
        onSelect: () => toggleAllRowsSelected(false),
        chainable: true,
      })
    }

    if (deletePermitted && bulkActionCounts.deletable > 0) {
      commands.push({
        id: 'delete-volumes',
        label: `删除 ${bulkActionCounts.deletable} 个卷`,
        icon: <TrashIcon className="w-4 h-4" />,
        onSelect: onDelete,
      })
    }

    return commands
  }, [
    writePermitted,
    deletePermitted,
    selectedCount,
    selectableCount,
    toggleAllRowsSelected,
    bulkActionCounts,
    onDelete,
    onCreateVolume,
  ])

  useRegisterCommands(rootCommands, { groupId: 'volume-actions', groupLabel: '卷操作', groupOrder: 0 })
}
