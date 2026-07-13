/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useBillingInfoQuery } from '@/hooks/queries/useBillingInfoQuery'
import { useOrganizationBillingPortalUrlQuery } from '@/hooks/queries/useOrganizationBillingPortalUrlQuery'
import { BillingAddress, BillingInfo } from '@daytona/billing-api-client'
import { PencilIcon } from 'lucide-react'

interface BillingInfoCardProps {
  organizationId: string
}

export function BillingInfoCard({ organizationId }: BillingInfoCardProps) {
  const billingInfoQuery = useBillingInfoQuery({ organizationId })
  const portalUrlQuery = useOrganizationBillingPortalUrlQuery({ organizationId })
  const billingInfo = billingInfoQuery.data
  const portalUrl = portalUrlQuery.data

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="flex flex-col gap-1.5">
          <CardTitle>账单信息</CardTitle>
          <CardDescription>用于发票和付款收据的联系人及地址。</CardDescription>
        </div>
        {portalUrl ? (
          <Button variant="secondary" size="sm" asChild>
            <a href={portalUrl} target="_blank" rel="noopener noreferrer">
              <PencilIcon />
              编辑
            </a>
          </Button>
        ) : (
          <Button variant="secondary" size="sm" disabled>
            <PencilIcon />
            编辑
          </Button>
        )}
      </CardHeader>

      <CardContent>
        {billingInfoQuery.isLoading ? (
          <BillingInfoSkeleton />
        ) : billingInfo ? (
          <BillingInfoDetails billingInfo={billingInfo} />
        ) : (
          <p className="text-sm text-muted-foreground">尚未填写账单信息。点击“编辑”进行添加。</p>
        )}
      </CardContent>
    </Card>
  )
}

function BillingInfoDetails({ billingInfo }: { billingInfo: BillingInfo }) {
  const hasContact = billingInfo.name || billingInfo.email || billingInfo.phone
  const formattedAddress = formatAddress(billingInfo.address)

  if (!hasContact && !formattedAddress) {
    return <p className="text-sm text-muted-foreground">尚未填写账单信息。点击“编辑”进行添加。</p>
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      <InfoField label="名称" value={billingInfo.name} />
      <InfoField label="邮箱" value={billingInfo.email} />
      <InfoField label="电话" value={billingInfo.phone} />
      <InfoField label="地址" value={formattedAddress} />
    </div>
  )
}

function InfoField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground whitespace-pre-line">
        {value || <span className="text-muted-foreground">—</span>}
      </div>
    </div>
  )
}

function formatAddress(address?: BillingAddress): string {
  if (!address) return ''
  const lines = [
    address.line1,
    address.line2,
    [address.city, address.state, address.postalCode].filter(Boolean).join(', '),
    address.country,
  ].filter((v): v is string => Boolean(v && v.trim()))
  return lines.join('\n')
}

function BillingInfoSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-48" />
        </div>
      ))}
    </div>
  )
}
