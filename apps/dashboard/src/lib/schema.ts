/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { z } from 'zod'

const IMAGE_NAME_REGEX = /^[a-zA-Z0-9_.\-:]+(\/[a-zA-Z0-9_.\-:]+)*(@sha256:[a-f0-9]{64})?$/
const IMAGE_TAG_OR_DIGEST_REGEX = /^[^@]+@sha256:[a-f0-9]{64}$|^(?!.*@sha256:).*:.+$/

export const imageNameSchema = z
  .string()
  .min(1, '镜像名称为必填项')
  .refine((name) => IMAGE_NAME_REGEX.test(name), '仅允许字母、数字、点、冒号、斜杠和连字符')
  .refine(
    (name) => IMAGE_TAG_OR_DIGEST_REGEX.test(name),
    'Image must include a tag (e.g., ubuntu:22.04) or digest (@sha256:...)',
  )
  .refine((name) => !name.endsWith(':latest'), '不允许使用标签为 ":latest" 的镜像')
