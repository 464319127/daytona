/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'

type CopyFn = (text: string) => Promise<boolean>

export function useCopyToClipboard({ timeout = 2000 }: { timeout?: number } = {}): [string | null, CopyFn] {
  const [copiedText, setCopiedText] = useState<string | null>(null)

  const copy: CopyFn = useCallback(
    async (text) => {
      if (!navigator?.clipboard) {
        toast.error('当前环境不支持剪贴板')
        return false
      }

      try {
        await navigator.clipboard.writeText(text)

        setCopiedText(text)

        if (timeout !== 0) {
          setTimeout(() => {
            setCopiedText(null)
          }, timeout)
        }

        return true
      } catch (error) {
        console.error('Failed to copy to clipboard', error)
        setCopiedText(null)

        toast.error('复制到剪贴板失败')

        return false
      }
    },
    [timeout],
  )

  return [copiedText, copy]
}
