/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { CopyButton } from '@/components/CopyButton'
import { PageContent, PageHeader, PageIntro, PageLayout } from '@/components/PageLayout'
import { TimestampTooltip } from '@/components/TimestampTooltip'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { InputGroup, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Skeleton } from '@/components/ui/skeleton'
import DeliveryStatsLine from '@/components/Webhooks/DeliveryStatsLine'
import { EndpointEventsTable } from '@/components/Webhooks/EndpointEventsTable'
import { UpsertEndpointSheet } from '@/components/Webhooks/UpsertEndpointSheet'
import { WebhookEndpointDetailsSkeleton } from '@/components/Webhooks/WebhookEndpointDetailsSkeleton'
import { RoutePath } from '@/enums/RoutePath'
import { useDeleteWebhookEndpointMutation } from '@/hooks/mutations/useDeleteWebhookEndpointMutation'
import { useReplayWebhookEventMutation } from '@/hooks/mutations/useReplayWebhookEventMutation'
import { useRotateWebhookSecretMutation } from '@/hooks/mutations/useRotateWebhookSecretMutation'
import { useUpdateWebhookEndpointMutation } from '@/hooks/mutations/useUpdateWebhookEndpointMutation'
import { handleApiError } from '@/lib/error-handling'
import { getMaskedToken, getRelativeTimeString } from '@/lib/utils'
import { ArrowLeft, Eye, EyeOff, Loader2, MoreHorizontal, RefreshCcw } from 'lucide-react'
import React, { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { useAttemptedMessages, useEndpoint, useEndpointSecret, useEndpointStats } from 'svix-react'

const WebhookEndpointDetails: React.FC = () => {
  const { endpointId } = useParams<{ endpointId: string }>()
  const navigate = useNavigate()
  const [isSecretRevealed, setIsSecretRevealed] = useState(false)
  const [editSheetOpen, setEditSheetOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [disableDialogOpen, setDisableDialogOpen] = useState(false)
  const [rotateSecretDialogOpen, setRotateSecretDialogOpen] = useState(false)

  const endpoint = useEndpoint(endpointId || '')
  const secret = useEndpointSecret(endpointId || '')
  const messages = useAttemptedMessages(endpointId || '', {})
  const stats = useEndpointStats(endpointId || '')

  const updateMutation = useUpdateWebhookEndpointMutation()
  const deleteMutation = useDeleteWebhookEndpointMutation()
  const rotateSecretMutation = useRotateWebhookSecretMutation()
  const replayMutation = useReplayWebhookEventMutation()

  const isMutating = updateMutation.isPending || deleteMutation.isPending || rotateSecretMutation.isPending

  const isRefreshing = endpoint.loading || secret.loading || messages.loading || stats.loading

  const statsIsLoading = !stats.data && stats.loading
  const statsIsFetching = !!stats.data && stats.loading

  const handleRetry = () => {
    endpoint.reload()
    secret.reload()
    messages.reload()
    stats.reload()
  }

  const handleDisable = async () => {
    if (!endpoint.data) return
    setDisableDialogOpen(false)
    try {
      await updateMutation.mutateAsync({
        endpointId: endpoint.data.id,
        update: { disabled: !endpoint.data.disabled },
      })
      toast.success('端点已更新')
      endpoint.reload()
    } catch (error) {
      handleApiError(error, '更新端点失败')
    }
  }

  const handleDelete = async () => {
    if (!endpoint.data) return
    try {
      await deleteMutation.mutateAsync({ endpointId: endpoint.data.id })
      toast.success('端点已删除')
      setDeleteDialogOpen(false)
      navigate(RoutePath.WEBHOOKS)
    } catch (error) {
      handleApiError(error, '删除端点失败')
    }
  }

  const handleRotateSecret = async () => {
    if (!endpoint.data) return
    try {
      await rotateSecretMutation.mutateAsync({ endpointId: endpoint.data.id })
      toast.success('签名密钥已轮换')
      secret.reload()
      setRotateSecretDialogOpen(false)
    } catch (error) {
      handleApiError(error, '轮换签名密钥失败')
    }
  }

  const handleReplay = async (msgId: string) => {
    if (!endpointId) return
    try {
      await replayMutation.mutateAsync({ endpointId, msgId })
      toast.success('事件已重放')
      messages.reload()
      stats.reload()
    } catch (error) {
      handleApiError(error, '重放事件失败')
    }
  }

  const handleEditSuccess = () => {
    endpoint.reload()
  }

  const endpointData = endpoint.data
  const relativeTime = endpointData ? getRelativeTimeString(endpointData.createdAt).relativeTimeString : null

  return (
    <PageLayout>
      <PageHeader />

      <PageContent className="gap-6">
        <PageIntro title="Webhook" />
        {endpoint.loading ? (
          <WebhookEndpointDetailsSkeleton onBack={() => navigate(RoutePath.WEBHOOKS)} />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Button variant="ghost" size="icon-sm" className="shrink-0" onClick={() => navigate(RoutePath.WEBHOOKS)}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              {endpointData ? (
                <>
                  <h2 className="text-lg font-medium truncate min-w-0">
                    {endpointData.description || '未命名端点'}
                  </h2>
                  <Badge variant={endpointData.disabled ? 'secondary' : 'success'} className="shrink-0">
                    {endpointData.disabled ? '已停用' : '已启用'}
                  </Badge>
                  <span className="text-sm text-muted-foreground shrink-0 hidden sm:inline">•</span>
                  <TimestampTooltip
                    timestamp={
                      typeof endpointData.createdAt === 'string'
                        ? endpointData.createdAt
                        : endpointData.createdAt.toISOString()
                    }
                  >
                    <span className="text-sm text-muted-foreground cursor-default shrink-0 hidden sm:inline">
                      {relativeTime}
                    </span>
                  </TimestampTooltip>
                  <div className="ml-auto flex items-center gap-2 shrink-0">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon-sm" aria-label="打开菜单" disabled={isMutating}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditSheetOpen(true)}>编辑</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDisableDialogOpen(true)}>
                          {endpointData.disabled ? '启用' : '停用'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setRotateSecretDialogOpen(true)}>
                          轮换签名密钥
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button variant="ghost" size="icon-sm" onClick={handleRetry} disabled={isRefreshing}>
                      {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                    </Button>
                  </div>
                </>
              ) : null}
            </div>

            {endpoint.error || !endpointData ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-center">出现错误</CardTitle>
                </CardHeader>
                <CardContent className="flex justify-between items-center flex-col gap-3">
                  <div>加载端点详情时出错。</div>
                  <Button variant="outline" onClick={handleRetry}>
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    重试
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>端点配置</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 flex flex-col gap-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="flex flex-col">
                        <div className="text-muted-foreground text-xs mb-1">URL</div>
                        <InputGroup className="pr-1">
                          <InputGroupInput value={endpointData.url} readOnly className="font-mono text-sm" />
                          <CopyButton value={endpointData.url} size="icon-xs" tooltipText="复制 URL" />
                        </InputGroup>
                      </div>
                      <div className="flex flex-col">
                        <div className="text-muted-foreground text-xs mb-1">签名密钥</div>
                        {secret.loading ? (
                          <Skeleton className="h-9 w-full" />
                        ) : secret.error ? (
                          <span className="text-sm text-muted-foreground">加载失败</span>
                        ) : secret.data ? (
                          <InputGroup className="pr-1">
                            <InputGroupInput
                              value={isSecretRevealed ? secret.data.key : getMaskedToken(secret.data.key)}
                              readOnly
                              className="font-mono text-sm"
                            />
                            <InputGroupButton
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => setIsSecretRevealed(!isSecretRevealed)}
                              title={isSecretRevealed ? '隐藏密钥' : '显示密钥'}
                            >
                              {isSecretRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </InputGroupButton>
                            <CopyButton value={secret.data.key} size="icon-xs" tooltipText="复制签名密钥" />
                          </InputGroup>
                        ) : null}
                      </div>
                    </div>
                    {endpointData.filterTypes && endpointData.filterTypes.length > 0 && (
                      <div>
                        <div className="text-muted-foreground text-xs mb-1">监听事件</div>
                        <div className="flex flex-wrap gap-1.5">
                          {endpointData.filterTypes.map((eventType) => (
                            <Badge key={eventType} variant="secondary" className="font-normal text-xs">
                              {eventType}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>投递统计</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {statsIsLoading ? (
                      <div className="flex flex-col gap-2">
                        <Skeleton className="h-2 w-full rounded-full" />
                        <div className="flex items-center gap-4">
                          <Skeleton className="h-3 w-20" />
                          <Skeleton className="h-3 w-16" />
                          <Skeleton className="h-3 w-18" />
                          <Skeleton className="h-3 w-18" />
                        </div>
                      </div>
                    ) : stats.data ? (
                      <div className={statsIsFetching ? 'opacity-50 transition-opacity' : ''}>
                        <DeliveryStatsLine stats={stats.data} />
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>事件历史</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <EndpointEventsTable
                      data={messages.data || []}
                      loading={messages.loading}
                      onReplay={handleReplay}
                    />
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}
      </PageContent>

      <UpsertEndpointSheet
        mode="edit"
        trigger={null}
        endpoint={endpoint.data || null}
        open={editSheetOpen}
        onOpenChange={setEditSheetOpen}
        onSuccess={handleEditSuccess}
      />

      <AlertDialog open={disableDialogOpen} onOpenChange={setDisableDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{endpoint.data?.disabled ? '启用' : '停用'} Webhook 端点</AlertDialogTitle>
            <AlertDialogDescription>
              确定要{endpoint.data?.disabled ? '启用' : '停用'}此 Webhook 端点吗？
              {endpoint.data?.disabled
                ? ' 该端点将重新开始接收 Webhook 事件。'
                : ' 该端点将停止接收 Webhook 事件。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisable}>
              {endpoint.data?.disabled ? '启用' : '停用'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 Webhook 端点</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除此端点吗？此操作无法撤销，该端点的所有 Webhook 历史记录都将被永久删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? '正在删除...' : '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={rotateSecretDialogOpen} onOpenChange={setRotateSecretDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>轮换签名密钥</AlertDialogTitle>
            <AlertDialogDescription>
              确定要轮换签名密钥吗？当前密钥将失效，你需要使用新密钥更新 Webhook 处理程序。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleRotateSecret} disabled={rotateSecretMutation.isPending}>
              {rotateSecretMutation.isPending ? '正在轮换...' : '轮换密钥'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  )
}

export default WebhookEndpointDetails
