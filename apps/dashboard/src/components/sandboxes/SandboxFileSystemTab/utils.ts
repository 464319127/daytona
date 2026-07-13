/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { handleApiError } from '@/lib/error-handling'
import { downloadBlob } from '@/lib/utils'
import { FileInfo } from '@daytona/toolbox-api-client'
import { Buffer } from 'buffer'
import { format } from 'date-fns'
import { toast } from 'sonner'

import { ROOT_NODE, ROOT_PATH } from './constants'
import type { SandboxFileSystemNode, SandboxInstance } from './types'

export type FileSystemError = {
  errorCode?: string
  message?: string
  path?: string
  statusCode?: number
}

export function getFileSystemError(error: unknown): FileSystemError | null {
  return error && typeof error === 'object' ? (error as FileSystemError) : null
}

export function isFileReadFailedError(error: unknown) {
  return getFileSystemError(error)?.errorCode === 'FILE_READ_FAILED'
}

export function isForbiddenFileSystemError(error: unknown) {
  return getFileSystemError(error)?.statusCode === 403
}

export function shouldRetryFileSystemQuery(failureCount: number, error: unknown) {
  return !isForbiddenFileSystemError(error) && !isFileReadFailedError(error) && failureCount < 3
}

export async function downloadSandboxFile({
  node,
  sandboxInstance,
}: {
  node: SandboxFileSystemNode
  sandboxInstance: SandboxInstance
}) {
  if (node.isDir) {
    return
  }

  try {
    const fileContents = Buffer.from(await sandboxInstance.fs.downloadFile(node.path))
    downloadBlob(new Blob([fileContents]), node.name || 'download')
    toast.success(`已下载 ${node.name || node.path}`)
  } catch (error) {
    handleFileSystemApiError(error, `下载 ${node.path} 失败`)
  }
}

export function handleFileSystemApiError(error: unknown, fallbackMessage: string, options?: { toastId?: string }) {
  const fileSystemError = getFileSystemError(error)

  if (isForbiddenFileSystemError(error)) {
    toast.error(fileSystemError?.path ? `无权访问 ${fileSystemError.path}` : '访问被拒绝', {
      ...(options?.toastId ? { id: options.toastId } : {}),
      description: fileSystemError?.message ?? '你无权访问此 Sandbox 中的该位置。',
    })
    return
  }

  if (isFileReadFailedError(error)) {
    toast.error(fileSystemError?.path ? `读取 ${fileSystemError.path} 失败` : fallbackMessage, {
      ...(options?.toastId ? { id: options.toastId } : {}),
      description:
        fileSystemError?.message ??
        '无法在 Sandbox 中打开该文件。文件可能已不存在或无法读取。',
    })
    return
  }

  handleApiError(error, fallbackMessage, options)
}

export function createFallbackNode(path: string): SandboxFileSystemNode {
  if (path === ROOT_PATH) {
    return ROOT_NODE
  }

  const name = path.split('/').filter(Boolean).at(-1) ?? path

  return {
    group: '',
    id: path,
    isDir: false,
    modTime: '',
    mode: '',
    name,
    owner: '',
    path,
    permissions: '',
    size: 0,
  }
}

export function joinSandboxPath(parentPath: string, name: string) {
  return parentPath === ROOT_PATH ? `/${name}` : `${parentPath}/${name}`
}

export function getParentPath(path: string) {
  const segments = path.split('/').filter(Boolean)
  if (segments.length <= 1) {
    return ROOT_PATH
  }

  return `/${segments.slice(0, -1).join('/')}`
}

export function getAncestorPaths(path: string) {
  const segments = path.split('/').filter(Boolean)
  return segments.map((_, index) => `/${segments.slice(0, index + 1).join('/')}`)
}

export function isSameOrDescendantPath(path: string, parentPath: string) {
  if (parentPath === ROOT_PATH) {
    return path.startsWith(ROOT_PATH)
  }

  return path === parentPath || path.startsWith(`${parentPath}/`)
}

