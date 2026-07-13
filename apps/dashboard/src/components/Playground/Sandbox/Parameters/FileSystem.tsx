/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import {
  CreateFolderParams,
  DeleteFileParams,
  FileSystemActionFormData,
  ListFilesParams,
  ParameterFormData,
  ParameterFormItem,
} from '@/contexts/PlaygroundContext'
import { FileSystemActions } from '@/enums/Playground'
import { usePlayground } from '@/hooks/usePlayground'
import PlaygroundActionForm from '../../ActionForm'
import FormCheckboxInput from '../../Inputs/CheckboxInput'
import InlineInputFormControl from '../../Inputs/InlineInputFormControl'
import FormTextInput from '../../Inputs/TextInput'

const SandboxFileSystem: React.FC = () => {
  const { sandboxParametersState, playgroundActionParamValueSetter } = usePlayground()
  const createFolderParams = sandboxParametersState['createFolderParams']
  const listFilesParams = sandboxParametersState['listFilesParams']
  const deleteFileParams = sandboxParametersState['deleteFileParams']

  const listFilesDirectoryFormData: ParameterFormItem & { key: 'directoryPath' } = {
    label: '目录位置',
    key: 'directoryPath',
    placeholder: '要列出的目录路径',
    required: true,
  }

  const createFolderParamsFormData: ParameterFormData<CreateFolderParams> = [
    {
      label: '文件夹位置',
      key: 'folderDestinationPath',
      placeholder: '要创建目录的路径',
      required: true,
    },
    {
      label: '权限',
      key: 'permissions',
      placeholder: '八进制格式的目录权限（例如 "755"）',
      required: true,
    },
  ]

  const deleteFileLocationFormData: ParameterFormItem & { key: 'filePath' } = {
    label: '文件位置',
    key: 'filePath',
    placeholder: '要删除的文件或目录路径',
    required: true,
  }
  const deleteFileRecursiveFormData: ParameterFormItem & { key: 'recursive' } = {
    label: '删除目录',
    key: 'recursive',
    placeholder: '如果目标是目录，必须启用此项才能删除。',
  }

  const fileSystemActionsFormData: FileSystemActionFormData<ListFilesParams | CreateFolderParams | DeleteFileParams>[] =
    [
      {
        methodName: FileSystemActions.CREATE_FOLDER,
        label: 'createFolder()',
        description: '使用指定权限在 Sandbox 的指定路径创建新目录',
        parametersFormItems: createFolderParamsFormData,
        parametersState: createFolderParams,
      },
      {
        methodName: FileSystemActions.LIST_FILES,
        label: 'listFiles()',
        description: '列出指定路径中的文件和目录并返回其信息',
        parametersFormItems: [listFilesDirectoryFormData],
        parametersState: listFilesParams,
      },
      {
        methodName: FileSystemActions.DELETE_FILE,
        label: 'deleteFile()',
        description: '从 Sandbox 中删除文件',
        parametersFormItems: [deleteFileLocationFormData, deleteFileRecursiveFormData],
        parametersState: deleteFileParams,
      },
    ]

  return (
    <div className="space-y-6">
      {fileSystemActionsFormData.map((fileSystemAction) => (
        <div key={fileSystemAction.methodName} className="space-y-4">
          <PlaygroundActionForm<FileSystemActions> actionFormItem={fileSystemAction} hideRunActionButton />
          <div className="space-y-2">
            {fileSystemAction.methodName === FileSystemActions.LIST_FILES && (
              <InlineInputFormControl formItem={listFilesDirectoryFormData}>
                <FormTextInput
                  formItem={listFilesDirectoryFormData}
                  textValue={listFilesParams[listFilesDirectoryFormData.key]}
                  onChangeHandler={(value) =>
                    playgroundActionParamValueSetter(
                      fileSystemAction,
                      listFilesDirectoryFormData,
                      'listFilesParams',
                      value,
                    )
                  }
                />
              </InlineInputFormControl>
            )}
            {fileSystemAction.methodName === FileSystemActions.CREATE_FOLDER && (
              <>
                {createFolderParamsFormData.map((createFolderParamFormItem) => (
                  <InlineInputFormControl key={createFolderParamFormItem.key} formItem={createFolderParamFormItem}>
                    <FormTextInput
                      formItem={createFolderParamFormItem}
                      textValue={createFolderParams[createFolderParamFormItem.key]}
                      onChangeHandler={(value) =>
                        playgroundActionParamValueSetter(
                          fileSystemAction,
                          createFolderParamFormItem,
                          'createFolderParams',
                          value,
                        )
                      }
                    />
                  </InlineInputFormControl>
                ))}
              </>
            )}
            {fileSystemAction.methodName === FileSystemActions.DELETE_FILE && (
              <>
                <InlineInputFormControl formItem={deleteFileLocationFormData}>
                  <FormTextInput
                    formItem={deleteFileLocationFormData}
                    textValue={deleteFileParams[deleteFileLocationFormData.key]}
                    onChangeHandler={(value) =>
                      playgroundActionParamValueSetter(
                        fileSystemAction,
                        deleteFileLocationFormData,
                        'deleteFileParams',
                        value,
                      )
                    }
                  />
                </InlineInputFormControl>
                <InlineInputFormControl formItem={deleteFileRecursiveFormData}>
                  <FormCheckboxInput
                    formItem={deleteFileRecursiveFormData}
                    checkedValue={deleteFileParams[deleteFileRecursiveFormData.key]}
                    onChangeHandler={(checked) =>
                      playgroundActionParamValueSetter(
                        fileSystemAction,
                        deleteFileRecursiveFormData,
                        'deleteFileParams',
                        checked,
                      )
                    }
                  />
                </InlineInputFormControl>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default SandboxFileSystem
