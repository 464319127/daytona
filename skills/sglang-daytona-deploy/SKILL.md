---
name: sglang-daytona-deploy
description: 通过 Daytona REST API 和 Toolbox API 自动创建 GPU Sandbox、从 BOS 下载并校验模型、启动 SGLang 服务、执行端口预览健康检查。用户要求用 Daytona API/agent 部署 SGLang、在 Daytona Sandbox 中运行推理服务、把原有 Docker 容器部署迁移到 Daytona，或从 BOS 拉取模型后启动 SGLang 时使用。
---

# SGLang Daytona Sandbox 部署

使用 `scripts/deploy.py` 驱动完整流程。不要在宿主机执行 `docker run`、`docker exec` 或依赖宿主机目录挂载；所有部署操作必须通过 Daytona API 完成。

## 收集参数

在创建 Sandbox 前收集下列信息。缺少必填项时询问用户，但不要在聊天中索取任何凭据值。

| 参数 | 必填 | 说明 |
|---|---|---|
| 镜像 | 是 | 包含 SGLang 及 `/sgl-workspace/scripts/sglang_control.sh` 的完整镜像地址 |
| Daytona target | 是 | 可调度所需 GPU 的 Daytona region/target |
| GPU 数量 | 是 | 正整数 |
| GPU 类型偏好 | 否 | `H100`、`RTX-PRO-6000`，可按优先级提供多个 |
| 模型 BOS 路径 | 是 | 例如 `bos:/bucket/model-name` |
| SGLang 环境变量文件 | 是 | 每行严格为 `KEY=VALUE`，必须包含 `BASE_PORT` |
| Daytona Volume | 否 | 需要持久化模型时使用 `volume-id:/workspace[:subpath]` |
| 跳过模型下载 | 否 | 仅当模型目录已经存在于 Sandbox/Volume 时启用 |

凭据仅从 agent 当前进程环境读取：

- `DAYTONA_API_KEY`；使用 JWT 时改为 `DAYTONA_JWT_TOKEN` 和 `DAYTONA_ORGANIZATION_ID`
- `BOS_AK`、`BOS_SK`；跳过模型下载时不需要
- `DAYTONA_API_URL`，未设置时默认 `https://app.daytona.io/api`
- `DAYTONA_TARGET` 可替代命令行 `--target`

不要执行会回显凭据的 `env`、`printenv`、`set` 或 `export -p`。不要把凭据放进聊天、命令参数、环境变量文件、日志或 Sandbox 创建请求的全局 `env` 字段。

## 部署前检查

1. 确认 Daytona runner 能拉取私有镜像；镜像仓库认证由 runner 管理，不要把 registry 密码写进 Dockerfile。
2. 确认 target 支持请求的 GPU 类型和数量，并能访问 BOS 与 `bcecmd` 下载地址。
3. 将宿主机挂载转换为 Daytona Volume。Daytona Sandbox 不支持复用 `host_path:container_path` 形式的宿主机 bind mount。
4. GPU Sandbox 必须保持 ephemeral：脚本固定发送 `autoDeleteInterval: 0`，并禁用自动停止。停止后 Sandbox 会被删除。
5. 先执行 `--dry-run`，检查请求结构和派生路径；dry-run 只显示环境变量名称，不显示值。

```bash
nix develop .#python --command python skills/sglang-daytona-deploy/scripts/deploy.py \
  --dry-run \
  --image '<image>' \
  --target '<target>' \
  --gpu <count> \
  --gpu-type H100 \
  --model-bos-path 'bos:/<bucket>/<model>' \
  --env-file '<sglang-env-file>'
```

需要完整参数定义和 API 映射时读取 [references/daytona-api.md](references/daytona-api.md)。可参考 [references/sglang-env.example](references/sglang-env.example) 创建环境变量文件。

## 执行部署

从仓库根目录和 Python Nix dev shell 运行；不要复制凭据到临时文件：

```bash
nix develop .#python --command python skills/sglang-daytona-deploy/scripts/deploy.py \
  --image '<image>' \
  --target '<target>' \
  --gpu <count> \
  --gpu-type H100 \
  --model-bos-path 'bos:/<bucket>/<model>' \
  --env-file '<sglang-env-file>'
```

按需增加：

- `--volume '<volume-id-or-name>:/workspace[:subpath]'`：把 Daytona Volume 挂到工作目录。
- `--skip-model-pull`：验证模型目录存在，不访问 BOS。
- `--cpu`、`--memory`、`--disk`：覆盖 Sandbox 资源。
- `--user root`：覆盖镜像内执行用户；默认使用 `root`。
- `--network-allow-list '<CIDR,...>'`：限制 Sandbox 出站网络；访问内网 BOS 时确认 runner 网络允许 bcecmd 地址。
- `--network-block-all`：完全阻断 Sandbox 出站网络，仅适用于模型已存在的部署。
- `--public`：仅在用户明确要求公开端口时使用。
- `--signed-preview-expires 3600`：仅在用户明确需要可分享链接时生成 signed URL。
- `--ca-cert <path>`：连接使用私有 CA 的自托管 Daytona。

脚本依次执行：

1. 调用 Daytona REST API 创建自定义镜像 GPU Sandbox，并等待状态变为 `started`。
2. 通过 Toolbox API 检查 `nvidia-smi`，上传 `pull_model.sh` 与 `start_sglang.sh`。
3. 通过 Toolbox API 的 command `envs` 字段临时传入 BOS 凭据，在后台同步并校验模型；凭据不进入命令文本。
4. 通过 Toolbox API 临时传入 SGLang 环境变量，后台启动服务。
5. 获取标准 port preview URL 和 token，轮询 `/health_generate`；输出中不包含 token。

模型下载较慢时持续轮询。不要因为一段时间没有新日志就重新创建 Sandbox；只有脚本超时或返回非零状态才视为失败。

## 处理结果

成功时从 `DEPLOYMENT_RESULT` JSON 汇报：

- Sandbox ID、名称和 target
- 模型在 Sandbox 内的路径
- 服务端口、健康状态和 preview URL
- 日志路径 `/tmp/sglang.log` 与 `/tmp/sglang-model-pull.log`

私有 preview URL 需要调用 Daytona preview API 获取最新 token，不要向用户展示或记录 token。Signed URL 本身包含授权信息，仅在用户明确要求时返回，并说明过期时间。

失败时：

1. 记录已经输出的 `SANDBOX_CREATED` ID。
2. 查看脚本打印的安全日志尾部；必要时通过 Toolbox API读取 `/tmp/sglang.log` 或 `/tmp/sglang-model-pull.log`。
3. 保留 Sandbox 供诊断。不要擅自停止；GPU Sandbox 的 `autoDeleteInterval: 0` 表示停止即删除。
4. 只有用户明确同意后才调用 `POST /sandbox/{id}/stop`。

## 安全约束

- 不要为部署创建 Sandbox snapshot；`bcecmd` 在运行期间会短暂写入凭据配置。
- 不要输出 Daytona token、preview token、BOS AK/SK 或包含这些值的 HTTP 请求体。
- 不要把 BOS 凭据写入 Sandbox 全局环境、SGLang 环境变量文件或持久 Volume。
- 不要透传未脱敏的 `bcecmd --debug` 输出；只使用 `pull_model.sh` 生成的摘要。
- 不要自动删除失败的 Sandbox，也不要未经确认停止已有 Sandbox。
