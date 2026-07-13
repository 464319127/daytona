/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import {
  GitBranchesParams,
  GitCloneParams,
  GitOperationsActionFormData,
  GitStatusParams,
  ParameterFormData,
  ParameterFormItem,
} from '@/contexts/PlaygroundContext'
import { GitOperationsActions } from '@/enums/Playground'
import { usePlayground } from '@/hooks/usePlayground'
import PlaygroundActionForm from '../../ActionForm'
import InlineInputFormControl from '../../Inputs/InlineInputFormControl'
import FormTextInput from '../../Inputs/TextInput'

const SandboxGitOperations: React.FC = () => {
  const { sandboxParametersState, playgroundActionParamValueSetter } = usePlayground()
  const gitCloneParams = sandboxParametersState['gitCloneParams']
  const gitStatusParams = sandboxParametersState['gitStatusParams']
  const gitBranchesParams = sandboxParametersState['gitBranchesParams']

  const gitCloneParamsFormData: ParameterFormData<GitCloneParams> = [
    { label: 'URL', key: 'repositoryURL', placeholder: '要克隆的仓库 URL', required: true },
    {
      label: '目标位置',
      key: 'cloneDestinationPath',
      placeholder: '仓库的克隆路径',
      required: true,
    },
    { label: '分支', key: 'branchToClone', placeholder: '要克隆的指定分支' },
    { label: '提交', key: 'commitToClone', placeholder: '要克隆的指定提交' },
    { label: '用户名', key: 'authUsername', placeholder: '用于身份验证的 Git 用户名' },
    { label: '密码', key: 'authPassword', placeholder: '用于身份验证的 Git 密码或令牌' },
  ]

  const gitRepoLocationFormData: ParameterFormItem & { key: 'repositoryPath' } = {
    label: '仓库位置',
    key: 'repositoryPath',
    placeholder: 'Git 仓库根目录路径',
    required: true,
  }

  const gitOperationsActionsFormData: GitOperationsActionFormData<
    GitCloneParams | GitStatusParams | GitBranchesParams
  >[] = [
    {
      methodName: GitOperationsActions.GIT_CLONE,
      label: 'clone()',
      description: '将 Git 仓库克隆到指定路径',
      parametersFormItems: gitCloneParamsFormData,
      parametersState: gitCloneParams,
    },
    {
      methodName: GitOperationsActions.GIT_STATUS,
      label: 'status()',
      description: '获取当前 Git 仓库状态',
      parametersFormItems: [gitRepoLocationFormData],
      parametersState: gitStatusParams,
    },
    {
      methodName: GitOperationsActions.GIT_BRANCHES_LIST,
      label: 'branches()',
      description: '列出仓库中的分支',
      parametersFormItems: [gitRepoLocationFormData],
      parametersState: gitBranchesParams,
    },
  ]

  return (
    <div className="space-y-6">
      {gitOperationsActionsFormData.map((gitOperationsAction) => (
        <div key={gitOperationsAction.methodName} className="space-y-4">
          <PlaygroundActionForm<GitOperationsActions> actionFormItem={gitOperationsAction} hideRunActionButton />
          <div className="space-y-2">
            {gitOperationsAction.methodName === GitOperationsActions.GIT_CLONE && (
              <>
                {gitCloneParamsFormData.map((gitCloneParamFormItem) => (
                  <InlineInputFormControl key={gitCloneParamFormItem.key} formItem={gitCloneParamFormItem}>
                    <FormTextInput
                      formItem={gitCloneParamFormItem}
                      textValue={gitCloneParams[gitCloneParamFormItem.key]}
                      onChangeHandler={(value) =>
                        playgroundActionParamValueSetter(
                          gitOperationsAction,
                          gitCloneParamFormItem,
                          'gitCloneParams',
                          value,
                        )
                      }
                    />
                  </InlineInputFormControl>
                ))}
              </>
            )}
            {gitOperationsAction.methodName === GitOperationsActions.GIT_STATUS && (
              <InlineInputFormControl formItem={gitRepoLocationFormData}>
                <FormTextInput
                  formItem={gitRepoLocationFormData}
                  textValue={gitStatusParams[gitRepoLocationFormData.key]}
                  onChangeHandler={(value) =>
                    playgroundActionParamValueSetter(
                      gitOperationsAction,
                      gitRepoLocationFormData,
                      'gitStatusParams',
                      value,
                    )
                  }
                />
              </InlineInputFormControl>
            )}
            {gitOperationsAction.methodName === GitOperationsActions.GIT_BRANCHES_LIST && (
              <InlineInputFormControl formItem={gitRepoLocationFormData}>
                <FormTextInput
                  formItem={gitRepoLocationFormData}
                  textValue={gitBranchesParams[gitRepoLocationFormData.key]}
                  onChangeHandler={(value) =>
                    playgroundActionParamValueSetter(
                      gitOperationsAction,
                      gitRepoLocationFormData,
                      'gitBranchesParams',
                      value,
                    )
                  }
                />
              </InlineInputFormControl>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default SandboxGitOperations
