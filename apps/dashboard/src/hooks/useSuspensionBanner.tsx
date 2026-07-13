/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useBanner } from '@/components/Banner'
import { RoutePath } from '@/enums/RoutePath'
import { usePaymentMethodsQuery } from '@/hooks/queries/usePaymentMethodsQuery'
import { Organization } from '@daytona/api-client'
import { addHours, formatDistanceToNow } from 'date-fns'
import { CreditCardIcon, MailIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'

const SUSPENSION_BANNER_ID = 'suspension-banner'

// todo: enumerate reasons
const PAYMENT_METHOD_REQUIRED_REASON = 'Payment method required'
const VERIFY_EMAIL_REASON = 'Please verify your email address'
const CREDITS_DEPLETED_REASON = 'Credits depleted'

function isSetupRequiredSuspension(reason: string) {
  return reason === PAYMENT_METHOD_REQUIRED_REASON || reason === VERIFY_EMAIL_REASON
}

function isCreditsDepletionSuspension(reason: string) {
  return reason === CREDITS_DEPLETED_REASON
}

type Suspension = Pick<
  Organization,
  'id' | 'suspended' | 'suspensionReason' | 'suspendedAt' | 'suspensionCleanupGracePeriodHours'
>

export function useSuspensionBanner(suspension?: Suspension | null) {
  const { addBanner, removeBanner } = useBanner()
  const navigate = useNavigate()
  const location = useLocation()
  const path = location?.pathname
  const previousSuspendedRef = useRef<boolean | undefined>(undefined)
  const paymentMethodsQuery = usePaymentMethodsQuery({
    organizationId: suspension?.id ?? '',
    enabled: suspension?.suspensionReason === PAYMENT_METHOD_REQUIRED_REASON,
  })
  const paymentMethods = paymentMethodsQuery.data
  const hasPaymentMethod = (paymentMethods?.length ?? 0) > 0

  useEffect(() => {
    const wasSuspended = previousSuspendedRef.current
    const isSuspended = suspension?.suspended ?? false

    if (wasSuspended && !isSuspended) {
      removeBanner(SUSPENSION_BANNER_ID)
      previousSuspendedRef.current = isSuspended
      return
    }

    previousSuspendedRef.current = isSuspended

    if (!isSuspended || !suspension?.suspensionReason) {
      return
    }

    const reason = suspension.suspensionReason

    if (isSetupRequiredSuspension(reason)) {
      if (reason === PAYMENT_METHOD_REQUIRED_REASON) {
        if (paymentMethodsQuery.isLoading) {
          removeBanner(SUSPENSION_BANNER_ID)
          return
        }

        if (hasPaymentMethod) {
          addBanner({
            id: SUSPENSION_BANNER_ID,
            variant: 'error',
            title: '额度不足',
            description: '请为钱包充值后继续创建沙箱。',
            icon: <CreditCardIcon className="h-4 w-4 flex-shrink-0 text-current" />,
            action:
              path !== RoutePath.BILLING_WALLET
                ? {
                    label: '前往账单',
                    onClick: () => navigate(RoutePath.BILLING_WALLET),
                  }
                : undefined,
            isDismissible: false,
          })
          return
        }

        addBanner({
          id: SUSPENSION_BANNER_ID,
          variant: 'info',
            title: '需要完成设置',
            description: '添加付款方式后即可开始创建 Sandbox。',
          icon: <CreditCardIcon className="h-4 w-4 flex-shrink-0 text-current" />,
          action:
            path !== RoutePath.BILLING_WALLET
              ? {
                  label: '前往账单',
                  onClick: () => navigate(RoutePath.BILLING_WALLET),
                }
              : undefined,
          isDismissible: false,
        })
      } else if (reason === VERIFY_EMAIL_REASON) {
        addBanner({
          id: SUSPENSION_BANNER_ID,
          variant: 'info',
          title: '需要验证',
          description: '请验证邮箱地址以使用全部功能。',
          icon: <MailIcon className="h-4 w-4 flex-shrink-0 text-current" />,
          isDismissible: false,
        })
      }
      return
    }

    if (isCreditsDepletionSuspension(reason)) {
      const suspendedAtDate = suspension.suspendedAt ? new Date(suspension.suspendedAt) : null
      const cleanupDate = suspendedAtDate
        ? addHours(suspendedAtDate, suspension.suspensionCleanupGracePeriodHours ?? 0)
        : null

      const cleanupDatePassed = cleanupDate !== null && cleanupDate <= new Date()

      const cleanupText = cleanupDate
        ? cleanupDatePassed
          ? 'Sandbox 将被停止'
          : `Sandbox 将在${formatDistanceToNow(cleanupDate, { addSuffix: true })}停止`
        : 'Sandbox 即将被停止'

      addBanner({
        id: SUSPENSION_BANNER_ID,
        variant: 'error',
        title: '额度已用完',
        description: cleanupText,
        action:
          path !== RoutePath.BILLING_WALLET
            ? {
                label: '前往账单',
                onClick: () => navigate(RoutePath.BILLING_WALLET),
              }
            : undefined,
        isDismissible: false,
      })
      return
    }

    const suspendedAtDate = suspension.suspendedAt ? new Date(suspension.suspendedAt) : null
    const cleanupDate = suspendedAtDate
      ? addHours(suspendedAtDate, suspension.suspensionCleanupGracePeriodHours ?? 0)
      : null

    const cleanupDatePassed = cleanupDate !== null && cleanupDate <= new Date()
    const cleanupText = cleanupDate
      ? cleanupDatePassed
        ? 'Sandbox 将被停止'
        : `Sandbox 将在${formatDistanceToNow(cleanupDate, { addSuffix: true })}停止`
      : 'Sandbox 即将被停止'

    addBanner({
      id: SUSPENSION_BANNER_ID,
      variant: 'error',
      title: '组织已暂停',
      description: reason ? `${reason}. ${cleanupText}` : cleanupText,
      isDismissible: false,
    })
  }, [suspension, addBanner, removeBanner, navigate, path, hasPaymentMethod, paymentMethodsQuery.isLoading])
}
