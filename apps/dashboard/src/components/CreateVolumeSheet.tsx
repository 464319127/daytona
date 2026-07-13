/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { CreateResourceButton } from '@/components/CreateResourceButton'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import { useCreateVolumeMutation } from '@/hooks/mutations/useCreateVolumeMutation'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { handleApiError } from '@/lib/error-handling'
import { useForm } from '@tanstack/react-form'
import { Ref, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

const formSchema = z.object({
  name: z.string().trim().min(1, '存储卷名称为必填项'),
})

type FormValues = z.infer<typeof formSchema>

const defaultValues: FormValues = {
  name: '',
}

export const CreateVolumeSheet = ({
  className,
  disabled,
  ref,
}: {
  className?: string
  disabled?: boolean
  ref?: Ref<{ open: () => void }>
}) => {
  const [open, setOpen] = useState(false)

  const { selectedOrganization } = useSelectedOrganization()
  const { reset: resetCreateVolumeMutation, ...createVolumeMutation } = useCreateVolumeMutation()
  const formRef = useRef<HTMLFormElement>(null)

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
  }))

  const form = useForm({
    defaultValues,
    validators: {
      onSubmit: formSchema,
    },
    onSubmitInvalid: () => {
      const formEl = formRef.current
      if (!formEl) return
      const invalidInput = formEl.querySelector('[aria-invalid="true"]') as HTMLInputElement | null
      if (invalidInput) {
        invalidInput.scrollIntoView({ behavior: 'smooth', block: 'center' })
        invalidInput.focus()
      }
    },
    onSubmit: async ({ value }) => {
      if (!selectedOrganization?.id) {
        toast.error('请选择一个组织以创建存储卷。')
        return
      }

      try {
        const volumeName = value.name.trim()

        await createVolumeMutation.mutateAsync({
          volume: {
            name: volumeName,
          },
          organizationId: selectedOrganization.id,
        })

        setOpen(false)
        toast.success(`正在创建存储卷 ${volumeName}`)
      } catch (error) {
        handleApiError(error, '创建卷失败')
      }
    },
  })
  const { reset: resetForm } = form

  const resetState = useCallback(() => {
    resetForm(defaultValues)
    resetCreateVolumeMutation()
  }, [resetForm, resetCreateVolumeMutation])

  useEffect(() => {
    if (open) {
      resetState()
    }
  }, [open, resetState])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <CreateResourceButton resource="卷" disabled={disabled} className={className} />
      </SheetTrigger>
      <SheetContent className="w-dvw sm:w-[420px] p-0 flex flex-col gap-0">
        <SheetHeader className="border-b border-border p-4 px-5 items-center flex text-left flex-row">
          <SheetTitle>创建卷</SheetTitle>
          <SheetDescription className="sr-only">创建用于共享持久化存储的新存储卷。</SheetDescription>
        </SheetHeader>

        <ScrollArea fade="mask" className="flex-1 min-h-0">
          <form
            ref={formRef}
            id="create-volume-form"
            className="space-y-6 p-5"
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
                    <FieldLabel htmlFor={field.name}>卷名称</FieldLabel>
                    <Input
                      aria-invalid={isInvalid}
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="my-volume"
                    />
                    <FieldDescription>用于在沙箱中挂载此存储卷。</FieldDescription>
                    {field.state.meta.errors.length > 0 && field.state.meta.isTouched && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            </form.Field>
          </form>
        </ScrollArea>

        <SheetFooter className="border-t border-border p-4 px-5">
          <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
            children={([canSubmit, isSubmitting]) => (
              <Button
                type="submit"
                size="sm"
                form="create-volume-form"
                variant="default"
                disabled={!canSubmit || isSubmitting || !selectedOrganization?.id}
              >
                {isSubmitting && <Spinner />}
                Create
              </Button>
            )}
          />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
