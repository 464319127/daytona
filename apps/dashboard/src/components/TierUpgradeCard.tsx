/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { RoutePath } from '@/enums/RoutePath'
import { useDowngradeTierMutation } from '@/hooks/mutations/useDowngradeTierMutation'
import { useUpgradeTierMutation } from '@/hooks/mutations/useUpgradeTierMutation'
import { handleApiError } from '@/lib/error-handling'
import { cn } from '@/lib/utils'
import { Organization } from '@daytona/api-client/src'
import { OrganizationTier, Tier } from '@daytona/billing-api-client'
import { CheckIcon, ExternalLinkIcon, Loader2 } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

interface Props {
  tiers: Tier[]
  organizationTier?: OrganizationTier | null
  organization: Organization
  requirementsState: {
    emailVerified: boolean
    creditCardLinked: boolean
  }
}

export function TierUpgradeCard({ tiers, organizationTier, requirementsState, organization }: Props) {
  const { currentTier, previousTier, nextTier } = useMemo(() => {
    const targetTiers: { currentTier?: Tier; previousTier?: Tier; nextTier?: Tier } = {}
    for (const tier of tiers) {
      const tierNumber = tier.tier ?? 0
      if (tierNumber === organizationTier?.tier) {
        targetTiers.currentTier = tier
      }
      if (tierNumber < (organizationTier?.tier ?? 0)) {
        targetTiers.previousTier = tier
      }
      if (tierNumber > (organizationTier?.tier ?? 0) && !targetTiers.nextTier) {
        targetTiers.nextTier = tier
      }
    }
    return targetTiers
  }, [tiers, organizationTier])

  const requirements = getTierRequirementItems(requirementsState, organizationTier, nextTier)

  const canUpgrade = requirements.length > 0 && requirements.every((requirement) => requirement.isChecked)

  const downgradeTier = useDowngradeTierMutation()
  const upgradeTier = useUpgradeTierMutation()

  const handleUpgradeTier = async (tier: number) => {
    if (!organization) {
      return
    }

    try {
      await upgradeTier.mutateAsync({ organizationId: organization.id, tier })
      toast.success('等级升级成功')
    } catch (error) {
      handleApiError(error, '升级组织等级失败')
    }
  }

  const handleDowngradeTier = async (tier: number) => {
    if (!organization) {
      return
    }

    try {
      await downgradeTier.mutateAsync({ organizationId: organization.id, tier })
      toast.success('等级降级成功')
    } catch (error) {
      handleApiError(error, '降低组织等级失败')
    }
  }

  return (
    <Card>
      <CardContent className="p-0">
        {nextTier && (
          <div className="grid sm:grid-cols-2 grid-cols-1">
            <div className="p-4 flex flex-col gap-1">
              <div className="text-lg font-medium">升级到等级 {nextTier?.tier}</div>
              <div className="text-muted-foreground text-sm">
                完成验证步骤，解锁更多资源和更高的速率限制。
              </div>
            </div>
            <div className="sm:border-l border-border p-4 flex flex-col gap-2">
              <div className="text-xs text-muted-foreground">要求</div>
              <ul>
                {requirements.map((requirement) => (
                  <li key={requirement.label}>
                    <TierRequirementItem
                      checked={requirement.isChecked}
                      label={requirement.label}
                      link={requirement.link}
                    />
                  </li>
                ))}
              </ul>
              {requirements.length > 0 && !canUpgrade && (
                <div className="text-xs text-muted-foreground">请完成所有要求后再升级。</div>
              )}
              <Button
                className="w-full mt-4"
                onClick={() => handleUpgradeTier(nextTier.tier ?? 0)}
                disabled={!canUpgrade || upgradeTier.isPending}
              >
                {upgradeTier.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                升级
              </Button>
            </div>
          </div>
        )}
        <div className="p-4 border-t border-border flex items-center justify-between gap-2">
          <div className="flex flex-col gap-1 text-sm">
            <div className="font-medium">企业版</div>
            <div className="text-muted-foreground">
              请通过以下邮箱联系销售团队：{' '}
              <a href="mailto:sales@daytona.io" className="hover:text-foreground underline">
                sales@daytona.io
              </a>
              .
            </div>
          </div>

          <Button variant={organizationTier?.tier && organizationTier.tier > 2 ? 'default' : 'secondary'} asChild>
            <a href="mailto:sales@daytona.io?subject=Custom%20Tier%20Inquiry&body=Hi%20Daytona%20Team%2C%0A%0AI%27m%20interested%20in%20a%20custom%20plan%20and%20would%20like%20to%20learn%20more%20about%20your%20options.%0A%0AHere%27s%20some%20context%3A%0A%0A-%20Your%20use%20case%3A%20%0A-%20Current%20technology%3A%20%0A-%20Requirements%3A%20%0A-%20Typical%20sandbox%20size%3A%20%0A-%20Peak%20concurrent%20sandboxes%3A%20%0A%0AThanks.">
              联系销售团队
            </a>
          </Button>
        </div>
        {organizationTier && (
          <div className="border-t border-border p-4 flex items-center justify-between gap-2">
            <div className="flex flex-col gap-1 text-sm">
              <div className="font-medium">当前等级：{organizationTier?.tier}</div>
              <div className="text-muted-foreground empty:hidden flex flex-col">
                {organizationTier.expiresAt && (
                  <div>
                    等级将于{' '}
                    {new Date(organizationTier.expiresAt).toLocaleDateString('zh-CN', {
                      month: 'short',
                      day: 'numeric',
                    })}
                    到期。
                  </div>
                )}
                {currentTier && (currentTier.topUpIntervalDays ?? 0) > 0 && (
                  <div>
                    每 {currentTier.topUpIntervalDays} 天自动扣款{' '}
                    {getDollarAmount(currentTier.minTopUpAmountCents ?? 0)}。
                  </div>
                )}
              </div>
            </div>
            {previousTier && (
              <Button
                variant="outline"
                onClick={() => handleDowngradeTier(previousTier.tier ?? 0)}
                disabled={downgradeTier.isPending}
              >
                {downgradeTier.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                降级
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function getDollarAmount(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function checkTopUpRequirementStatus(currentTier: OrganizationTier, nextTier: Tier) {
  if (!currentTier) {
    return false
  }

  if ((currentTier.largestSuccessfulPaymentCents ?? 0) < (nextTier.minTopUpAmountCents ?? 0)) {
    return false
  }

  if (nextTier.topUpIntervalDays && currentTier.largestSuccessfulPaymentDate) {
    const lastPaymentTime = new Date(currentTier.largestSuccessfulPaymentDate).getTime() || 0
    const diffTime = Math.abs(Date.now() - lastPaymentTime)
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    return diffDays < nextTier.topUpIntervalDays
  }

  return true
}

function getTierRequirementItems(
  requirementsState: {
    emailVerified: boolean
    creditCardLinked: boolean
  },
  currentTier?: OrganizationTier | null,
  tier?: Tier | null,
) {
  if (!tier || !currentTier) {
    return []
  }
  const tierNumber = tier.tier ?? 0
  if (tierNumber < 1 || tierNumber > 4) {
    return []
  }

  const items = []

  if (tierNumber === 1) {
    items.push({
      label: '验证邮箱',
      isChecked: requirementsState.emailVerified,
      link: RoutePath.ACCOUNT_SETTINGS,
    })
  }
  if (tierNumber === 2) {
    items.push({
      label: '已关联信用卡',
      isChecked: requirementsState.creditCardLinked,
      link: RoutePath.BILLING_WALLET,
    })
  }

  if (tier.minTopUpAmountCents) {
    items.push({
      label: `充值 ${getDollarAmount(tier.minTopUpAmountCents)}（${
        tier.topUpIntervalDays ? `每 ${tier.topUpIntervalDays} 天` : '一次性'
      }）`,
      isChecked: checkTopUpRequirementStatus(currentTier, tier),
      link: RoutePath.BILLING_WALLET,
    })
  }

  return items
}

interface TierRequirementItemProps {
  checked: boolean
  label: string
  link?: string
  externalLink?: boolean
}

function RequirementIcon({ checked, label }: { checked: boolean; label: string }) {
  return (
    <div
      className={cn(
        'flex-shrink-0 w-3.5 h-3.5 rounded-full flex items-center justify-center border border-muted-foreground/50',
        {
          'bg-muted/50 text-foreground': checked,
          'text-transparent': !checked,
        },
      )}
    >
      <CheckIcon size={10} aria-label={label} />
    </div>
  )
}

function TierRequirementItem({ checked, label, link, externalLink }: TierRequirementItemProps) {
  const content = (
    <span className="flex items-center gap-2 text-sm">
      <RequirementIcon checked={checked} label={label} />
      <span
        className={cn({
          'text-muted-foreground line-through': checked,
          'text-foreground': !checked,
          'hover:underline': !checked && link,
        })}
      >
        {label}
      </span>
      {!checked && externalLink && (
        <ExternalLinkIcon size={16} className="inline align-text-bottom" aria-label={label} />
      )}
    </span>
  )

  if (!checked && link) {
    return (
      <div
        className={cn({
          'text-foreground': checked,
          'text-muted-foreground': !checked,
          'hover:underline': !checked && link,
        })}
      >
        <Link to={link}>{content}</Link>
      </div>
    )
  }

  return <div className={cn(checked ? 'text-foreground' : 'text-muted-foreground')}>{content}</div>
}
