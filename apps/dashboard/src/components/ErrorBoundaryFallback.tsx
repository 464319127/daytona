/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { CopyButton } from '@/components/CopyButton'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FallbackProps } from 'react-error-boundary'

export function ErrorBoundaryFallback({ error, resetErrorBoundary }: Partial<FallbackProps>) {
  return (
    <Dialog open>
      <DialogContent className="max-h-[calc(100svh-4rem)] overflow-hidden [&>button]:hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>出现问题</DialogTitle>
          <DialogDescription>
            Dashboard 加载失败，可能是临时服务异常或网络问题。请重试；如果问题持续存在，请联系支持团队。
          </DialogDescription>
        </DialogHeader>

        <div className="scrollbar-sm -mr-2 min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
          <Alert variant="destructive">
            <AlertTitle>错误详情：</AlertTitle>
            <AlertDescription>
              <p className="break-all">{error?.message || '未知错误'}</p>
            </AlertDescription>
          </Alert>

          {error?.stack && (
            <Accordion type="single" collapsible className="rounded-lg border border-border bg-muted/40">
              <AccordionItem value="stack-trace" className="border-b-0">
                <AccordionTrigger
                  className="px-4 py-3 text-sm font-semibold hover:no-underline"
                  right={
                    <div className="pr-2">
                      <CopyButton value={error.stack} size="icon-xs" tooltipText="复制堆栈跟踪" />
                    </div>
                  }
                >
                  堆栈跟踪
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4 pt-0">
                  <pre className="scrollbar-sm max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">
                    {error.stack}
                  </pre>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </div>

        <div className="flex shrink-0 gap-2 justify-end">
          <Button variant="outline" onClick={() => window.location.reload()}>
            重新加载页面
          </Button>
          {resetErrorBoundary && (
            <Button variant="outline" onClick={resetErrorBoundary}>
              重试
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
