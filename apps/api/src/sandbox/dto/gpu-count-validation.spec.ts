/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { CreateSandboxDto } from './create-sandbox.dto'
import { CreateSnapshotDto } from './create-snapshot.dto'

describe.each([
  ['sandbox', CreateSandboxDto, {}],
  ['snapshot', CreateSnapshotDto, { name: 'gpu-snapshot' }],
])('%s GPU count validation', (_name, Dto, requiredFields) => {
  it.each([0, 1, 2, 4, 8])('accepts gpu=%i', async (gpu) => {
    const dto = plainToInstance(Dto, { ...requiredFields, gpu })
    const errors = await validate(dto)

    expect(errors.find((error) => error.property === 'gpu')).toBeUndefined()
  })

  it.each([-1, 1.5, '2'])('rejects gpu=%p', async (gpu) => {
    const dto = plainToInstance(Dto, { ...requiredFields, gpu })
    const errors = await validate(dto)

    expect(errors.find((error) => error.property === 'gpu')).toBeDefined()
  })
})
