/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Logo } from '@/assets/Logo'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { RoutePath } from '@/enums/RoutePath'
import { useApi } from '@/hooks/useApi'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

export default function EmailVerify() {
  const { organizationId, email, token } = useParams<{
    organizationId: string
    email: string
    token: string
  }>()
  const navigate = useNavigate()
  const [verificationStatus, setVerificationStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const { onSelectOrganization } = useSelectedOrganization()
  const { billingApi } = useApi()

  useEffect(() => {
    const verifyEmail = async () => {
      if (!organizationId || !email || !token) {
        setVerificationStatus('error')
        setErrorMessage('验证链接无效')
        return
      }

      try {
        await billingApi.verifyOrganizationEmail(organizationId, email, token)
        setVerificationStatus('success')
        onSelectOrganization(organizationId)
        setTimeout(() => {
          navigate(RoutePath.BILLING_WALLET)
        }, 1000)
      } catch (error) {
        setVerificationStatus('error')
        setErrorMessage('验证邮箱时发生错误')
      }
    }

    verifyEmail()
  }, [organizationId, email, token, billingApi, navigate, onSelectOrganization])

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Logo />
          </div>
          {verificationStatus === 'loading' && (
            <>
              <CardTitle>正在验证邮箱</CardTitle>
              <p className="text-muted-foreground">请稍候，正在验证你的邮箱地址...</p>
            </>
          )}
          {verificationStatus === 'success' && (
            <>
              <CardTitle className="text-green-600">邮箱验证成功</CardTitle>
              <p className="text-muted-foreground">
                你的邮箱已验证，即将跳转到钱包页面。
              </p>
            </>
          )}
          {verificationStatus === 'error' && (
            <>
              <CardTitle className="text-red-600">验证失败</CardTitle>
              <p className="text-muted-foreground">{errorMessage}</p>
              <Button onClick={() => navigate(RoutePath.BILLING_WALLET)} className="mt-4">
                前往钱包
              </Button>
            </>
          )}
        </CardHeader>
      </Card>
    </div>
  )
}
