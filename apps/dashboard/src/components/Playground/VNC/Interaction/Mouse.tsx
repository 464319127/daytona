/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import {
  MouseActionFormData,
  MouseClick,
  MouseDrag,
  MouseMove,
  MouseScroll,
  NumberParameterFormItem,
  ParameterFormData,
  ParameterFormItem,
  PlaygroundActionFormDataBasic,
  PlaygroundActionInvokeApi,
  VNCInteractionOptionsSectionComponentProps,
} from '@/contexts/PlaygroundContext'
import { MouseActions, MouseButton, MouseScrollDirection } from '@/enums/Playground'
import { usePlayground } from '@/hooks/usePlayground'
import { ComputerUse } from '@daytona/sdk'
import React from 'react'
import PlaygroundActionForm from '../../ActionForm'
import FormCheckboxInput from '../../Inputs/CheckboxInput'
import InlineInputFormControl from '../../Inputs/InlineInputFormControl'
import FormNumberInput from '../../Inputs/NumberInput'
import FormSelectInput from '../../Inputs/SelectInput'

const mouseButtonFormData: ParameterFormItem & { key: 'button' } = {
  label: '按键',
  key: 'button',
  placeholder: '选择鼠标按键',
}

type MouseActionWithParamsFormData = MouseActionFormData<MouseClick | MouseDrag | MouseMove | MouseScroll>

