/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import type { ReactNode } from 'react'
import awsIcon from '@/assets/aws.svg'
import dockerIcon from '@/assets/docker.svg'
import githubIcon from '@/assets/github.svg'
import googleIcon from '@/assets/google.svg'
import { DAYTONA_DOCS_URL } from './ExternalLinks'

export type RegistryProvider = 'generic' | 'dockerhub' | 'gcp' | 'ghcr' | 'ecr'

export const REGISTRY_PROVIDER_VALUES: readonly RegistryProvider[] = [
  'generic',
  'dockerhub',
  'gcp',
  'ghcr',
  'ecr',
] as const

// Full names — used for aria-label / tooltip / Zod error messages.
export const REGISTRY_PROVIDER_LABELS: Record<RegistryProvider, string> = {
  generic: '通用',
  dockerhub: 'Docker Hub',
  gcp: 'Google Artifact Registry',
  ghcr: 'GitHub Container Registry',
  ecr: 'Amazon ECR',
}

// Tab content — text for "generic" (no universal icon), brand SVG for the rest.
// Mono-color marks (GitHub, AWS-orange-on-dark) get `dark:invert` so they stay
// legible across themes; the multi-color marks render as-is.
const ICON_CLASS = 'h-4 w-4'
export const REGISTRY_PROVIDER_TAB_CONTENT: Record<RegistryProvider, ReactNode> = {
  generic: '通用',
  dockerhub: <img src={dockerIcon} alt="" className={ICON_CLASS} />,
  gcp: <img src={googleIcon} alt="" className={ICON_CLASS} />,
  ghcr: <img src={githubIcon} alt="" className={`${ICON_CLASS} dark:invert`} />,
  ecr: <img src={awsIcon} alt="" className={ICON_CLASS} />,
}

export interface ProviderFieldSpec {
  label: string
  // Skip rendering. Submit uses `defaultValue` (or empty) as the payload.
  hidden?: boolean
  // Reject empty input on submit. Has no effect when hidden.
  required?: boolean
  placeholder?: string
  // Visible: initial value populated on tab switch. Hidden: value sent on submit.
  defaultValue?: string
  readOnly?: boolean
  multiline?: boolean
  // Render as masked input with an eye toggle. Ignored when multiline.
  secret?: boolean
  helper?: ReactNode
}

export interface ProviderFormSpec {
  url: ProviderFieldSpec
  username: ProviderFieldSpec
  password: ProviderFieldSpec
  project: ProviderFieldSpec
}

export const REGISTRY_PROVIDER_SPECS: Record<RegistryProvider, ProviderFormSpec> = {
  generic: {
    url: {
      label: '镜像仓库 URL',
      placeholder: 'https://registry.example.com',
      helper: '留空时默认为 docker.io。',
    },
    username: { required: true, label: '用户名' },
    password: { required: true, label: '密码', secret: true },
    project: {
      label: '项目',
      placeholder: 'my-project',
      helper: 'Docker Hub 私有仓库可留空。',
    },
  },
  dockerhub: {
    // Always docker.io — auto-filled, no input.
    url: { hidden: true, label: '镜像仓库 URL', defaultValue: 'docker.io' },
    username: {
      required: true,
      label: '用户名',
      helper: '你的 Docker Hub 用户名。',
    },
    password: {
      required: true,
      label: '个人访问令牌',
      secret: true,
      helper: (
        <>
          请使用{' '}
          <a href="https://docs.docker.com/security/access-tokens/" target="_blank" rel="noopener noreferrer">
            Docker Hub PAT
          </a>
          ，不要使用账号密码。
        </>
      ),
    },
    project: { hidden: true, label: '项目' },
  },
  gcp: {
    url: {
      required: true,
      label: '镜像仓库 URL',
      placeholder: 'https://us-central1-docker.pkg.dev',
      helper: '所在区域的基础 URL。',
    },
    // Always _json_key for service-account auth — auto-filled, no input.
    username: { hidden: true, label: '用户名', defaultValue: '_json_key' },
    password: {
      required: true,
      label: '服务账号 JSON 密钥',
      multiline: true,
      placeholder: '{\n  "type": "service_account",\n  ...\n}',
      helper: '粘贴服务账号密钥 JSON 文件的完整内容。',
    },
    project: {
      label: 'Google Cloud 项目 ID',
      placeholder: 'my-gcp-project',
      helper: '你的 GCP 项目 ID。',
    },
  },
  ghcr: {
    // Always ghcr.io — auto-filled, no input.
    url: { hidden: true, label: '镜像仓库 URL', defaultValue: 'ghcr.io' },
    username: {
      required: true,
      label: 'GitHub 用户名',
      helper: '拥有该镜像访问权限的账号。',
    },
    password: {
      required: true,
      label: '个人访问令牌',
      secret: true,
      helper: (
        <>
          使用具有{' '}
          <a
            href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub PAT
          </a>{' '}
          ，并授予 <code>read:packages</code> 权限。
        </>
      ),
    },
    project: { hidden: true, label: '项目' },
  },
  ecr: {
    url: {
      required: true,
      label: '镜像仓库 URL',
      placeholder: '123456789012.dkr.ecr.us-east-1.amazonaws.com',
    },
    username: {
      required: true,
      label: '角色 ARN',
      placeholder: 'arn:aws:iam::123456789012:role/daytona-ecr-puller',
      helper: (
        <>
          Daytona 会在每次拉取时担任此角色。{' '}
          <a
            href={`${DAYTONA_DOCS_URL}/snapshots#amazon-elastic-container-registry-ecr`}
            target="_blank"
            rel="noopener noreferrer"
          >
            设置角色 ↗
          </a>
        </>
      ),
    },
    password: { hidden: true, label: '密码' },
    project: { hidden: true, label: '项目' },
  },
}
