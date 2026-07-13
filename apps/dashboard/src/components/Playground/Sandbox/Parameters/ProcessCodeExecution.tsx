/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import CodeBlock from '@/components/CodeBlock'
import {
  CodeRunParams,
  ParameterFormItem,
  ProcessCodeExecutionOperationsActionFormData,
  ShellCommandRunParams,
} from '@/contexts/PlaygroundContext'
import { ProcessCodeExecutionActions } from '@/enums/Playground'
import { usePlayground } from '@/hooks/usePlayground'
import { CodeLanguage } from '@daytona/sdk'
import PlaygroundActionForm from '../../ActionForm'
import StackedInputFormControl from '../../Inputs/StackedInputFormControl'

const SandboxProcessCodeExecution: React.FC = () => {
  const { sandboxParametersState, setSandboxParameterValue } = usePlayground()
  const codeRunParams = sandboxParametersState['codeRunParams']
  const shellCommandRunParams = sandboxParametersState['shellCommandRunParams']

  const codeRunLanguageCodeFormData: ParameterFormItem & { key: 'languageCode' } = {
    label: '要执行的代码',
    key: 'languageCode',
    placeholder: '输入要在 Sandbox 中执行的代码',
    required: true,
  }

  const shellCommandFormData: ParameterFormItem & { key: 'shellCommand' } = {
    label: 'Shell 命令',
    key: 'shellCommand',
    placeholder: '输入要在 Sandbox 中运行的 Shell 命令',
    required: true,
  }

  const processCodeExecutionActionsFormData: ProcessCodeExecutionOperationsActionFormData<
    CodeRunParams | ShellCommandRunParams
  >[] = [
    {
      methodName: ProcessCodeExecutionActions.CODE_RUN,
      label: 'codeRun()',
      description: '使用相应语言运行时在 Sandbox 中执行代码',
      parametersFormItems: [codeRunLanguageCodeFormData],
      parametersState: codeRunParams,
    },
    {
      methodName: ProcessCodeExecutionActions.SHELL_COMMANDS_RUN,
      label: 'executeCommand()',
      description: '在 Sandbox 中执行 Shell 命令',
      parametersFormItems: [shellCommandFormData],
      parametersState: shellCommandRunParams,
    },
  ]

  //TODO -> Currently codeRun and executeCommand values are fixed -> when we enable user to define them implement onChange handlers with validatePlaygroundActionWithParams logic
  return (
    <div className="space-y-6">
      {processCodeExecutionActionsFormData.map((processCodeExecutionAction) => (
        <div key={processCodeExecutionAction.methodName} className="space-y-4">
          <PlaygroundActionForm<ProcessCodeExecutionActions>
            actionFormItem={processCodeExecutionAction}
            hideRunActionButton
          />
          <div className="space-y-2">
            {processCodeExecutionAction.methodName === ProcessCodeExecutionActions.CODE_RUN && (
              <StackedInputFormControl formItem={codeRunLanguageCodeFormData}>
                <CodeBlock
                  language={sandboxParametersState.language || CodeLanguage.PYTHON} // Python is default language if none specified
                  code={codeRunParams[codeRunLanguageCodeFormData.key] || ''}
                />
              </StackedInputFormControl>
            )}
            {processCodeExecutionAction.methodName === ProcessCodeExecutionActions.SHELL_COMMANDS_RUN && (
              <StackedInputFormControl formItem={shellCommandFormData}>
                <CodeBlock language="bash" code={shellCommandRunParams[shellCommandFormData.key] || ''} />
              </StackedInputFormControl>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default SandboxProcessCodeExecution
