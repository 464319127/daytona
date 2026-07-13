/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { CopyButton } from '@/components/CopyButton'
import { ResourceChip } from '@/components/ResourceChip'
import { TimestampTooltip } from '@/components/TimestampTooltip'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getSnapshotQueryErrorStatus, useSnapshotQuery } from '@/hooks/queries/useSnapshotsQuery'
import { getGpuTypeLabel } from '@/lib/gpu-types'
import { cn, getRelativeTimeString, truncateUUID } from '@/lib/utils'
import { SnapshotDto, SnapshotState } from '@daytona/api-client'
import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import { ChevronDown, ChevronUp, CircleAlert, Pause, Play, Trash2, X } from 'lucide-react'
import React, { Ref, useImperativeHandle, useState } from 'react'

export interface SnapshotSheetRef {
  open: () => void
  close: () => void
}

export interface SnapshotSheetProps {
  ref?: Ref<SnapshotSheetRef>
  snapshotId?: string | null
  onOpenChange: (open: boolean) => void
  getRegionName: (regionId: string) => string | undefined
  onNavigate: (direction: 'prev' | 'next') => void
  hasPrev: boolean
  hasNext: boolean
  actionsDisabled?: boolean
  writePermitted: boolean
  deletePermitted: boolean
  onActivate: (snapshot: SnapshotDto) => void
  onDeactivate: (snapshot: SnapshotDto) => void
  onDelete: (snapshot: SnapshotDto) => void
}

function InfoSection({
  title,
  children,
  className,
}: {
  title?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('px-5 py-4 border-b border-border last:border-b-0', className)}>
      {title && <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{title}</div>}
      {children}
    </div>
  )
}

function InfoRow({
  label,
  children,
  className,
}: {
  label: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3 py-1', className)}>
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <div className="min-w-0 text-sm text-right">{children}</div>
    </div>
  )
}

function CopyValue({
  value,
  displayValue = value,
  tooltipText = '复制',
  className,
}: {
  value: string
  displayValue?: string
  tooltipText?: string
  className?: string
}) {
  return (
    <div className="flex items-center gap-1 min-w-0">
      <span className={cn('truncate', className)}>{displayValue}</span>
      <CopyButton value={value} tooltipText={tooltipText} size="icon-xs" />
    </div>
  )
}

function EmptyValue() {
  return <span className="text-muted-foreground">-</span>
}

function formatSnapshotSize(size: number | null | undefined) {
  if (size == null || !Number.isFinite(size)) {
    return null
  }

  return `${size.toFixed(2)} GB`
}

function getStateBadgeVariant(state: SnapshotState): BadgeProps['variant'] {
  switch (state) {
    case SnapshotState.ACTIVE:
      return 'success'
    case SnapshotState.ERROR:
    case SnapshotState.BUILD_FAILED:
      return 'destructive'
    default:
      return 'secondary'
  }
}