export function sortEntries(entries: FileInfo[]) {
  return [...entries].sort((a, b) => {
    if (a.isDir !== b.isDir) {
      return a.isDir ? -1 : 1
    }

    return a.name.localeCompare(b.name)
  })
}

export function toNode(parentPath: string, file: FileInfo): SandboxFileSystemNode {
  const path = joinSandboxPath(parentPath, file.name)

  return {
    ...file,
    id: path,
    path,
  }
}

export function getCanvasFont(element: HTMLElement) {
  const computedStyle = window.getComputedStyle(element)
  return (
    computedStyle.font ||
    `${computedStyle.fontStyle} ${computedStyle.fontWeight} ${computedStyle.fontSize} ${computedStyle.fontFamily}`
  )
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 1024) {
    return `${bytes} B`
  }

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

export function formatModTime(modTime: string) {
  if (!modTime) {
    return '未知'
  }

  const date = new Date(modTime)
  if (Number.isNaN(date.getTime())) {
    return modTime
  }

  return format(date, 'yyyy-MM-dd HH:mm:ss')
}

export function formatLsModTime(modTime: string) {
  if (!modTime) {
    return 'unknown'
  }

  const date = new Date(modTime)
  if (Number.isNaN(date.getTime())) {
    return modTime
  }

  return format(date, 'MMM dd HH:mm')
}

export function getNodeMetaLine(node: SandboxFileSystemNode) {
  const segments = [node.isDir ? '目录' : '文件']

  if (!node.isDir) {
    segments.push(formatBytes(node.size))
  }

  segments.push(formatModTime(node.modTime))

  return segments.join(' • ')
}

export function isProbablyBinary(buffer: Buffer) {
  const sampleSize = Math.min(buffer.length, 1024)

  for (let index = 0; index < sampleSize; index += 1) {
    if (buffer[index] === 0) {
      return true
    }
  }

  return false
}

export function getImageMimeType(path: string) {
  const extension = path.split('.').at(-1)?.toLowerCase()

  switch (extension) {
    case 'apng':
      return 'image/apng'
    case 'avif':
      return 'image/avif'
    case 'gif':
      return 'image/gif'
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'svg':
      return 'image/svg+xml'
    case 'webp':
      return 'image/webp'
    case 'bmp':
      return 'image/bmp'
    default:
      return null
  }
}

export function getCodeLanguage(path: string) {
  const filename = path.split('/').at(-1)?.toLowerCase() ?? ''
  const extension = filename.includes('.') ? filename.split('.').at(-1) : ''

  switch (extension) {
    case 'c':
      return 'c'
    case 'cc':
    case 'cpp':
    case 'cxx':
    case 'hpp':
    case 'hxx':
      return 'cpp'
    case 'cs':
      return 'csharp'
    case 'css':
      return 'css'
    case 'go':
      return 'go'
    case 'h':
      return 'c'
    case 'html':
    case 'htm':
      return 'markup'
    case 'java':
      return 'java'
    case 'js':
    case 'cjs':
    case 'mjs':
      return 'javascript'
    case 'json':
      return 'json'
    case 'jsx':
      return 'jsx'
    case 'kt':
    case 'kts':
      return 'kotlin'
    case 'md':
      return 'markdown'
    case 'php':
      return 'php'
    case 'py':
      return 'python'
    case 'rb':
      return 'ruby'
    case 'rs':
      return 'rust'
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'bash'
    case 'sql':
      return 'sql'
    case 'swift':
      return 'swift'
    case 'toml':
      return 'toml'
    case 'ts':
      return 'typescript'
    case 'tsx':
      return 'tsx'
    case 'xml':
      return 'markup'
    case 'yaml':
    case 'yml':
      return 'yaml'
    default:
      break
  }

  if (filename === 'dockerfile') {
    return 'docker'
  }

  if (filename === 'makefile') {
    return 'makefile'
  }

  return null
}
