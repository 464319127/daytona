/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import React, { Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { CreateRegion, CreateRegionResponse } from '@daytona/api-client'
import { useForm } from '@tanstack/react-form'
import { useMutation } from '@tanstack/react-query'
import { z } from 'zod'
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon } from 'lucide-react'
import { CreateResourceButton } from '@/components/CreateResourceButton'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Spinner } from '@/components/ui/spinner'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { getMaskedToken } from '@/lib/utils'

const REGION_NAME_REGEX = /^[a-zA-Z0-9._-]+$/

const optionalUrlSchema = z
  .string()
  .trim()
  .refine((value) => value.length === 0 || z.string().url().safeParse(value).success, '请输入有效的 URL')

const formSchema = z.object({
  name: z
    .string()
    .min(1, '区域名称为必填项')
    .refine(
      (value) => REGION_NAME_REGEX.test(value),
      '仅允许字母、数字、下划线、句点和连字符',
    ),
  proxyUrl: optionalUrlSchema,
  sshGatewayUrl: optionalUrlSchema,
  snapshotManagerUrl: optionalUrlSchema,
})

type FormValues = z.infer<typeof formSchema>

const defaultValues: FormValues = {
  name: '',
  proxyUrl: '',
  sshGatewayUrl: '',
  snapshotManagerUrl: '',
}

interface CreateRegionSheetProps {
  onCreateRegion: (data: CreateRegion) => Promise<CreateRegionResponse | null>
  writePermitted: boolean
  loadingData: boolean
  ref?: Ref<{ open: () => void }>
}

const hasRegionCredentials = (region: CreateRegionResponse | null) => {
  if (!region) return false

  return Boolean(
    region.proxyApiKey || region.sshGatewayApiKey || region.snapshotManagerUsername || region.snapshotManagerPassword,
  )
}