const VNCMouseOperations: React.FC<VNCInteractionOptionsSectionComponentProps> = ({
  disableActions,
  ComputerUseClient,
  wrapVNCInvokeApi,
}) => {
  const {
    VNCInteractionOptionsParamsState,
    setVNCInteractionOptionsParamValue,
    playgroundActionParamValueSetter,
    runPlaygroundActionWithParams,
    runPlaygroundActionWithoutParams,
  } = usePlayground()
  const mouseClickParams = VNCInteractionOptionsParamsState['mouseClickParams']
  const mouseDragParams = VNCInteractionOptionsParamsState['mouseDragParams']
  const mouseMoveParams = VNCInteractionOptionsParamsState['mouseMoveParams']
  const mouseScrollParams = VNCInteractionOptionsParamsState['mouseScrollParams']

  const mouseClickNumberParamsFormData: (NumberParameterFormItem & { key: 'x' | 'y' })[] = [
    { label: 'X 坐标', key: 'x', min: 0, max: Infinity, placeholder: '100', required: true },
    { label: 'Y 坐标', key: 'y', min: 0, max: Infinity, placeholder: '100', required: true },
  ]

  const mouseDoubleClickFormData: ParameterFormItem & { key: 'double' } = {
    label: '双击',
    key: 'double',
    placeholder: '是否双击鼠标',
  }

  const mouseClickParamsFormData: ParameterFormData<MouseClick> = [
    ...mouseClickNumberParamsFormData,
    mouseButtonFormData,
    mouseDoubleClickFormData,
  ]

  const mouseDragNumberParamsFormData: (NumberParameterFormItem & { key: 'startX' | 'startY' | 'endX' | 'endY' })[] = [
    { label: '起点 X', key: 'startX', min: 0, max: Infinity, placeholder: '100', required: true },
    { label: '起点 Y', key: 'startY', min: 0, max: Infinity, placeholder: '100', required: true },
    { label: '终点 X', key: 'endX', min: 0, max: Infinity, placeholder: '100', required: true },
    { label: '终点 Y', key: 'endY', min: 0, max: Infinity, placeholder: '100', required: true },
  ]
  const mouseDragParamsFormData: ParameterFormData<MouseDrag> = [...mouseDragNumberParamsFormData, mouseButtonFormData]

  const mouseMoveNumberParamsFormData: (NumberParameterFormItem & { key: 'x' | 'y' })[] = [
    { label: 'X 坐标', key: 'x', min: 0, max: Infinity, placeholder: '100', required: true },
    { label: 'Y 坐标', key: 'y', min: 0, max: Infinity, placeholder: '100', required: true },
  ]
  const mouseMoveParamsFormData: ParameterFormData<MouseMove> = mouseMoveNumberParamsFormData

  const mouseScrollNumberParamsFormData: (NumberParameterFormItem & { key: 'x' | 'y' })[] = [
    { label: 'X 坐标', key: 'x', min: 0, max: Infinity, placeholder: '100', required: true },
    { label: 'Y 坐标', key: 'y', min: 0, max: Infinity, placeholder: '100', required: true },
  ]

  const mouseScrollDirectionFormData: ParameterFormItem & { key: 'direction' } = {
    label: '滚动方向',
    key: 'direction',
    placeholder: '鼠标滚动方向',
  }

  const mouseScrollDirectionOptions = [
    {
      value: MouseScrollDirection.DOWN,
      label: '向下',
    },
    {
      value: MouseScrollDirection.UP,
      label: '向上',
    },
  ]

  const mouseScrollAmountFormData: NumberParameterFormItem & { key: 'amount' } = {
    label: '滚动量',
    key: 'amount',
    placeholder: '鼠标滚动量',
    min: 1,
    max: Infinity,
  }

  const mouseScrollParamsFormData: ParameterFormData<MouseScroll> = [
    ...mouseScrollNumberParamsFormData,
    mouseScrollDirectionFormData,
    mouseScrollAmountFormData,
  ]

  const mouseActionsWithParamsFormData: MouseActionWithParamsFormData[] = [
    {
      methodName: MouseActions.CLICK,
      label: 'click()',
      description: '在指定坐标单击鼠标',
      parametersFormItems: mouseClickParamsFormData,
      parametersState: mouseClickParams,
      onChangeParamsValidationDisabled: true,
    },
    {
      methodName: MouseActions.DRAG,
      label: 'drag()',
      description: '将鼠标从起点坐标拖动到终点坐标',
      parametersFormItems: mouseDragParamsFormData,
      parametersState: mouseDragParams,
      onChangeParamsValidationDisabled: true,
    },
    {
      methodName: MouseActions.MOVE,
      label: 'move()',
      description: '将鼠标光标移动到指定坐标',
      parametersFormItems: mouseMoveParamsFormData,
      parametersState: mouseMoveParams,
      onChangeParamsValidationDisabled: true,
    },
    // {
    //   methodName: MouseActions.SCROLL,
    //   label: 'scroll()',
    //   description: 'Scrolls the mouse wheel at the specified coordinates',
    //   parametersFormItems: mouseScrollParamsFormData,
    //   parametersState: mouseScrollParams,
    //   onChangeParamsValidationDisabled: true,
    // },
  ]

  const mouseActionsWithoutParamsFormData: PlaygroundActionFormDataBasic<MouseActions>[] = [
    {
      methodName: MouseActions.GET_POSITION,
      label: 'getPosition()',
      description: '获取当前鼠标光标位置',
    },
  ]

  // Disable logic ensures that this method is called when ComputerUseClient exists -> we use as ComputerUse to silence TS compiler
  const mouseActionAPICall: PlaygroundActionInvokeApi = async (mouseActionFormData) => {
    const MouseActionsClient = (ComputerUseClient as ComputerUse).mouse
    let mouseActionResponseText = ''
    switch (mouseActionFormData.methodName) {
      case MouseActions.CLICK: {
        const mouseClickResponse = await MouseActionsClient[MouseActions.CLICK](
          mouseClickParams.x,
          mouseClickParams.y,
          mouseClickParams.button ?? undefined,
          mouseClickParams.double,
        )
        mouseActionResponseText = `鼠标已在 (${mouseClickResponse.x}, ${mouseClickResponse.y}) 单击`
        break
      }
      case MouseActions.DRAG: {
        const mouseDragResponse = await MouseActionsClient[MouseActions.DRAG](
          mouseDragParams.startX,
          mouseDragParams.startY,
          mouseDragParams.endX,
          mouseDragParams.endY,
          mouseDragParams.button ?? undefined,
        )
        mouseActionResponseText = `鼠标拖动结束于 (${mouseDragResponse.x}, ${mouseDragResponse.y})`
        break
      }
      case MouseActions.MOVE: {
        const mouseMoveResponse = await MouseActionsClient[MouseActions.MOVE](mouseMoveParams.x, mouseMoveParams.y)
        mouseActionResponseText = `鼠标已移动到 (${mouseMoveResponse.x}, ${mouseMoveResponse.y})`
        break
      }
      case MouseActions.SCROLL: {
        // The scroll promise never resolves, so we don't await it
        const mouseScrollResponse = MouseActionsClient[MouseActions.SCROLL](
          mouseScrollParams.x,
          mouseScrollParams.y,
          mouseScrollParams.direction,
          mouseScrollParams.amount ?? undefined,
        )
        mouseActionResponseText = (await mouseScrollResponse)
          ? `Mouse scrolled ${mouseScrollParams.direction} at (${mouseScrollParams.x}, ${mouseScrollParams.y}) by ${mouseScrollParams.amount ?? 1}`
          : `Failed to scroll ${mouseScrollParams.direction} at (${mouseScrollParams.x}, ${mouseScrollParams.y})`
        break
      }
      case MouseActions.GET_POSITION: {
        const mousePositionResponse = await MouseActionsClient[MouseActions.GET_POSITION]()
        mouseActionResponseText = `鼠标位于 (${mousePositionResponse.x}, ${mousePositionResponse.y})`
        break
      }
    }
    setVNCInteractionOptionsParamValue('responseContent', mouseActionResponseText)
  }

  return (
    <div className="flex flex-col gap-6">
      {mouseActionsWithParamsFormData.map((mouseActionFormData) => (
        <div key={mouseActionFormData.methodName} className="space-y-4">
          <PlaygroundActionForm<MouseActions>
            actionFormItem={mouseActionFormData}
            onRunActionClick={() =>
              runPlaygroundActionWithParams(mouseActionFormData, wrapVNCInvokeApi(mouseActionAPICall))
            }
            disable={disableActions}
          />
          <div className="space-y-2">
            {mouseActionFormData.methodName === MouseActions.CLICK && (
              <>
                {mouseClickNumberParamsFormData.map((mouseClickNumberParamFormItem) => (
                  <InlineInputFormControl
                    key={mouseClickNumberParamFormItem.key}
                    formItem={mouseClickNumberParamFormItem}
                  >
                    <FormNumberInput
                      numberValue={mouseClickParams[mouseClickNumberParamFormItem.key]}
                      numberFormItem={mouseClickNumberParamFormItem}
                      onChangeHandler={(value) =>
                        playgroundActionParamValueSetter(
                          mouseActionFormData,
                          mouseClickNumberParamFormItem,
                          'mouseClickParams',
                          value,
                        )
                      }
                    />
                  </InlineInputFormControl>
                ))}
                <MouseButtonSelect<MouseClick>
                  mouseActionFormData={mouseActionFormData}
                  paramsStateObject={mouseClickParams}
                  contextParamsPropertyName="mouseClickParams"
                />
                <InlineInputFormControl formItem={mouseDoubleClickFormData}>
                  <FormCheckboxInput
                    checkedValue={mouseClickParams[mouseDoubleClickFormData.key as 'double']}
                    formItem={mouseDoubleClickFormData}
                    onChangeHandler={(checked) =>
                      playgroundActionParamValueSetter(
                        mouseActionFormData,
                        mouseDoubleClickFormData,
                        'mouseClickParams',
                        checked,
                      )
                    }
                  />
                </InlineInputFormControl>
              </>
            )}
            {mouseActionFormData.methodName === MouseActions.DRAG && (
              <>
                {mouseDragNumberParamsFormData.map((mouseDragNumberParamFormItem) => (
                  <InlineInputFormControl
                    key={mouseDragNumberParamFormItem.key}
                    formItem={mouseDragNumberParamFormItem}
                  >
                    <FormNumberInput
                      numberValue={mouseDragParams[mouseDragNumberParamFormItem.key]}
                      numberFormItem={mouseDragNumberParamFormItem}
                      onChangeHandler={(value) =>
                        playgroundActionParamValueSetter(
                          mouseActionFormData,
                          mouseDragNumberParamFormItem,
                          'mouseDragParams',
                          value,
                        )
                      }
                    />
                  </InlineInputFormControl>
                ))}
                <MouseButtonSelect<MouseDrag>
                  mouseActionFormData={mouseActionFormData}
                  paramsStateObject={mouseDragParams}
                  contextParamsPropertyName="mouseDragParams"
                />
              </>
            )}
            {mouseActionFormData.methodName === MouseActions.MOVE && (
              <>
                {mouseMoveNumberParamsFormData.map((mouseMoveNumberParamFormItem) => (
                  <InlineInputFormControl
                    key={mouseMoveNumberParamFormItem.key}
                    formItem={mouseMoveNumberParamFormItem}
                  >
                    <FormNumberInput
                      numberValue={mouseMoveParams[mouseMoveNumberParamFormItem.key]}
                      numberFormItem={mouseMoveNumberParamFormItem}
                      onChangeHandler={(value) =>
                        playgroundActionParamValueSetter(
                          mouseActionFormData,
                          mouseMoveNumberParamFormItem,
                          'mouseMoveParams',
                          value,
                        )
                      }
                    />
                  </InlineInputFormControl>
                ))}
              </>
            )}
            {mouseActionFormData.methodName === MouseActions.SCROLL && (
              <>
                {mouseScrollNumberParamsFormData.map((mouseScrollNumberParamFormItem) => (
                  <InlineInputFormControl
                    key={mouseScrollNumberParamFormItem.key}
                    formItem={mouseScrollNumberParamFormItem}
                  >
                    <FormNumberInput
                      numberValue={mouseScrollParams[mouseScrollNumberParamFormItem.key]}
                      numberFormItem={mouseScrollNumberParamFormItem}
                      onChangeHandler={(value) =>
                        playgroundActionParamValueSetter(
                          mouseActionFormData,
                          mouseScrollNumberParamFormItem,
                          'mouseScrollParams',
                          value,
                        )
                      }
                    />
                  </InlineInputFormControl>
                ))}
                <InlineInputFormControl formItem={mouseScrollDirectionFormData}>
                  <FormSelectInput
                    selectOptions={mouseScrollDirectionOptions}
                    selectValue={mouseScrollParams[mouseScrollDirectionFormData.key]}
                    formItem={mouseScrollDirectionFormData}
                    onChangeHandler={(value) =>
                      playgroundActionParamValueSetter(
                        mouseActionFormData,
                        mouseScrollDirectionFormData,
                        'mouseScrollParams',
                        value,
                      )
                    }
                  />
                </InlineInputFormControl>
                <InlineInputFormControl formItem={mouseScrollAmountFormData}>
                  <FormNumberInput
                    numberValue={mouseScrollParams[mouseScrollAmountFormData.key]}
                    numberFormItem={mouseScrollAmountFormData}
                    onChangeHandler={(value) =>
                      playgroundActionParamValueSetter(
                        mouseActionFormData,
                        mouseScrollAmountFormData,
                        'mouseScrollParams',
                        value,
                      )
                    }
                  />
                </InlineInputFormControl>
              </>
            )}
          </div>
        </div>
      ))}
      {mouseActionsWithoutParamsFormData.map((mouseActionFormData) => (
        <div key={mouseActionFormData.methodName} className="space-y-4">
          <PlaygroundActionForm<MouseActions>
            actionFormItem={mouseActionFormData}
            onRunActionClick={() =>
              runPlaygroundActionWithoutParams(mouseActionFormData, wrapVNCInvokeApi(mouseActionAPICall))
            }
            disable={disableActions}
          />
        </div>
      ))}
    </div>
  )
}

