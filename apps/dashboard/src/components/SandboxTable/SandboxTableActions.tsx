/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { SandboxClass, SandboxState } from '@daytona/api-client'
import { Loader2, MoreHorizontal, Play, Square, Terminal, Wrench } from 'lucide-react'
import { useMemo } from 'react'
import TooltipButton from '../TooltipButton'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { SandboxTableActionsProps } from './types'

export function SandboxTableActions({
  sandbox,
  writePermitted,
  deletePermitted,
  isLoading,
  onStart,
  onStop,
  onDelete,
  onArchive,
  onVnc,
  onCreateSshAccess,
  onRevokeSshAccess,
  onCreateSnapshot,
  onRecover,
  onScreenRecordings,
  onFork,
  onViewForks,
  onOpenTerminal,
}: SandboxTableActionsProps) {
  const isVmSandbox = sandbox.sandboxClass === SandboxClass.LINUX_VM || sandbox.sandboxClass === SandboxClass.WINDOWS
  const primaryActionTooltip =
    sandbox.state === SandboxState.STARTING
      ? '正在启动 Sandbox'
      : sandbox.state === SandboxState.STOPPING
        ? '正在停止 Sandbox'
        : sandbox.state === SandboxState.STARTED
          ? '停止 Sandbox'
          : sandbox.state === SandboxState.ERROR && sandbox.recoverable
            ? '恢复 Sandbox'
            : '启动 Sandbox'

  const menuItems = useMemo(() => {
    const items = []

    if (writePermitted) {
      if (sandbox.state === SandboxState.STARTED) {
        items.push({
          key: 'stop',
          label: '停止',
          onClick: () => onStop(sandbox.id),
          disabled: isLoading,
        })
      } else if (sandbox.state === SandboxState.STOPPED || sandbox.state === SandboxState.ARCHIVED) {
        items.push({
          key: 'start',
          label: '启动',
          onClick: () => onStart(sandbox.id),
          disabled: isLoading,
        })
      } else if (sandbox.state === SandboxState.ERROR && sandbox.recoverable) {
        items.push({
          key: 'recover',
          label: '恢复',
          onClick: () => onRecover(sandbox.id),
          disabled: isLoading,
        })
      }

      if (sandbox.state === SandboxState.STOPPED) {
        items.push({
          key: 'archive',
          label: '归档',
          onClick: () => onArchive(sandbox.id),
          disabled: isLoading,
        })
      }

      if (items.length > 0) {
        items.push({ key: 'lifecycle-separator', type: 'separator' })
      }

      if (sandbox.state === SandboxState.STARTED) {
        items.push({
          key: 'vnc',
          label: 'VNC',
          onClick: () => onVnc(sandbox.id),
          disabled: isLoading,
        })
        items.push({
          key: 'screen-recordings',
          label: '屏幕录像',
          onClick: () => onScreenRecordings(sandbox.id),
          disabled: isLoading,
        })
      }

      if (sandbox.gpu === 0 && (sandbox.state === SandboxState.STARTED || sandbox.state === SandboxState.STOPPED)) {
        items.push({
          key: 'create-snapshot',
          label: '创建 Snapshot',
          onClick: () => onCreateSnapshot?.(),
          disabled: isLoading,
        })
      }

      if (isVmSandbox && sandbox.state === SandboxState.STARTED) {
        items.push({
          key: 'fork',
          label: '创建 Fork',
          onClick: () => onFork?.(),
          disabled: isLoading,
        })
      }

      // Add SSH access options
      items.push({
        key: 'create-ssh',
        label: '创建 SSH 访问',
        onClick: () => onCreateSshAccess(sandbox.id),
        disabled: isLoading,
      })
      items.push({
        key: 'revoke-ssh',
        label: '撤销 SSH 访问',
        onClick: () => onRevokeSshAccess(sandbox.id),
        disabled: isLoading,
      })
    }

    // Viewing the fork tree is read-only, so it's available regardless of write permission.
    if (isVmSandbox) {
      items.push({
        key: 'view-forks',
        label: '查看 Fork 树',
        onClick: () => onViewForks?.(),
        disabled: isLoading,
      })
    }

    if (deletePermitted) {
      if (items.length > 0) {
        items.push({ key: 'delete-separator', type: 'separator' })
      }

      items.push({
        key: 'delete',
        label: '删除',
        onClick: () => onDelete(sandbox.id),
        disabled: isLoading,
        className: 'text-red-600 dark:text-red-400',
      })
    }

    return items
  }, [
    writePermitted,
    deletePermitted,
    sandbox.state,
    sandbox.id,
    isLoading,
    sandbox.recoverable,
    onStart,
    onStop,
    onDelete,
    onArchive,
    onVnc,
    onCreateSshAccess,
    onRevokeSshAccess,
    onCreateSnapshot,
    onRecover,
    onScreenRecordings,
    onFork,
    onViewForks,
    isVmSandbox,
  ])

  if (menuItems.length === 0) {
    return null
  }

  // The primary start/stop/recover and terminal controls are write actions; hide them from
  // users who can only view (e.g. read-only users reaching the read-only "View Fork Tree").
  const showWriteControls = writePermitted || deletePermitted

  return (
    <div className="flex items-center justify-end gap-2">
      {showWriteControls && (
        <>
          <TooltipButton
            variant="ghost"
            size="icon-sm"
            tooltipText={primaryActionTooltip}
            aria-label={primaryActionTooltip}
            onClick={(e) => {
              e.stopPropagation()
              if (sandbox.state === SandboxState.STARTED) {
                onStop(sandbox.id)
              } else if (sandbox.state === SandboxState.ERROR && sandbox.recoverable) {
                onRecover(sandbox.id)
              } else {
                onStart(sandbox.id)
              }
            }}
            disabled={isLoading}
          >
            {sandbox.state === SandboxState.STARTED ? (
              <Square className="w-4 h-4" />
            ) : sandbox.state === SandboxState.STOPPING || sandbox.state === SandboxState.STARTING ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : sandbox.state === SandboxState.ERROR && sandbox.recoverable ? (
              <Wrench className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </TooltipButton>

          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="打开终端"
            onClick={(e) => {
              e.stopPropagation()
              onOpenTerminal?.()
            }}
            disabled={isLoading}
          >
            <Terminal className="w-4 h-4" />
          </Button>
        </>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="打开菜单">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {menuItems.map((item) => {
            if (item.type === 'separator') {
              return <DropdownMenuSeparator key={item.key} />
            }

            return (
              <DropdownMenuItem
                key={item.key}
                onClick={(e) => {
                  e.stopPropagation()
                  item.onClick?.()
                }}
                className={`cursor-pointer ${item.className || ''}`}
                disabled={item.disabled}
              >
                {item.label}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
