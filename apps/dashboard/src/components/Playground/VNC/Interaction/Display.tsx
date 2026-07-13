/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import {
  PlaygroundActionFormDataBasic,
  PlaygroundActionInvokeApi,
  VNCInteractionOptionsSectionComponentProps,
} from '@/contexts/PlaygroundContext'
import { DisplayActions } from '@/enums/Playground'
import { usePlayground } from '@/hooks/usePlayground'
import { DisplayInfoResponse, WindowsResponse } from '@daytona/api-client'
import { ComputerUse } from '@daytona/sdk'
import PlaygroundActionForm from '../../ActionForm'

const VNCDisplayOperations: React.FC<VNCInteractionOptionsSectionComponentProps> = ({
  disableActions,
  ComputerUseClient,
  wrapVNCInvokeApi,
}) => {
  const { runPlaygroundActionWithoutParams, setVNCInteractionOptionsParamValue } = usePlayground()

  const displayActionsFormData: PlaygroundActionFormDataBasic<DisplayActions>[] = [
    {
      methodName: DisplayActions.GET_INFO,
      label: 'getInfo()',
      description: '获取显示器信息',
    },
    {
      methodName: DisplayActions.GET_WINDOWS,
      label: 'getWindows()',
      description: '获取已打开窗口列表',
    },
  ]

  // Disable logic ensures that this method is called when ComputerUseClient exists -> we use as ComputerUse to silence TS compiler
  const displayActionAPICall: PlaygroundActionInvokeApi = async (displayActionFormData) => {
    const displayActionResponse = await (ComputerUseClient as ComputerUse).display[
      displayActionFormData.methodName as DisplayActions
    ]()
    let displayActionResponseText = ''
    switch (displayActionFormData.methodName) {
      case DisplayActions.GET_INFO: {
        const displayInfoResponse = displayActionResponse as DisplayInfoResponse
        type Display = {
          width: number
          height: number
          x: number
          y: number
        }
        ;(displayInfoResponse.displays as Display[]).forEach((display, index) => {
          displayActionResponseText += `显示器 ${index}：${display.width}x${display.height}，位置 ${display.x},${display.y}\n`
        })
        break
      }
      case DisplayActions.GET_WINDOWS: {
        const displayWindowsResponse = displayActionResponse as WindowsResponse
        displayActionResponseText += `找到 ${displayWindowsResponse.windows.length} 个已打开窗口：\n`
        type Window = {
          title: string
          id: string
        }
        ;(displayWindowsResponse.windows as Window[]).forEach((window) => {
          displayActionResponseText += `- ${window.title} (ID: ${window.id})\n`
        })
        break
      }
    }
    setVNCInteractionOptionsParamValue('responseContent', displayActionResponseText)
  }

  return (
    <div className="flex flex-col gap-6">
      {displayActionsFormData.map((displayActionFormData) => (
        <div key={displayActionFormData.methodName} className="space-y-4">
          <PlaygroundActionForm<DisplayActions>
            actionFormItem={displayActionFormData}
            onRunActionClick={() =>
              runPlaygroundActionWithoutParams(displayActionFormData, wrapVNCInvokeApi(displayActionAPICall))
            }
            disable={disableActions}
          />
        </div>
      ))}
    </div>
  )
}

export default VNCDisplayOperations
