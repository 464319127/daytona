/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import pythonIcon from '@/assets/python.svg'
import typescriptIcon from '@/assets/typescript.svg'
import CodeBlock from '@/components/CodeBlock'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DAYTONA_DOCS_URL } from '@/constants/ExternalLinks'
import { RoutePath } from '@/enums/RoutePath'
import { useApi } from '@/hooks/useApi'
import { useOrganizations } from '@/hooks/useOrganizations'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { handleApiError } from '@/lib/error-handling'
import { getMaskedToken } from '@/lib/utils'
import { ApiKeyResponse, CreateApiKeyPermissionsEnum, OrganizationRolePermissionsEnum } from '@daytona/api-client'
import { Check, ClipboardIcon, Eye, EyeOff, Loader2, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

const Onboarding: React.FC = () => {
  const { apiKeyApi } = useApi()
  const { organizations } = useOrganizations()
  const { selectedOrganization, onSelectOrganization, authenticatedUserHasPermission } = useSelectedOrganization()
  const navigate = useNavigate()

  const [language, setLanguage] = useState<'typescript' | 'python'>('python')
  const [apiKeyName, setApiKeyName] = useState('')
  const [apiKeyPermissions, setApiKeyPermissions] = useState<CreateApiKeyPermissionsEnum[]>([])
  const [createdApiKey, setCreatedApiKey] = useState<ApiKeyResponse | null>(null)
  const [isApiKeyRevealed, setIsApiKeyRevealed] = useState(false)
  const [isApiKeyCopied, setIsApiKeyCopied] = useState(false)
  const [isLoadingCreateKey, setIsLoadingCreateKey] = useState(false)
  const [hasSufficientPermissions, setHasSufficientPermissions] = useState(false)

  // Reset onboarding when switching organizations
  useEffect(() => {
    if (selectedOrganization) {
      setCreatedApiKey(null)
      setHasSufficientPermissions(false)
      setApiKeyPermissions([])
    }
  }, [selectedOrganization])

  // User must have permission to create sandboxes to use the onboarding snippet
  useEffect(() => {
    const ensureOnboardingPermissions = async () => {
      if (authenticatedUserHasPermission(OrganizationRolePermissionsEnum.WRITE_SANDBOXES)) {
        setHasSufficientPermissions(true)
        const permissions: CreateApiKeyPermissionsEnum[] = [CreateApiKeyPermissionsEnum.WRITE_SANDBOXES]
        if (authenticatedUserHasPermission(OrganizationRolePermissionsEnum.DELETE_SANDBOXES)) {
          permissions.push(CreateApiKeyPermissionsEnum.DELETE_SANDBOXES)
        }
        setApiKeyPermissions(permissions)
      } else {
        const personalOrg = organizations.find((org) => org.personal)

        if (personalOrg) {
          const success = await onSelectOrganization(personalOrg.id)
          if (success) {
            toast.success('已切换到个人组织', {
              description:
                '你在之前的组织中没有创建沙箱所需的权限。',
            })
            return
          }
        }

        toast.error('准备入门示例时发生意外错误')
      }
    }

    ensureOnboardingPermissions()
  }, [authenticatedUserHasPermission, onSelectOrganization, organizations])

  const handleCreateApiKey = async () => {
    if (!selectedOrganization) {
      return
    }

    setIsLoadingCreateKey(true)
    try {
      const key = (
        await apiKeyApi.createApiKey(
          {
            name: apiKeyName,
            permissions: apiKeyPermissions,
          },
          selectedOrganization.id,
        )
      ).data
      setCreatedApiKey(key)
      setApiKeyName('')
      toast.success('API 密钥已成功创建')
    } catch (error) {
      handleApiError(error, '创建 API 密钥失败')
    } finally {
      setIsLoadingCreateKey(false)
    }
  }

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setIsApiKeyCopied(true)
      setTimeout(() => setIsApiKeyCopied(false), 2000)
    } catch (err) {
      console.error('复制文本失败：', err)
    }
  }

  return (
    <div className="p-6">
      <div className="min-h-screen p-14">
        <div className="max-w-3xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-2xl font-bold mb-2">快速入门</h1>
              <p className="text-muted-foreground">安装 SDK 并开始运行沙箱。</p>
            </div>
            <div className="flex items-center space-x-2">
              <Tabs value={language} onValueChange={(value) => setLanguage(value as 'typescript' | 'python')}>
                <TabsList className="bg-foreground/10 p-0 rounded-none">
                  <TabsTrigger
                    value="python"
                    className="data-[state=active]:bg-transparent data-[state=active]:text-foreground border-b-2 data-[state=active]:border-primary rounded-none h-full"
                  >
                    <img src={pythonIcon} alt="Python" className="w-4 h-4" />
                  </TabsTrigger>
                  <TabsTrigger
                    value="typescript"
                    className="data-[state=active]:bg-transparent data-[state=active]:text-foreground border-b-2 data-[state=active]:border-primary rounded-none h-full"
                  >
                    <img src={typescriptIcon} alt="TypeScript" className="w-4 h-4" />
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[15px] top-[40px] bottom-0 w-[2px] bg-muted-foreground/50" />

            {/* Steps */}
            <div className="space-y-12">
              {/* Step 1 */}
              <div className="relative pl-12">
                <div className="absolute left-0 w-8 h-8 text-background rounded-full bg-muted-foreground flex items-center justify-center text-sm">
                  1
                </div>
                <div>
                  <h2 className="text-xl font-semibold mb-4">安装 SDK</h2>
                  <p className="mb-4">在终端中运行以下命令安装 Daytona SDK：</p>
                  <div className="transition-all duration-500">
                    <CodeBlock code={codeExamples[language].install} language="bash" showCopy />
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="relative pl-12">
                <div className="absolute left-0 w-8 h-8 text-background rounded-full bg-muted-foreground flex items-center justify-center text-sm">
                  2
                </div>
                <div>
                  <h2 className="text-xl font-semibold mb-4">创建 API 密钥</h2>
                  <p className="mb-4">
                    此 API 密钥仅具有
                    {apiKeyPermissions.includes(CreateApiKeyPermissionsEnum.DELETE_SANDBOXES) ? '管理' : '创建'}沙箱的权限。
                    如需完整 API 权限，请前往
                    <button
                      onClick={() => navigate(RoutePath.KEYS)}
                      className="underline cursor-pointer hover:text-muted-foreground"
                    >
                      API 密钥
                    </button>{' '}
                    页面。
                  </p>
                  {createdApiKey ? (
                    <div className="p-4 flex justify-between items-center rounded-md bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400">
                      <span className="overflow-x-auto pr-2 cursor-text select-all">
                        {isApiKeyRevealed ? createdApiKey.value : getMaskedToken(createdApiKey.value)}
                      </span>
                      <div className="flex items-center space-x-3 pl-3">
                        {isApiKeyRevealed ? (
                          <EyeOff
                            className="w-4 h-4 cursor-pointer hover:text-green-400 dark:hover:text-green-200 transition-colors"
                            onClick={() => setIsApiKeyRevealed(false)}
                          />
                        ) : (
                          <Eye
                            className="w-4 h-4 cursor-pointer hover:text-green-400 dark:hover:text-green-200 transition-colors"
                            onClick={() => setIsApiKeyRevealed(true)}
                          />
                        )}
                        {isApiKeyCopied ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <ClipboardIcon
                            className="w-4 h-4 cursor-pointer hover:text-green-400 dark:hover:text-green-200 transition-colors"
                            onClick={() => copyToClipboard(createdApiKey.value)}
                          />
                        )}
                      </div>
                    </div>
                  ) : (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault()
                        await handleCreateApiKey()
                      }}
                    >
                      <div className="mb-6">
                        <label htmlFor="key-name" className="block mb-1 text-sm font-medium text-muted-foreground">
                          API 密钥名称
                        </label>

                        <Input
                          id="key-name"
                          type="text"
                          value={apiKeyName}
                          onChange={(e) => setApiKeyName(e.target.value)}
                          required
                          placeholder="例如：入门指南"
                          className="md:text-base px-4 h-10.5"
                          disabled={!hasSufficientPermissions}
                        />
                      </div>
                      <Button
                        type="submit"
                        disabled={isLoadingCreateKey || !hasSufficientPermissions}
                        className="text-base"
                      >
                        {isLoadingCreateKey ? (
                          <Loader2 className="h-6 w-6 animate-spin" />
                        ) : (
                          <Plus className="w-6 h-6" />
                        )}
                        创建 API 密钥
                      </Button>
                    </form>
                  )}
                </div>
              </div>

              {/* Step 3 */}
              <div className="relative pl-12">
                <div
                  className={`absolute left-0 w-8 h-8 text-background rounded-full flex items-center justify-center text-sm ${
                    !createdApiKey ? 'bg-secondary' : 'bg-muted-foreground'
                  }`}
                >
                  3
                </div>
                <div className={!createdApiKey ? 'opacity-40 pointer-events-none' : ''}>
                  <h2 className="text-xl font-semibold mb-4">创建沙箱</h2>
                  <p className="mb-4">以下示例将创建一个沙箱并运行一段简单代码：</p>
                  <div className="transition-all duration-500">
                    <CodeBlock
                      code={
                        createdApiKey && isApiKeyRevealed
                          ? codeExamples[language].example.replace('your-api-key', createdApiKey.value)
                          : codeExamples[language].example
                      }
                      language={language}
                      showCopy
                    />
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="relative pl-12">
                <div
                  className={`absolute left-0 w-8 h-8 text-background rounded-full flex items-center justify-center text-sm ${
                    !createdApiKey ? 'bg-secondary' : 'bg-muted-foreground'
                  }`}
                >
                  4
                </div>
                <div className={!createdApiKey ? 'opacity-40 pointer-events-none' : ''}>
                  <h2 className="text-xl font-semibold mb-4">运行示例</h2>
                  <p className="mb-4">在终端中运行以下命令执行示例：</p>
                  <div className="transition-all duration-500">
                    <CodeBlock code={codeExamples[language].run} language="bash" showCopy />
                  </div>
                </div>
              </div>

              {/* Step 5 */}
              <div className="relative pl-12">
                <div
                  className={`absolute left-0 w-8 h-8 text-background rounded-full flex items-center justify-center text-sm ${
                    !createdApiKey ? 'bg-secondary' : 'bg-muted-foreground'
                  }`}
                >
                  5
                </div>
                <div className={!createdApiKey ? 'opacity-40 pointer-events-none' : ''}>
                  <h2 className="text-xl font-semibold mb-4">完成</h2>
                  <p className="text-muted-foreground">
                    就这么简单。如需查看更多示例，请访问
                    <a href={DAYTONA_DOCS_URL} target="_blank" rel="noopener noreferrer" className="text-primary">
                      文档
                    </a>
                    。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const codeExamples = {
  typescript: {
    install: `npm install @daytona/sdk`,
    run: `npx tsx index.mts`,
    example: `import { Daytona } from '@daytona/sdk'

// Initialize the Daytona client
const daytona = new Daytona({ apiKey: 'your-api-key' });

// Create the Sandbox instance
const sandbox = await daytona.create({
  language: 'typescript',
});

// Run the code securely inside the Sandbox
const response = await sandbox.process.codeRun('console.log("Hello World from code!")')
console.log(response.result);
  `,
  },
  python: {
    install: `pip install daytona`,
    run: `python main.py`,
    example: `from daytona import Daytona, DaytonaConfig

# Define the configuration
config = DaytonaConfig(api_key="your-api-key")

# Initialize the Daytona client
daytona = Daytona(config)

# Create the Sandbox instance
sandbox = daytona.create()

# Run the code securely inside the Sandbox
response = sandbox.process.code_run('print("Hello World from code!")')
if response.exit_code != 0:
  print(f"Error: {response.exit_code} {response.result}")
else:
    print(response.result)
  `,
  },
}

export default Onboarding