export const CreateRegionSheet: React.FC<CreateRegionSheetProps> = ({
  onCreateRegion,
  writePermitted,
  loadingData,
  ref,
}) => {
  const [open, setOpen] = useState(false)
  const [createdRegion, setCreatedRegion] = useState<CreateRegionResponse | null>(null)
  const [isProxyApiKeyRevealed, setIsProxyApiKeyRevealed] = useState(false)
  const [isSshGatewayApiKeyRevealed, setIsSshGatewayApiKeyRevealed] = useState(false)
  const [isSnapshotManagerPasswordRevealed, setIsSnapshotManagerPasswordRevealed] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
  }))

  const createRegionMutation = useMutation({
    mutationFn: async (value: FormValues) => {
      const createRegionData: CreateRegion = {
        name: value.name.trim(),
        proxyUrl: value.proxyUrl.trim() || null,
        sshGatewayUrl: value.sshGatewayUrl.trim() || null,
        snapshotManagerUrl: value.snapshotManagerUrl.trim() || null,
      }

      return onCreateRegion(createRegionData)
    },
  })

  const form = useForm({
    defaultValues,
    validators: {
      onSubmit: formSchema,
    },
    onSubmitInvalid: () => {
      const formEl = formRef.current
      if (!formEl) return
      const invalidInput = formEl.querySelector('[aria-invalid="true"]') as HTMLElement | null
      if (invalidInput) {
        invalidInput.scrollIntoView({ behavior: 'smooth', block: 'center' })
        invalidInput.focus()
      }
    },
    onSubmit: async ({ value }) => {
      const region = await createRegionMutation.mutateAsync(value)

      if (!region) {
        return
      }

      if (!hasRegionCredentials(region)) {
        setOpen(false)
        setCreatedRegion(null)
      } else {
        setCreatedRegion(region)
      }

      resetForm(defaultValues)
    },
  })
  const { reset: resetForm } = form

  const { reset: resetMutation } = createRegionMutation

  const resetState = useCallback(() => {
    setCreatedRegion(null)
    setIsProxyApiKeyRevealed(false)
    setIsSshGatewayApiKeyRevealed(false)
    setIsSnapshotManagerPasswordRevealed(false)
    resetForm(defaultValues)
    resetMutation()
  }, [resetForm, resetMutation])

  useEffect(() => {
    if (open) {
      resetState()
    }
  }, [open, resetState])

  const [copiedText, copyToClipboard] = useCopyToClipboard()

  const showCredentials = useMemo(() => hasRegionCredentials(createdRegion), [createdRegion])

  if (!writePermitted) {
    return null
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <CreateResourceButton resource="区域" disabled={loadingData} />
      </SheetTrigger>

      <SheetContent className="w-dvw sm:w-[500px] p-0 flex flex-col gap-0">
        <SheetHeader className="border-b border-border p-4 px-5 items-center flex text-left flex-row">
          <SheetTitle>{createdRegion ? '区域已创建' : '创建区域'}</SheetTitle>
          <SheetDescription className="sr-only">
            {!createdRegion
              ? '添加用于归组 Runner 和 Sandbox 的新区域。'
              : '请安全保存这些凭据，之后将无法再次查看。'}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea fade="mask" fadeOffset={30} className="flex-1 min-h-0">
          <div className="p-5">
            {showCredentials ? (
              <div className="space-y-6">
                {createdRegion?.proxyApiKey && (
                  <Field>
                    <FieldLabel htmlFor="proxy-api-key">Proxy API Key</FieldLabel>
                    <InputGroup className="pr-1 flex-1">
                      <InputGroupInput
                        id="proxy-api-key"
                        value={
                          isProxyApiKeyRevealed ? createdRegion.proxyApiKey : getMaskedToken(createdRegion.proxyApiKey)
                        }
                        readOnly
                      />
                      <InputGroupButton
                        variant="ghost"
                        size="icon-xs"
                        aria-label={isProxyApiKeyRevealed ? '隐藏 Proxy API 密钥' : '显示 Proxy API 密钥'}
                        aria-pressed={isProxyApiKeyRevealed}
                        onClick={() => setIsProxyApiKeyRevealed((revealed) => !revealed)}
                      >
                        {isProxyApiKeyRevealed ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                      </InputGroupButton>
                      <InputGroupButton
                        variant="ghost"
                        size="icon-xs"
                        aria-label="复制 Proxy API 密钥"
                        onClick={() => copyToClipboard(createdRegion.proxyApiKey ?? '')}
                      >
                        {copiedText === createdRegion.proxyApiKey ? (
                          <CheckIcon className="h-4 w-4" />
                        ) : (
                          <CopyIcon className="h-4 w-4" />
                        )}
                      </InputGroupButton>
                    </InputGroup>
                  </Field>
                )}

                {createdRegion?.sshGatewayApiKey && (
                  <Field>
                    <FieldLabel htmlFor="ssh-gateway-api-key">SSH Gateway API Key</FieldLabel>
                    <InputGroup className="pr-1 flex-1">
                      <InputGroupInput
                        id="ssh-gateway-api-key"
                        value={
                          isSshGatewayApiKeyRevealed
                            ? createdRegion.sshGatewayApiKey
                            : getMaskedToken(createdRegion.sshGatewayApiKey)
                        }
                        readOnly
                      />
                      <InputGroupButton
                        variant="ghost"
                        size="icon-xs"
                        aria-label={
                          isSshGatewayApiKeyRevealed ? '隐藏 SSH Gateway API 密钥' : '显示 SSH Gateway API 密钥'
                        }
                        aria-pressed={isSshGatewayApiKeyRevealed}
                        onClick={() => setIsSshGatewayApiKeyRevealed((revealed) => !revealed)}
                      >
                        {isSshGatewayApiKeyRevealed ? (
                          <EyeOffIcon className="h-4 w-4" />
                        ) : (
                          <EyeIcon className="h-4 w-4" />
                        )}
                      </InputGroupButton>
                      <InputGroupButton
                        variant="ghost"
                        size="icon-xs"
                        aria-label="复制 SSH Gateway API 密钥"
                        onClick={() => copyToClipboard(createdRegion.sshGatewayApiKey ?? '')}
                      >
                        {copiedText === createdRegion.sshGatewayApiKey ? (
                          <CheckIcon className="h-4 w-4" />
                        ) : (
                          <CopyIcon className="h-4 w-4" />
                        )}
                      </InputGroupButton>
                    </InputGroup>
                  </Field>
                )}

                {createdRegion?.snapshotManagerUsername && (
                  <Field>
                    <FieldLabel htmlFor="snapshot-manager-username">Snapshot Manager 用户名</FieldLabel>
                    <InputGroup className="pr-1 flex-1">
                      <InputGroupInput
                        id="snapshot-manager-username"
                        value={createdRegion.snapshotManagerUsername}
                        readOnly
                      />
                      <InputGroupButton
                        variant="ghost"
                        size="icon-xs"
                        aria-label="复制 Snapshot Manager 用户名"
                        onClick={() => copyToClipboard(createdRegion.snapshotManagerUsername ?? '')}
                      >
                        {copiedText === createdRegion.snapshotManagerUsername ? (
                          <CheckIcon className="h-4 w-4" />
                        ) : (
                          <CopyIcon className="h-4 w-4" />
                        )}
                      </InputGroupButton>
                    </InputGroup>
                  </Field>
                )}

                {createdRegion?.snapshotManagerPassword && (
                  <Field>
                    <FieldLabel htmlFor="snapshot-manager-password">Snapshot Manager 密码</FieldLabel>
                    <InputGroup className="pr-1 flex-1">
                      <InputGroupInput
                        id="snapshot-manager-password"
                        value={
                          isSnapshotManagerPasswordRevealed
                            ? createdRegion.snapshotManagerPassword
                            : getMaskedToken(createdRegion.snapshotManagerPassword)
                        }
                        readOnly
                      />
                      <InputGroupButton
                        variant="ghost"
                        size="icon-xs"
                        aria-label={
                          isSnapshotManagerPasswordRevealed
                            ? '隐藏 Snapshot Manager 密码'
                            : '显示 Snapshot Manager 密码'
                        }
                        aria-pressed={isSnapshotManagerPasswordRevealed}
                        onClick={() => setIsSnapshotManagerPasswordRevealed((revealed) => !revealed)}
                      >
                        {isSnapshotManagerPasswordRevealed ? (
                          <EyeOffIcon className="h-4 w-4" />
                        ) : (
                          <EyeIcon className="h-4 w-4" />
                        )}
                      </InputGroupButton>
                      <InputGroupButton
                        variant="ghost"
                        size="icon-xs"
                        aria-label="复制 Snapshot Manager 密码"
                        onClick={() => copyToClipboard(createdRegion.snapshotManagerPassword ?? '')}
                      >
                        {copiedText === createdRegion.snapshotManagerPassword ? (
                          <CheckIcon className="h-4 w-4" />
                        ) : (
                          <CopyIcon className="h-4 w-4" />
                        )}
                      </InputGroupButton>
                    </InputGroup>
                  </Field>
                )}
              </div>
            ) : (
              <form
                ref={formRef}
                id="create-region-form"
                className="space-y-6"
                onSubmit={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  form.handleSubmit()
                }}
              >
                <form.Field name="name">
                  {(field) => {
                    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>区域名称</FieldLabel>
                        <Input
                          aria-invalid={isInvalid}
                          id={field.name}
                          name={field.name}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="us-east-1"
                        />
                        <FieldDescription>
                          区域名称只能包含字母、数字、下划线、句点和连字符。
                        </FieldDescription>
                        {field.state.meta.errors.length > 0 && field.state.meta.isTouched && (
                          <FieldError errors={field.state.meta.errors} />
                        )}
                      </Field>
                    )
                  }}
                </form.Field>

                <form.Field name="proxyUrl">
                  {(field) => {
                    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>Proxy URL</FieldLabel>
                        <Input
                          aria-invalid={isInvalid}
                          id={field.name}
                          name={field.name}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="https://proxy.example.com"
                        />
                        <FieldDescription>（可选）此区域的自定义 Proxy URL。</FieldDescription>
                        {field.state.meta.errors.length > 0 && field.state.meta.isTouched && (
                          <FieldError errors={field.state.meta.errors} />
                        )}
                      </Field>
                    )
                  }}
                </form.Field>

                <form.Field name="sshGatewayUrl">
                  {(field) => {
                    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>SSH gateway URL</FieldLabel>
                        <Input
                          aria-invalid={isInvalid}
                          id={field.name}
                          name={field.name}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="https://ssh-gateway.example.com"
                        />
                        <FieldDescription>（可选）此区域的自定义 SSH Gateway URL。</FieldDescription>
                        {field.state.meta.errors.length > 0 && field.state.meta.isTouched && (
                          <FieldError errors={field.state.meta.errors} />
                        )}
                      </Field>
                    )
                  }}
                </form.Field>

                <form.Field name="snapshotManagerUrl">
                  {(field) => {
                    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>Snapshot manager URL</FieldLabel>
                        <Input
                          aria-invalid={isInvalid}
                          id={field.name}
                          name={field.name}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="https://snapshot-manager.example.com"
                        />
                        <FieldDescription>
                          （可选）此区域的自定义 Snapshot Manager URL。
                        </FieldDescription>
                        {field.state.meta.errors.length > 0 && field.state.meta.isTouched && (
                          <FieldError errors={field.state.meta.errors} />
                        )}
                      </Field>
                    )
                  }}
                </form.Field>
              </form>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="border-t border-border p-4 px-5">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            {showCredentials ? '关闭' : '取消'}
          </Button>
          {!showCredentials && (
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
              children={([canSubmit, isSubmitting]) => (
                <Button type="submit" form="create-region-form" variant="default" disabled={!canSubmit || isSubmitting}>
                  {isSubmitting && <Spinner />}
                  创建
                </Button>
              )}
            />
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