type MouseButtonSelectProps<T> = {
  mouseActionFormData: MouseActionWithParamsFormData
  paramsStateObject: T
  contextParamsPropertyName: 'mouseClickParams' | 'mouseDragParams'
}

const MouseButtonSelect = <T extends MouseClick | MouseDrag>({
  mouseActionFormData,
  paramsStateObject,
  contextParamsPropertyName,
}: MouseButtonSelectProps<T>) => {
  const { playgroundActionParamValueSetter } = usePlayground()

  const mouseButtonOptions = [
    {
      value: MouseButton.LEFT,
      label: '左键',
    },
    {
      value: MouseButton.MIDDLE,
      label: '中键',
    },
    {
      value: MouseButton.RIGHT,
      label: '右键',
    },
  ]

  return (
    <InlineInputFormControl formItem={mouseButtonFormData}>
      <FormSelectInput
        selectOptions={mouseButtonOptions}
        selectValue={paramsStateObject[mouseButtonFormData.key as 'button']}
        formItem={mouseButtonFormData}
        onChangeHandler={(value) =>
          playgroundActionParamValueSetter(mouseActionFormData, mouseButtonFormData, contextParamsPropertyName, value)
        }
      />
    </InlineInputFormControl>
  )
}

export default VNCMouseOperations
