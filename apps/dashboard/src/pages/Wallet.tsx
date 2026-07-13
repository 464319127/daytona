/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { BillingInfoCard } from '@/components/BillingInfoCard'
import { ChargesTable } from '@/components/Charges'
import { InvoicesTable } from '@/components/Invoices'
import { PageContent, PageHeader, PageIntro, PageLayout } from '@/components/PageLayout'
import { PaymentMethodsCard } from '@/components/PaymentMethodsCard'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useCreateInvoicePaymentUrlMutation } from '@/hooks/mutations/useCreateInvoicePaymentUrlMutation'
import { useRedeemCouponMutation } from '@/hooks/mutations/useRedeemCouponMutation'
import { useSetAutomaticTopUpMutation } from '@/hooks/mutations/useSetAutomaticTopUpMutation'
import { useTopUpWalletMutation } from '@/hooks/mutations/useTopUpWalletMutation'
import { useOwnerInvoicesQuery, useOwnerWalletQuery } from '@/hooks/queries/billingQueries'
import { useChargesQuery } from '@/hooks/queries/useChargesQuery'
import { usePaymentMethodsQuery } from '@/hooks/queries/usePaymentMethodsQuery'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { formatAmount } from '@/lib/utils'
import { AutomaticTopUp, BillingType, Invoice } from '@daytona/billing-api-client'
import { CreditCardIcon, InfoIcon, SparklesIcon, TriangleAlertIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { NumericFormat } from 'react-number-format'
import { useAuth } from 'react-oidc-context'
import { toast } from 'sonner'

const DEFAULT_PAGE_SIZE = 10

const Wallet = () => {
  const { selectedOrganization } = useSelectedOrganization()
  const { user } = useAuth()
  const [automaticTopUp, setAutomaticTopUp] = useState<AutomaticTopUp | undefined>(undefined)
  const [couponCode, setCouponCode] = useState<string>('')
  const [redeemCouponError, setRedeemCouponError] = useState<string | null>(null)
  const [redeemCouponSuccess, setRedeemCouponSuccess] = useState<string | null>(null)
  const [oneTimeTopUpAmount, setOneTimeTopUpAmount] = useState<number | undefined>(undefined)
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)
  const [invoicesPagination, setInvoicesPagination] = useState({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  })
  const walletQuery = useOwnerWalletQuery({ refetchOnMount: 'always' })
  const invoicesQuery = useOwnerInvoicesQuery(invoicesPagination.pageIndex + 1, invoicesPagination.pageSize)
  const chargesQuery = useChargesQuery({
    organizationId: selectedOrganization?.id ?? '',
    enabled: Boolean(selectedOrganization),
  })
  const paymentMethodsQuery = usePaymentMethodsQuery({
    organizationId: selectedOrganization?.id ?? '',
    enabled: Boolean(selectedOrganization),
  })

  const wallet = walletQuery.data
  const paymentMethods = paymentMethodsQuery.data
  const paymentMethodsLoading = paymentMethodsQuery.isLoading
  const hasNoPaymentMethod = (paymentMethods?.length ?? 0) === 0
  const setAutomaticTopUpMutation = useSetAutomaticTopUpMutation()
  const redeemCouponMutation = useRedeemCouponMutation()
  const topUpWalletMutation = useTopUpWalletMutation()
  const createInvoicePaymentUrlMutation = useCreateInvoicePaymentUrlMutation()

  useEffect(() => {
    if (wallet?.automaticTopUp) {
      setAutomaticTopUp(wallet.automaticTopUp)
    }
  }, [wallet])

  const handleSetAutomaticTopUp = useCallback(async () => {
    if (!selectedOrganization) {
      return
    }

    try {
      await setAutomaticTopUpMutation.mutateAsync({
        organizationId: selectedOrganization.id,
        automaticTopUp,
      })
      toast.success('自动充值设置已保存')
    } catch (error) {
      toast.error('自动充值设置失败', {
        description: String(error),
      })
    }
  }, [selectedOrganization, automaticTopUp, setAutomaticTopUpMutation])

  const handleRedeemCoupon = useCallback(async () => {
    if (!selectedOrganization || !couponCode) {
      return
    }

    setRedeemCouponError(null)
    setRedeemCouponSuccess(null)

    try {
      const message = await redeemCouponMutation.mutateAsync({
        organizationId: selectedOrganization.id,
        couponCode,
      })
      setRedeemCouponSuccess(message)
      setTimeout(() => {
        setRedeemCouponSuccess(null)
      }, 3000)
      setCouponCode('')
    } catch (error) {
      setRedeemCouponError(String(error))
      console.error('兑换优惠券失败：', error)
    }
  }, [selectedOrganization, couponCode, redeemCouponMutation])

  const automaticTopUpHasChanges = useMemo(() => {
    if (wallet?.automaticTopUp?.disabled && (automaticTopUp?.thresholdAmount || 0) > 0) {
      return true
    }

    if (automaticTopUp?.thresholdAmount !== wallet?.automaticTopUp?.thresholdAmount) {
      if (!wallet?.automaticTopUp) {
        if ((automaticTopUp?.thresholdAmount || 0) !== 0) {
          return true
        }
      } else {
        return true
      }
    }

    if (automaticTopUp?.targetAmount !== wallet?.automaticTopUp?.targetAmount) {
      if (!wallet?.automaticTopUp) {
        if ((automaticTopUp?.targetAmount || 0) !== 0) {
          return true
        }
      } else {
        return true
      }
    }

    return false
  }, [wallet, automaticTopUp])

  const handleTopUpWallet = useCallback(async () => {
    if (!selectedOrganization) {
      return
    }
    const amount = selectedPreset ?? oneTimeTopUpAmount
    if (!amount) {
      return
    }

    const newWindow = window.open('', '_blank')
    try {
      const result = await topUpWalletMutation.mutateAsync({
        organizationId: selectedOrganization.id,
        amountCents: amount * 100,
      })
      if (newWindow) {
        newWindow.location.href = result.url ?? ''
      }
    } catch (error) {
      newWindow?.close()
      toast.error('发起充值失败', {
        description: String(error),
      })
    }
  }, [selectedOrganization, selectedPreset, oneTimeTopUpAmount, topUpWalletMutation])

  const handlePayInvoice = useCallback(
    async (invoice: Invoice) => {
      if (!selectedOrganization) {
        return
      }

      const newWindow = window.open('', '_blank')
      try {
        const result = await createInvoicePaymentUrlMutation.mutateAsync({
          organizationId: selectedOrganization.id,
          invoiceId: invoice.id ?? '',
        })
        if (newWindow) {
          newWindow.location.href = result.url ?? ''
        }
      } catch (error) {
        newWindow?.close()
        toast.error('打开发票失败', {
          description: String(error),
        })
      }
    },
    [selectedOrganization, createInvoicePaymentUrlMutation],
  )

  const handleViewInvoice = useCallback(
    async (invoice: Invoice) => {
      if (!selectedOrganization) {
        return
      }

      window.open(invoice.fileUrl ?? '', '_blank')
    },
    [selectedOrganization],
  )

  const isPostPaid = wallet?.billingType === BillingType.BillingTypePostPaid
  const showCreditCardBonusPrompt = Boolean(
    hasNoPaymentMethod && user?.profile.email_verified && selectedOrganization?.personal,
  )
  const showMissingPaymentMethodTopUpMessage = Boolean(wallet && hasNoPaymentMethod)
  const automaticTopUpSaveDisabled =
    !automaticTopUpHasChanges ||
    setAutomaticTopUpMutation.isPending ||
    walletQuery.isLoading ||
    !wallet ||
    paymentMethodsLoading ||
    hasNoPaymentMethod
  const topUpEnabled = Boolean(
    !paymentMethodsLoading &&
      !hasNoPaymentMethod &&
      !topUpWalletMutation.isPending &&
      (selectedPreset || oneTimeTopUpAmount),
  )

  return (
    <PageLayout>
      <PageHeader />

      <PageContent>
        <PageIntro title="钱包" />
        {walletQuery.isLoading && (
          <div className="flex flex-col gap-6">
            <Card className="flex flex-col gap-4">
              <CardContent className="flex flex-col gap-4">
                <Skeleton className="h-5 w-full max-w-sm" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-10 flex-1" />
                  <Skeleton className="h-10 flex-1" />
                </div>
                <Skeleton className=" h-10" />
                <Skeleton className=" h-10" />
              </CardContent>
            </Card>
            <Card className="flex flex-col gap-4">
              <CardContent className="flex flex-col gap-4">
                <Skeleton className="h-5 w-full max-w-sm" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-10 flex-1" />
                  <Skeleton className="h-10 flex-1" />
                </div>
                <Skeleton className=" h-10" />
              </CardContent>
            </Card>
          </div>
        )}
        {walletQuery.isError && !wallet && (
          <WalletErrorState onRetry={() => walletQuery.refetch()} retrying={walletQuery.isFetching} />
        )}
        {wallet && (
          <>
            {user && (
              <>
                {!user.profile.email_verified && (
                  <Alert variant="info">
                    <TriangleAlertIcon />
                    <AlertTitle>验证邮箱</AlertTitle>
                    <AlertDescription>
                      {(wallet.balanceCents ?? 0) > 0 ? (
                        <>
                          请验证邮箱地址以完成账号设置。
                          <br />验证邮件已发送。
                        </>
                      ) : (
                        <>
                          验证邮箱地址即可获得 100 美元额度。
                          <br />验证邮件已发送。
                        </>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
                {showCreditCardBonusPrompt && (
                  <Alert variant="neutral">
                    <SparklesIcon />
                    <AlertDescription>绑定信用卡可额外获得 100 美元额度。</AlertDescription>
                  </Alert>
                )}
              </>
            )}
            {wallet.hasFailedOrPendingInvoice && (
              <Alert variant="destructive">
                <TriangleAlertIcon />
                <AlertTitle>待处理发票</AlertTitle>
                <AlertDescription>
                  你有失败或待处理的发票，需要先处理才能继续充值。请检查下方发票，并完成或作废所有待处理付款。
                </AlertDescription>
              </Alert>
            )}
            {wallet.automaticTopUp?.disabled && (
              <Alert variant="destructive">
                <TriangleAlertIcon />
                <AlertTitle>自动充值已停用</AlertTitle>
                <AlertDescription>
                  自动充值因付款失败而停用。请更新付款方式，然后在下方手动重新启用。
                </AlertDescription>
              </Alert>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  概览
                  {isPostPaid && <Badge variant="secondary">后付费</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="">
                <div className="flex items-start sm:flex-row flex-col gap-4 sm:items-end justify-between">
                  <div className="flex gap-4 sm:gap-12 sm:flex-row flex-col">
                    <div className="flex flex-col gap-1">
                      <div className="">当前余额</div>
                      <div className="text-xl text-foreground font-semibold">
                        {formatAmount(wallet.ongoingBalanceCents ?? 0)}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="">本月消费</div>
                      <div className="text-xl font-semibold">
                        {formatAmount((wallet.balanceCents ?? 0) - (wallet.ongoingBalanceCents ?? 0))}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>

              {user?.profile.email_verified && (
                <CardContent className="border-t border-border">
                  <div className="flex gap-4 md:items-center justify-between md:flex-row flex-col">
                    <div className="flex flex-col gap-1 items-start flex-1">
                      <div className="text-sm font-medium">兑换优惠券</div>
                      {redeemCouponError ? (
                        <div className="text-sm text-destructive">{redeemCouponError}</div>
                      ) : redeemCouponSuccess ? (
                        <div className="text-sm text-success">{redeemCouponSuccess}</div>
                      ) : (
                        <div className="text-sm text-muted-foreground">输入优惠券代码以兑换额度。</div>
                      )}
                    </div>

                    <div className="flex gap-2 items-center">
                      <Input
                        placeholder="输入优惠券代码"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)}
                      />
                      <Button
                        variant="secondary"
                        onClick={handleRedeemCoupon}
                        disabled={redeemCouponMutation.isPending}
                      >
                        {redeemCouponMutation.isPending && <Spinner />} 兑换
                      </Button>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>

            {selectedOrganization && (
              <>
                <BillingInfoCard organizationId={selectedOrganization.id} />
                <PaymentMethodsCard organizationId={selectedOrganization.id} />
              </>
            )}

            {!isPostPaid && (
              <Card className="w-full">
                <CardHeader>
                  <CardTitle>自动充值</CardTitle>
                  <CardDescription>
                    设置钱包自动充值规则。
                    <br />
                    目标金额必须至少比触发金额高 10 美元。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex sm:flex-row flex-col gap-6">
                    <div className="flex flex-col gap-2 flex-1">
                      <Label htmlFor="thresholdAmount">余额低于</Label>
                      <InputGroup>
                        <InputGroupAddon>
                          <InputGroupText>$</InputGroupText>
                        </InputGroupAddon>
                        <NumericFormat
                          customInput={InputGroupInput}
                          placeholder="0.00"
                          id="thresholdAmount"
                          inputMode="decimal"
                          thousandSeparator
                          decimalScale={2}
                          value={automaticTopUp?.thresholdAmount ?? ''}
                          onValueChange={({ floatValue }) => {
                            const value = floatValue ?? 0

                            let targetAmount = automaticTopUp?.targetAmount ?? 0
                            if (value > targetAmount - 10) {
                              targetAmount = value + 10
                            }

                            setAutomaticTopUp({
                              thresholdAmount: value,
                              targetAmount,
                            })
                          }}
                        />
                        <InputGroupAddon align="inline-end">
                          <InputGroupText>USD</InputGroupText>
                        </InputGroupAddon>
                      </InputGroup>
                    </div>

                    <div className="flex flex-col gap-2 flex-1">
                      <Label htmlFor="targetAmount">充值至</Label>
                      <InputGroup>
                        <InputGroupAddon>
                          <InputGroupText>$</InputGroupText>
                        </InputGroupAddon>
                        <NumericFormat
                          placeholder="0.00"
                          customInput={InputGroupInput}
                          id="targetAmount"
                          inputMode="decimal"
                          thousandSeparator
                          decimalScale={2}
                          value={automaticTopUp?.targetAmount ?? ''}
                          onValueChange={({ floatValue }) => {
                            const thresholdAmount = automaticTopUp?.thresholdAmount ?? 0
                            setAutomaticTopUp({
                              thresholdAmount,
                              targetAmount: floatValue ?? 0,
                            })
                          }}
                          onBlur={() => {
                            const thresholdAmount = automaticTopUp?.thresholdAmount ?? 0
                            const currentTarget = automaticTopUp?.targetAmount ?? 0

                            if (currentTarget < thresholdAmount) {
                              setAutomaticTopUp({
                                thresholdAmount,
                                targetAmount: thresholdAmount,
                              })
                            }
                          }}
                        />
                        <InputGroupAddon align="inline-end">
                          <InputGroupText>USD</InputGroupText>
                        </InputGroupAddon>
                      </InputGroup>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between gap-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <InfoIcon className="w-4 h-4 shrink-0" />{' '}
                    <span className="text-sm ">将两个值都设为 0 会停用自动充值。</span>
                  </div>
                  <div className="flex gap-2 items-center ml-auto">
                    <Button onClick={handleSetAutomaticTopUp} disabled={automaticTopUpSaveDisabled}>
                      {setAutomaticTopUpMutation.isPending && <Spinner />} 保存
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            )}

            <Card className="w-full">
              <CardHeader>
                <CardTitle>单次充值</CardTitle>
                <CardDescription>
                  立即为钱包充值。请选择预设金额或输入自定义金额。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-10 items-center lg:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm font-medium">选择金额</Label>
                    <div className="grid grid-cols-1 xxs:grid-cols-4 overflow-hidden rounded-md border border-input">
                      {[25, 500, 1000, 2000].map((amount) => (
                        <Button
                          key={amount}
                          type="button"
                          variant={selectedPreset === amount ? 'default' : 'ghost'}
                          size="default"
                          className="flex h-9 min-w-0 rounded-none border-t border-border px-2 text-[13px] first:border-t-0 xxs:border-l xxs:border-t-0 xxs:first:border-l-0"
                          onClick={() => {
                            setSelectedPreset((currentPreset) => (currentPreset === amount ? null : amount))
                            setOneTimeTopUpAmount(undefined)
                          }}
                        >
                          <span className="font-semibold">${amount.toLocaleString()}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 lg:hidden">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-sm text-muted-foreground">或</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="customTopUpAmount" className="text-sm font-medium">
                      输入自定义金额
                    </Label>
                    <InputGroup>
                      <InputGroupAddon>
                        <InputGroupText>$</InputGroupText>
                      </InputGroupAddon>
                      <NumericFormat
                        placeholder="0.00"
                        customInput={InputGroupInput}
                        id="customTopUpAmount"
                        inputMode="decimal"
                        thousandSeparator
                        decimalScale={2}
                        value={oneTimeTopUpAmount ?? ''}
                        onValueChange={({ floatValue }) => {
                          const value = floatValue ?? undefined
                          setOneTimeTopUpAmount(value)
                          setSelectedPreset(null)
                        }}
                        onFocus={() => {
                          setSelectedPreset(null)
                        }}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>USD</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between gap-2">
                {paymentMethodsLoading ? (
                  <Skeleton className="h-4 w-64 max-w-full" />
                ) : showMissingPaymentMethodTopUpMessage ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CreditCardIcon className="w-4 h-4 shrink-0" />
                    <span>请添加付款方式后再充值。</span>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    即将跳转到 Stripe 完成付款。
                  </div>
                )}
                <Button onClick={handleTopUpWallet} disabled={!topUpEnabled} size="sm">
                  {topUpWalletMutation.isPending && <Spinner />}
                  充值
                </Button>
              </CardFooter>
            </Card>

            <Card className="w-full">
              <CardHeader>
                <CardTitle>发票</CardTitle>
                <CardDescription>
                  查看和下载账单发票。所有发票均会自动生成并发送到你的账单邮箱。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <InvoicesTable
                  data={invoicesQuery.data?.items ?? []}
                  pagination={invoicesPagination}
                  pageCount={invoicesQuery.data?.totalPages ?? 0}
                  totalItems={invoicesQuery.data?.totalItems ?? 0}
                  onPaginationChange={setInvoicesPagination}
                  loading={invoicesQuery.isLoading}
                  onViewInvoice={handleViewInvoice}
                  onPayInvoice={handlePayInvoice}
                />
              </CardContent>
            </Card>

            {selectedOrganization && (
              <Card className="w-full">
                <CardHeader>
                  <CardTitle>付款记录</CardTitle>
                  <CardDescription>组织的所有付款尝试，包括失败的付款。</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChargesTable data={chargesQuery.charges} loading={chargesQuery.isLoading} />
                </CardContent>
              </Card>
            )}
          </>
        )}
      </PageContent>
    </PageLayout>
  )
}

function WalletErrorState({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <Empty className="flex-none rounded-md border py-12">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-destructive-background text-destructive">
          <TriangleAlertIcon />
        </EmptyMedia>
        <EmptyTitle className="text-destructive">加载钱包失败</EmptyTitle>
        <EmptyDescription>获取钱包信息时出错，请重试。</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}>
          {retrying && <Spinner />}
          重试
        </Button>
      </EmptyContent>
    </Empty>
  )
}

export default Wallet
