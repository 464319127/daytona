/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { WebhookEvent } from '@daytona/api-client'

export const WEBHOOK_EVENTS: Array<{ value: WebhookEvent; label: string; category: string }> = [
  { value: WebhookEvent.SANDBOX_CREATED, label: 'Sandbox 已创建', category: 'Sandbox' },
  { value: WebhookEvent.SANDBOX_STATE_UPDATED, label: 'Sandbox 状态已更新', category: 'Sandbox' },
  { value: WebhookEvent.SNAPSHOT_CREATED, label: 'Snapshot 已创建', category: 'Snapshot' },
  { value: WebhookEvent.SNAPSHOT_REMOVED, label: 'Snapshot 已移除', category: 'Snapshot' },
  { value: WebhookEvent.SNAPSHOT_STATE_UPDATED, label: 'Snapshot 状态已更新', category: 'Snapshot' },
  { value: WebhookEvent.VOLUME_CREATED, label: '存储卷已创建', category: '存储卷' },
  { value: WebhookEvent.VOLUME_STATE_UPDATED, label: '存储卷状态已更新', category: '存储卷' },
] as const

export const WEBHOOK_EVENT_CATEGORIES = ['Sandbox', 'Snapshot', '存储卷'] as const

export type WebhookEventValue = (typeof WEBHOOK_EVENTS)[number]['value']
export type WebhookEventCategory = (typeof WEBHOOK_EVENT_CATEGORIES)[number]