function getStateLabel(state: SnapshotState) {
  if (state === SnapshotState.REMOVING) {
    return '正在删除'
  }

  return String(state)
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function SnapshotStateBadge({ snapshot }: { snapshot: SnapshotDto }) {
  return <Badge variant={getStateBadgeVariant(snapshot.state)}>{getStateLabel(snapshot.state)}</Badge>
}

function TimestampRow({ label, value }: { label: string; value: Date | null | undefined }) {
  if (!value) {
    return (
      <InfoRow label={label}>
        <span className="text-muted-foreground">-</span>
      </InfoRow>
    )
  }

  const timestamp = getRelativeTimeString(value)

  return (
    <InfoRow label={label}>
      <TimestampTooltip timestamp={value.toString()}>{timestamp.relativeTimeString}</TimestampTooltip>
    </InfoRow>
  )
}

function SnapshotSheetSkeleton() {
  const overviewRows = ['name', 'id', 'image', 'size', 'entrypoint', 'state']
  const timestampRows = ['created', 'updated', 'last-used']

  return (
    <>
      <InfoSection>
        {overviewRows.map((row) => (
          <div key={row} className="flex items-center justify-between gap-3 py-1">
            <Skeleton className="h-4 w-20 shrink-0" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </InfoSection>
      <InfoSection title="资源">
        <div className="flex flex-wrap gap-2 py-1">
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-7 w-16" />
        </div>
      </InfoSection>
      <InfoSection title="区域">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-20" />
        </div>
      </InfoSection>
      <InfoSection title="时间信息">
        {timestampRows.map((row) => (
          <div key={row} className="flex items-center justify-between gap-3 py-1">
            <Skeleton className="h-4 w-20 shrink-0" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </InfoSection>
    </>
  )
}

function SnapshotSheetEmptyState({ error }: { error: boolean }) {
  const Icon = error ? CircleAlert : MagnifyingGlassIcon

  return (
    <Empty variant={error ? 'destructive' : 'neutral'} className="min-h-64 border-0 bg-transparent px-5 py-6">
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className={cn('[&_svg]:size-4', {
            'bg-destructive-background text-destructive': error,
          })}
        >
          <Icon className="size-4" />
        </EmptyMedia>
        <EmptyTitle>{error ? '加载 Snapshot 失败' : '未找到 Snapshot'}</EmptyTitle>
        <EmptyDescription>
          {error
            ? '获取此 Snapshot 时出现错误。'
            : '此 Snapshot 可能已被删除，或你没有访问权限。'}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

export function SnapshotSheet({
  ref,
  snapshotId,
  onOpenChange,
  getRegionName,
  onNavigate,
  hasPrev,
  hasNext,
  actionsDisabled = false,
  writePermitted,
  deletePermitted,
  onActivate,
  onDeactivate,
  onDelete,
}: SnapshotSheetProps) {
  const [open, setOpen] = useState(false)

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    onOpenChange(isOpen)
  }

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    close: () => setOpen(false),
  }))

  const {
    data: fetchedSnapshot,
    isLoading: snapshotIsLoading,
    isFetching: snapshotIsFetching,
    isError: snapshotIsError,
    error: snapshotError,
  } = useSnapshotQuery(snapshotId, {
    enabled: open && !!snapshotId,
  })

  const activeSnapshot = fetchedSnapshot
  const loadingSnapshot = !activeSnapshot && (snapshotIsLoading || snapshotIsFetching)
  const snapshotNotFound = snapshotIsError && getSnapshotQueryErrorStatus(snapshotError) === 404
  const regionNames = activeSnapshot?.regionIds?.map((id) => getRegionName(id) ?? id) ?? []
  const showActions = !!activeSnapshot && !activeSnapshot.general && (writePermitted || deletePermitted)
  const showActivate = !!activeSnapshot && writePermitted && activeSnapshot.state === SnapshotState.INACTIVE
  const showDeactivate = !!activeSnapshot && writePermitted && activeSnapshot.state === SnapshotState.ACTIVE
  const showDelete = !!activeSnapshot && deletePermitted && activeSnapshot.state !== SnapshotState.REMOVING

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-dvw p-0 flex flex-col gap-0 sm:w-[450px] [&>button]:hidden"
      >
        <SheetHeader className="flex flex-row items-center justify-between p-4 px-5 space-y-0">
          <div className="min-w-0">
            <SheetTitle>快照详情</SheetTitle>
          </div>
          <div className="flex items-center justify-end shrink-0">
            <Button variant="ghost" size="icon-sm" disabled={!hasPrev} onClick={() => onNavigate('prev')}>
              <ChevronUp className="size-4" />
              <span className="sr-only">上一个快照</span>
            </Button>
            <Button variant="ghost" size="icon-sm" disabled={!hasNext} onClick={() => onNavigate('next')}>
              <ChevronDown className="size-4" />
              <span className="sr-only">下一个快照</span>
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => handleOpenChange(false)}>
              <X className="size-4" />
              <span className="sr-only">关闭</span>
            </Button>
          </div>
        </SheetHeader>

        <Separator />

        <ScrollArea fade="mask" className="min-h-0 flex-1">
          {loadingSnapshot ? (
            <SnapshotSheetSkeleton />
          ) : !activeSnapshot ? (
            <SnapshotSheetEmptyState error={snapshotIsError && !snapshotNotFound} />
          ) : (
            <>
              <InfoSection>
                <InfoRow label="名称" className="-mr-2">
                  <CopyValue value={activeSnapshot.name} tooltipText="复制名称" />
                </InfoRow>
                <InfoRow label="ID" className="-mr-2">
                  <CopyValue
                    value={activeSnapshot.id}
                    displayValue={truncateUUID(activeSnapshot.id)}
                    tooltipText="复制 ID"
                    className="font-mono text-muted-foreground"
                  />
                </InfoRow>
                <InfoRow label="镜像" className="-mr-2">
                  {activeSnapshot.imageName ? (
                    <CopyValue value={activeSnapshot.imageName} tooltipText="复制镜像" className="font-mono" />
                  ) : activeSnapshot.buildInfo ? (
                    <Badge variant="secondary" className="rounded-sm px-1 font-medium">
                      DECLARATIVE BUILD
                    </Badge>
                  ) : (
                    <EmptyValue />
                  )}
                </InfoRow>
                <InfoRow label="大小">{formatSnapshotSize(activeSnapshot.size) ?? <EmptyValue />}</InfoRow>
                {activeSnapshot.entrypoint?.length ? (
                  <InfoRow label="入口点" className="items-start -mr-2">
                    <CopyValue
                      value={activeSnapshot.entrypoint.join(' ')}
                      tooltipText="复制入口点"
                      className="font-mono"
                    />
                  </InfoRow>
                ) : null}
                <InfoRow label="状态">
                  <SnapshotStateBadge snapshot={activeSnapshot} />
                </InfoRow>
                {activeSnapshot.general && (
                  <InfoRow label="类型">
                    <Badge variant="secondary">跟随系统</Badge>
                  </InfoRow>
                )}
                {showActions && (
                  <div className="flex items-center justify-end pt-3">
                    <ButtonGroup>
                      {showActivate && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={actionsDisabled}
                          onClick={() => onActivate(activeSnapshot)}
                        >
                          <Play className="size-4" />
                          启用
                        </Button>
                      )}
                      {showDeactivate && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={actionsDisabled}
                          onClick={() => onDeactivate(activeSnapshot)}
                        >
                          <Pause className="size-4" />
                          停用
                        </Button>
                      )}
                      {showDelete && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon-sm"
                              disabled={actionsDisabled}
                              onClick={() => onDelete(activeSnapshot)}
                              aria-label="删除快照"
                              className="text-destructive-foreground hover:bg-destructive/10 hover:text-destructive-foreground"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>删除</TooltipContent>
                        </Tooltip>
                      )}
                    </ButtonGroup>
                  </div>
                )}
              </InfoSection>

              {activeSnapshot.errorReason && (
                <InfoSection title="错误">
                  <p className="text-sm text-destructive-foreground break-words">{activeSnapshot.errorReason}</p>
                </InfoSection>
              )}

              <InfoSection title="资源">
                <div className="flex flex-wrap gap-2 py-1">
                  <ResourceChip resource="cpu" value={activeSnapshot.cpu} />
                  <ResourceChip resource="memory" value={activeSnapshot.mem} />
                  <ResourceChip resource="disk" value={activeSnapshot.disk} />
                  {activeSnapshot.gpu > 0 &&
                    (() => {
                      const gpuTypeLabel = getGpuTypeLabel(activeSnapshot.gpuType)
                      return (
                        <ResourceChip
                          resource="gpu"
                          value={activeSnapshot.gpu}
                          unit={gpuTypeLabel ? `GPU · ${gpuTypeLabel}` : undefined}
                        />
                      )
                    })()}
                </div>
              </InfoSection>

              <InfoSection title="区域">
                {regionNames.length ? (
                  <div className="flex flex-wrap gap-2">
                    {regionNames.map((regionName) => (
                      <Badge key={regionName} variant="secondary">
                        {regionName}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">-</span>
                )}
              </InfoSection>

              {activeSnapshot.buildInfo && (
                <InfoSection title="构建">
                  <TimestampRow label="创建时间" value={activeSnapshot.buildInfo.createdAt} />
                  <TimestampRow label="更新时间" value={activeSnapshot.buildInfo.updatedAt} />
                  {!!activeSnapshot.buildInfo.contextHashes?.length && (
                    <InfoRow label="上下文哈希" className="items-start -mr-2">
                      <div className="flex min-w-0 flex-col items-end gap-1">
                        {activeSnapshot.buildInfo.contextHashes.map((hash) => (
                          <CopyValue key={hash} value={hash} tooltipText="复制哈希" className="font-mono" />
                        ))}
                      </div>
                    </InfoRow>
                  )}
                  {activeSnapshot.buildInfo.dockerfileContent && (
                    <div className="mt-3">
                      <div className="mb-1 text-sm text-muted-foreground">Dockerfile</div>
                      <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-left text-xs">
                        <code>{activeSnapshot.buildInfo.dockerfileContent}</code>
                      </pre>
                    </div>
                  )}
                </InfoSection>
              )}

              <InfoSection title="时间信息">
                <TimestampRow label="创建时间" value={activeSnapshot.createdAt} />
                <TimestampRow label="更新时间" value={activeSnapshot.updatedAt} />
                <TimestampRow label="上次使用" value={activeSnapshot.lastUsedAt} />
              </InfoSection>
            </>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
