/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import PythonIcon from '@/assets/python.svg'
import TypescriptIcon from '@/assets/typescript.svg'
import CodeBlock from '@/components/CodeBlock'
import { CopyButton } from '@/components/CopyButton'
import TooltipButton from '@/components/TooltipButton'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  FileSystemActions,
  GitOperationsActions,
  ProcessCodeExecutionActions,
  SandboxParametersSections,
} from '@/enums/Playground'
import { usePlayground } from '@/hooks/usePlayground'
import { usePlaygroundSandbox } from '@/hooks/usePlaygroundSandbox'
import { createErrorMessageOutput } from '@/lib/playground'
import { cn } from '@/lib/utils'
import { CodeLanguage, Sandbox } from '@daytona/sdk'
import { ChevronUpIcon, Loader2, PanelBottom, Play, XIcon } from 'lucide-react'
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Group, Panel, usePanelRef } from 'react-resizable-panels'
import ResponseCard from '../ResponseCard'
import { Window, WindowContent, WindowTitleBar } from '../Window'
import { codeSnippetGenerators, CodeSnippetParams } from './CodeSnippets'

const codeSnippetSupportedLanguages = [
  { value: CodeLanguage.PYTHON, label: 'Python', icon: PythonIcon },
  { value: CodeLanguage.TYPESCRIPT, label: 'TypeScript', icon: TypescriptIcon },
] as const

const SECTION_SCROLL_MARKERS: Partial<Record<SandboxParametersSections, string[]>> = {
  [SandboxParametersSections.FILE_SYSTEM]: [
    '# Create folder',
    '# List files',
    '# Delete',
    '// Create folder',
    '// List files',
    '// Delete',
  ],
  [SandboxParametersSections.GIT_OPERATIONS]: [
    '# Clone git',
    '# Get repository',
    '# List branches',
    '// Clone git',
    '// Get repository',
    '// List branches',
  ],
  [SandboxParametersSections.PROCESS_CODE_EXECUTION]: [
    '# Run code securely',
    '# Execute shell',
    '// Run code securely',
    '// Execute shell',
  ],
}

