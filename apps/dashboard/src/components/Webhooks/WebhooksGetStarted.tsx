/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { PageContent, PageHeader, PageIntro, PageLayout } from '@/components/PageLayout'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { useInitializeWebhooksMutation } from '@/hooks/mutations/useInitializeWebhooksMutation'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { handleApiError } from '@/lib/error-handling'
import { Webhook } from 'lucide-react'
import { toast } from 'sonner'

export function WebhooksGetStarted() {
  const { selectedOrganization } = useSelectedOrganization()
  const initializeMutation = useInitializeWebhooksMutation()

  const handleEnable = async () => {
    if (!selectedOrganization?.id) {
      return
    }
    try {
      await initializeMutation.mutateAsync(selectedOrganization.id)
      toast.success('Webhook 已启用')
    } catch (error) {
      handleApiError(error, '启用 Webhook 失败')
    }
  }

  return (
    <PageLayout contained>
      <PageHeader />
      <PageContent size="full">
        <PageIntro title="Webhook" />
        <Empty className="border flex-none py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Webhook />
            </EmptyMedia>
            <EmptyTitle>Webhook 尚未启用</EmptyTitle>
            <EmptyDescription>
              在 Sandbox、Snapshot 和卷的状态发生变化时接收实时通知。为此组织启用 Webhook 后，即可创建端点并投递事件。
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={handleEnable} disabled={initializeMutation.isPending}>
              {initializeMutation.isPending && <Spinner />}
              启用 Webhook
            </Button>
          </EmptyContent>
        </Empty>
      </PageContent>
    </PageLayout>
  )
}
