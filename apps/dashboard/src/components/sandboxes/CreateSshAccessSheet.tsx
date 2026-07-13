/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { SshAccessDto } from '@daytona/api-client'
import { useForm } from '@tanstack/react-form'
import { CheckIcon, CopyIcon, InfoIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { NumericFormat } from 'react-number-format'
import { z } from 'zod'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useCreateSshAccessMutation } from '@/hooks/mutations/useCreateSshAccessMutation'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { handleApiError } from '@/lib/error-handling'

interface CreateSshAccessSheetProps {
  sandboxId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const MotionCopyIcon = motion(CopyIcon)
const MotionCheckIcon = motion(CheckIcon)

const iconProps = {
  initial: { opacity: 0, y: 5 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -5 },
  transition: { duration: 0.1 },
}

const formSchema = z.object({
  expiryMinutes: z.number().int('必须为整数').min(1, '最少 1 分钟').max(1440, '最多 1440 分钟'),
})

type FormValues = z.infer<typeof formSchema>

const defaultValues: FormValues = {
  expiryMinutes: 60,
}

export function CreateSshAccessSheet({ sandboxId, open, onOpenChange }: CreateSshAccessSheetProps) {
  const [sshAccess, setSshAccess] = useState<SshAccessDto | null>(null)
  const { reset: resetMutation, ...createMutation } = useCreateSshAccessMutation()
  const formRef = useRef<HTMLFormElement>(null)

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
      try {
        const result = await createMutation.mutateAsync({
          sandboxId,
          expiresInMinutes: value.expiryMinutes,
        })
        setSshAccess(result)
      } catch (error) {
        handleApiError(error, '创建 SSH 访问失败')
      }
    },
  })
  const { reset: resetForm } = form

  const resetState = useCallback(() => {
    resetForm(defaultValues)
    resetMutation()
    setSshAccess(null)
  }, [resetForm, resetMutation])

  useEffect(() => {
    if (open) {
      resetState()
    }
  }, [open, resetState])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-dvw sm:w-[400px] p-0 flex flex-col gap-0">
        <SheetHeader className="border-b border-border p-4 px-5 items-center flex text-left flex-row">
          <SheetTitle>{sshAccess ? 'SSH 访问已创建' : '创建 SSH 访问'}</SheetTitle>
          <SheetDescription className="sr-only">
            {sshAccess ? 'SSH 访问创建成功。' : '设置 SSH 访问的过期时间。'}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          {sshAccess ? (
            <div className="p-5">
              <SshAccessCreated sshAccess={sshAccess} />
            </div>
          ) : (
            <form
              ref={formRef}
              id="create-ssh-form"
              className="p-5"
              onSubmit={(e) => {
                e.preventDefault()
                e.stopPropagation()
                form.handleSubmit()
              }}
            >
              <form.Field name="expiryMinutes">
                {(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>有效期</FieldLabel>
                      <InputGroup>
                        <NumericFormat
                          customInput={InputGroupInput}
                          aria-invalid={isInvalid}
                          id={field.name}
                          name={field.name}
                          inputMode="numeric"
                          allowNegative={false}
                          decimalScale={0}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onValueChange={({ floatValue }) => field.handleChange(floatValue ?? 0)}
                        />
                        <InputGroupAddon align="inline-end">
                          <InputGroupText>分钟</InputGroupText>
                        </InputGroupAddon>
                      </InputGroup>
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
        <SheetFooter className="mt-auto border-t border-border p-4 px-5">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          {!sshAccess && (
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
              children={([canSubmit, isSubmitting]) => (
                <Button type="submit" form="create-ssh-form" disabled={!canSubmit || isSubmitting}>
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

function SshAccessCreated({ sshAccess }: { sshAccess: SshAccessDto }) {
  const [copiedCommand, copyCommand] = useCopyToClipboard()

  return (
    <div className="space-y-4">
      <Alert variant="warning">
        <InfoIcon />
        <AlertDescription>请妥善保存令牌，之后将无法再次查看。</AlertDescription>
      </Alert>
      <Field>
        <FieldLabel htmlFor="ssh-command">SSH 命令</FieldLabel>
        <InputGroup className="pr-1">
          <InputGroupInput id="ssh-command" value={sshAccess.sshCommand} readOnly />
          <InputGroupButton
            variant="ghost"
            size="icon-xs"
            aria-label="复制 SSH 命令"
            onClick={() => copyCommand(sshAccess.sshCommand)}
          >
            <AnimatePresence initial={false} mode="wait">
              {copiedCommand ? (
                <MotionCheckIcon className="size-4" key="copied" {...iconProps} />
              ) : (
                <MotionCopyIcon className="size-4" key="copy" {...iconProps} />
              )}
            </AnimatePresence>
          </InputGroupButton>
        </InputGroup>
      </Field>
    </div>
  )
}