const SandboxCodeSnippetsResponse = ({ className }: { className?: string }) => {
  const [codeSnippetLanguage, setCodeSnippetLanguage] = useState<CodeLanguage>(CodeLanguage.PYTHON)
  const [codeSnippetOutput, setCodeSnippetOutput] = useState<string | ReactNode>('')
  const [isCodeSnippetRunning, setIsCodeSnippetRunning] = useState<boolean>(false)

  const {
    sandboxParametersState,
    actionRuntimeError,
    getSandboxParametersInfo,
    enabledSections,
    pendingScrollSection,
    clearPendingScrollSection,
  } = usePlayground()
  const {
    sandbox: { create: createSandbox },
  } = usePlaygroundSandbox()

  const useConfigObject = false // Currently not needed, we use jwtToken for client config

  const fsOn = enabledSections.includes(SandboxParametersSections.FILE_SYSTEM)
  const gitOn = enabledSections.includes(SandboxParametersSections.GIT_OPERATIONS)
  const procOn = enabledSections.includes(SandboxParametersSections.PROCESS_CODE_EXECUTION)

  const fileSystemListFilesLocationSet = fsOn && !actionRuntimeError[FileSystemActions.LIST_FILES]
  const fileSystemCreateFolderParamsSet = fsOn && !actionRuntimeError[FileSystemActions.CREATE_FOLDER]
  const fileSystemDeleteFileRequiredParamsSet = fsOn && !actionRuntimeError[FileSystemActions.DELETE_FILE]
  const useFileSystemDeleteFileRecursive =
    fileSystemDeleteFileRequiredParamsSet && sandboxParametersState['deleteFileParams'].recursive === true
  const shellCommandExists = procOn && !actionRuntimeError[ProcessCodeExecutionActions.SHELL_COMMANDS_RUN]
  const codeToRunExists = procOn && !actionRuntimeError[ProcessCodeExecutionActions.CODE_RUN]
  const gitCloneOperationRequiredParamsSet = gitOn && !actionRuntimeError[GitOperationsActions.GIT_CLONE]
  const useGitCloneBranch = !!sandboxParametersState['gitCloneParams'].branchToClone
  const useGitCloneCommitId = !!sandboxParametersState['gitCloneParams'].commitToClone
  const useGitCloneUsername = !!sandboxParametersState['gitCloneParams'].authUsername
  const useGitClonePassword = !!sandboxParametersState['gitCloneParams'].authPassword
  const gitStatusOperationLocationSet = gitOn && !actionRuntimeError[GitOperationsActions.GIT_STATUS]
  const gitBranchesOperationLocationSet = gitOn && !actionRuntimeError[GitOperationsActions.GIT_BRANCHES_LIST]

  const codeScrollRef = useRef<HTMLDivElement>(null)
  const highlightTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const scrollToSection = useCallback((section: SandboxParametersSections) => {
    const viewport = codeScrollRef.current?.querySelector<HTMLElement>('[data-slot=scroll-area-viewport]')
    if (!viewport) return

    const markers = SECTION_SCROLL_MARKERS[section]
    if (!markers?.length) return

    const walker = document.createTreeWalker(viewport, NodeFilter.SHOW_TEXT)
    let node: Text | null
    while ((node = walker.nextNode() as Text | null)) {
      const text = node.textContent?.trim() ?? ''
      if (!markers.some((m) => text.startsWith(m))) continue

      const span = node.parentElement
      if (!span) continue

      const el = (span.closest('[class*="line"]') as HTMLElement | null) ?? span
      const viewportRect = viewport.getBoundingClientRect()
      viewport.scrollTo({
        top: viewport.scrollTop + el.getBoundingClientRect().top - viewportRect.top - 32,
        behavior: 'smooth',
      })

      highlightTimersRef.current.forEach(clearTimeout)
      el.style.backgroundColor = 'rgba(34, 197, 94, 0.2)'
      el.style.borderRadius = '3px'
      highlightTimersRef.current = [
        setTimeout(() => {
          el.style.transition = 'background-color 1.5s ease-out'
          el.style.backgroundColor = 'rgba(34, 197, 94, 0)'
        }, 500),
        setTimeout(() => {
          el.style.backgroundColor = ''
          el.style.transition = ''
          el.style.borderRadius = ''
        }, 2100),
      ]
      return
    }
  }, [])

  useEffect(() => {
    if (!pendingScrollSection) return
    requestAnimationFrame(() => {
      scrollToSection(pendingScrollSection)
      clearPendingScrollSection()
    })
  }, [pendingScrollSection, scrollToSection, clearPendingScrollSection])

  const codeSnippetParams = useMemo<CodeSnippetParams>(
    () => ({
      state: sandboxParametersState,
      config: getSandboxParametersInfo(),
      actions: {
        useConfigObject,
        fileSystemListFilesLocationSet,
        fileSystemCreateFolderParamsSet,
        fileSystemDeleteFileRequiredParamsSet,
        useFileSystemDeleteFileRecursive,
        shellCommandExists,
        codeToRunExists,
        gitCloneOperationRequiredParamsSet,
        useGitCloneBranch,
        useGitCloneCommitId,
        useGitCloneUsername,
        useGitClonePassword,
        gitStatusOperationLocationSet,
        gitBranchesOperationLocationSet,
      },
    }),
    [
      sandboxParametersState,
      getSandboxParametersInfo,
      useConfigObject,
      fileSystemListFilesLocationSet,
      fileSystemCreateFolderParamsSet,
      fileSystemDeleteFileRequiredParamsSet,
      useFileSystemDeleteFileRecursive,
      shellCommandExists,
      codeToRunExists,
      gitCloneOperationRequiredParamsSet,
      useGitCloneBranch,
      useGitCloneCommitId,
      useGitCloneUsername,
      useGitClonePassword,
      gitStatusOperationLocationSet,
      gitBranchesOperationLocationSet,
    ],
  )

  const sandboxCodeSnippetsData = useMemo(
    () => ({
      [CodeLanguage.PYTHON]: { code: codeSnippetGenerators[CodeLanguage.PYTHON].buildFullSnippet(codeSnippetParams) },
      [CodeLanguage.TYPESCRIPT]: {
        code: codeSnippetGenerators[CodeLanguage.TYPESCRIPT].buildFullSnippet(codeSnippetParams),
      },
    }),
    [codeSnippetParams],
  )

  const runCodeSnippet = async () => {
    setIsCodeSnippetRunning(true)
    let codeSnippetOutput = '正在创建 Sandbox...\n'
    setCodeSnippetOutput(codeSnippetOutput)
    let sandbox: Sandbox | undefined

    try {
      sandbox = await createSandbox()
      codeSnippetOutput = `Sandbox 创建成功：${sandbox.id}\n`
      setCodeSnippetOutput(codeSnippetOutput)
      if (codeToRunExists) {
        setCodeSnippetOutput(codeSnippetOutput + '\n正在运行代码...')
        const codeRunResponse = await sandbox.process.codeRun(
          sandboxParametersState['codeRunParams'].languageCode as string,
        ) // codeToRunExists guarantees that value isn't undefined so we put as string to silence TS compiler
        codeSnippetOutput += `\n代码运行结果：${codeRunResponse.result}`
        setCodeSnippetOutput(codeSnippetOutput)
      }
      if (shellCommandExists) {
        setCodeSnippetOutput(codeSnippetOutput + '\n正在运行 Shell 命令...')
        const shellCommandResponse = await sandbox.process.executeCommand(
          sandboxParametersState['shellCommandRunParams'].shellCommand as string, // shellCommandExists guarantees that value isn't undefined so we put as string to silence TS compiler
        )
        codeSnippetOutput += `\nShell 命令结果：${shellCommandResponse.result}`
        setCodeSnippetOutput(codeSnippetOutput)
      }
      let codeRunShellCommandFinishedMessage = '\n'
      if (codeToRunExists && shellCommandExists) {
        codeRunShellCommandFinishedMessage += '代码和 Shell 命令执行成功。'
      } else if (codeToRunExists) {
        codeRunShellCommandFinishedMessage += '代码执行成功。'
      } else if (shellCommandExists) {
        codeRunShellCommandFinishedMessage += 'Shell 命令执行成功。'
      }
      codeSnippetOutput += codeRunShellCommandFinishedMessage + '\n'
      setCodeSnippetOutput(codeSnippetOutput)
      if (fileSystemCreateFolderParamsSet) {
        setCodeSnippetOutput(codeSnippetOutput + '\n正在创建目录...')
        await sandbox.fs.createFolder(
          sandboxParametersState['createFolderParams'].folderDestinationPath,
          sandboxParametersState['createFolderParams'].permissions,
        )
        codeSnippetOutput += '\n目录创建成功。\n'
        setCodeSnippetOutput(codeSnippetOutput)
      }
      if (fileSystemListFilesLocationSet) {
        setCodeSnippetOutput(codeSnippetOutput + '\n正在列出目录文件...')
        const files = await sandbox.fs.listFiles(sandboxParametersState['listFilesParams'].directoryPath)
        codeSnippetOutput += '\n目录内容：'
        codeSnippetOutput += '\n'
        files.forEach((file) => {
          codeSnippetOutput += `名称：${file.name}\n`
          codeSnippetOutput += `是否为目录：${file.isDir}\n`
          codeSnippetOutput += `大小：${file.size}\n`
          codeSnippetOutput += `修改时间：${file.modTime}\n`
        })
        setCodeSnippetOutput(codeSnippetOutput)
      }
      if (fileSystemDeleteFileRequiredParamsSet) {
        setCodeSnippetOutput(
          codeSnippetOutput + `\n正在删除${useFileSystemDeleteFileRecursive ? '目录' : '文件'}...`,
        )
        await sandbox.fs.deleteFile(
          sandboxParametersState['deleteFileParams'].filePath,
          useFileSystemDeleteFileRecursive || false,
        )
        codeSnippetOutput += `\n${useFileSystemDeleteFileRecursive ? '目录' : '文件'}删除成功。\n`
        setCodeSnippetOutput(codeSnippetOutput)
      }
      if (gitCloneOperationRequiredParamsSet) {
        setCodeSnippetOutput(codeSnippetOutput + '\n正在克隆仓库...')
        await sandbox.git.clone(
          sandboxParametersState['gitCloneParams'].repositoryURL,
          sandboxParametersState['gitCloneParams'].cloneDestinationPath,
          useGitCloneBranch ? sandboxParametersState['gitCloneParams'].branchToClone : undefined,
          useGitCloneCommitId ? sandboxParametersState['gitCloneParams'].commitToClone : undefined,
          useGitCloneUsername ? sandboxParametersState['gitCloneParams'].authUsername : undefined,
          useGitClonePassword ? sandboxParametersState['gitCloneParams'].authPassword : undefined,
        )
        codeSnippetOutput += '\n仓库克隆成功。\n'
        setCodeSnippetOutput(codeSnippetOutput)
      }
      if (gitStatusOperationLocationSet) {
        setCodeSnippetOutput(codeSnippetOutput + '\n正在获取仓库状态...')
        const status = await sandbox.git.status(sandboxParametersState['gitStatusParams'].repositoryPath)
        codeSnippetOutput += `\n当前分支：${status.currentBranch}\n`
        codeSnippetOutput += `领先提交数：${status.ahead}\n`
        codeSnippetOutput += `落后提交数：${status.behind}\n`
        status.fileStatus.forEach((file) => (codeSnippetOutput += `文件：${file.name}\n`))
        setCodeSnippetOutput(codeSnippetOutput)
      }
      if (gitBranchesOperationLocationSet) {
        setCodeSnippetOutput(codeSnippetOutput + '\n正在获取仓库分支...')
        const response = await sandbox.git.branches(sandboxParametersState['gitBranchesParams'].repositoryPath)
        codeSnippetOutput += '\n'
        response.branches.forEach((branch) => (codeSnippetOutput += `分支：${branch}\n`))
        setCodeSnippetOutput(codeSnippetOutput)
      }
      setCodeSnippetOutput(codeSnippetOutput + '\nSandbox 会话已完成。')
    } catch (error) {
      console.error(error)
      setCodeSnippetOutput(
        <>
          <span>{codeSnippetOutput}</span>
          <br />
          {createErrorMessageOutput(error)}
        </>,
      )
    } finally {
      setIsCodeSnippetRunning(false)
    }
  }

  const resultPanelRef = usePanelRef()

  return (
    <Window className={className}>
      <WindowTitleBar>Sandbox 代码</WindowTitleBar>
      <WindowContent className="relative">
        <Tabs
          value={codeSnippetLanguage}
          className="flex flex-col gap-4"
          onValueChange={(languageValue) => setCodeSnippetLanguage(languageValue as CodeLanguage)}
        >
          <div className="flex justify-between items-center">
            <TabsList>
              {codeSnippetSupportedLanguages.map((language) => (
                <TabsTrigger
                  key={language.value}
                  value={language.value}
                  className={cn('py-1 rounded-t-md', {
                    'bg-foreground/10': codeSnippetLanguage === language.value,
                  })}
                >
                  <div className="flex items-center text-sm">
                    <img src={language.icon} alt={`${language.label} icon`} className="w-4 h-4" />
                    <span className="ml-2 hidden xs:block">{language.label}</span>
                  </div>
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="flex items-center gap-2">
              <Button
                disabled={isCodeSnippetRunning}
                variant="outline"
                className="ml-auto"
                onClick={() => {
                  runCodeSnippet()
                  if (resultPanelRef.current?.isCollapsed()) {
                    resultPanelRef.current.resize(100)
                  }
                }}
              >
                {isCodeSnippetRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="w-4 h-4" />} 运行
              </Button>
              <TooltipButton
                tooltipText="显示结果"
                className="!px-2"
                size="icon-sm"
                variant="outline"
                onClick={() => {
                  if (resultPanelRef.current?.isCollapsed()) {
                    resultPanelRef.current.resize('20%')
                  } else {
                    resultPanelRef.current?.collapse()
                  }
                }}
              >
                <PanelBottom />
              </TooltipButton>
            </div>
          </div>
          <Group orientation="vertical" className="min-h-[500px] border-border rounded-b-md">
            <Panel minSize={'20%'}>
              <div ref={codeScrollRef} className="h-full">
                {codeSnippetSupportedLanguages.map((language) => (
                  <TabsContent
                    key={language.value}
                    value={language.value}
                    className="rounded-md h-full overflow-auto mt-0"
                  >
                    <CopyButton
                      className="absolute right-4 z-10 backdrop-blur-sm"
                      variant="ghost"
                      size="icon-sm"
                      value={sandboxCodeSnippetsData[language.value].code}
                    />
                    <ScrollArea
                      fade="mask"
                      fadeOrientation="vertical"
                      horizontal
                      className="h-full overflow-auto bg-[hsl(var(--code-background))]"
                      fadeOffset={35}
                    >
                      <CodeBlock
                        showCopy={false}
                        language={language.value}
                        code={sandboxCodeSnippetsData[language.value].code}
                        codeAreaClassName="text-sm [overflow:initial] min-w-fit h-full"
                      />
                    </ScrollArea>
                  </TabsContent>
                ))}
              </div>
            </Panel>

            <Panel maxSize="80%" minSize="20%" panelRef={resultPanelRef} collapsedSize={0} collapsible defaultSize={33}>
              <div className="bg-background w-full border rounded-md overflow-auto h-full flex flex-col">
                <div className="flex justify-between border-b px-4 pr-2 py-1 text-xs items-center bg-muted/50">
                  <div className="text-muted-foreground font-mono">结果</div>
                  <div className="flex items-center gap-2">
                    <TooltipButton
                      onClick={() => resultPanelRef.current?.resize('80%')}
                      tooltipText="最大化"
                      className="h-6 w-6"
                      size="sm"
                      variant="ghost"
                    >
                      <ChevronUpIcon className="w-4 h-4" />
                    </TooltipButton>
                    <TooltipButton
                      tooltipText="关闭"
                      className="h-6 w-6"
                      size="sm"
                      variant="ghost"
                      onClick={() => resultPanelRef.current?.collapse()}
                    >
                      <XIcon />
                    </TooltipButton>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <ResponseCard
                    responseContent={
                      codeSnippetOutput || (
                        <div className="text-muted-foreground font-mono">代码输出将显示在这里...</div>
                      )
                    }
                  />
                </div>
              </div>
            </Panel>
          </Group>
        </Tabs>
      </WindowContent>
    </Window>
  )
}

export default SandboxCodeSnippetsResponse
