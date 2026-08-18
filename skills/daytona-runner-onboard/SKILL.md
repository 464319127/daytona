---
name: daytona-runner-onboard
description: Add or migrate a self-hosted Daytona Runner to a custom region, including offline Docker image bundling/loading, self-signed control-plane CA trust, NVIDIA GPU/CDI setup for Docker-in-Docker, safe token handling, registration checks, and single-GPU Sandbox validation. Use when onboarding a new Runner machine, moving a Runner to another host, troubleshooting a Runner missing from the Dashboard, or verifying that GPU capacity is actually schedulable.
---

# Daytona Runner Onboard

将一台 Linux 主机安全接入 Daytona Custom Region。默认采用容器化 Runner；支持先在联网源机器打包镜像，再迁移到无法访问 Docker Hub 的目标机器。

## 执行原则

- 先读取 [references/parameters.md](references/parameters.md)，收齐必填参数后再变更机器。不得猜测 Runner Token、Runner 名称、Region ID、API 地址或目标机地址。
- GPU 或离线迁移时再读取 [references/offline-gpu.md](references/offline-gpu.md)。
- Token 固定从目标机 `/etc/daytona/runner.token` 读取。用户只需在目标机准备该文件并告知已就绪，不得要求用户在聊天中粘贴 Token。文件必须为 `root:root` 且权限为 `0600` 或更严格；不得读取后回显，也不得写入命令参数、日志、Git、镜像、CDI 文件或最终回复。用户已公开粘贴 Token 时，建议完成接入后轮换。
- 一个 Token 只运行一个 Runner。替换已有容器属于有状态操作；先确认旧 Runner 无存量 Sandbox，并要求用户明确批准 `REPLACE_EXISTING=true`。
- 不复制其他机器的 CDI 文件。驱动版本或目标机变化后必须重新生成。
- 不通过 `curl -k`、关闭 TLS 校验或清理未知 Docker 数据来绕过问题。

## 工作流

### 1. 确认控制面记录和参数

在 Dashboard 的 Custom Region 中创建唯一 Runner，保存一次性 Token。区分：

- Dashboard：供人访问，例如 `https://host:8999/dashboard/`；
- Runner API：必须以 `/api` 结尾，例如 `https://host:8999/api`；
- Custom Region 显示名与 API Region ID：验证时使用 `/runners/me` 返回的稳定 ID；
- Runner 名称：当前 Server 的 Custom Runner 示例是 `runner-1`，容器名不是 Dashboard 名称。

Token 交接使用固定路径 `/etc/daytona/runner.token`。用户直接在目标机创建该文件，Agent 只检查文件是否存在、非空、属主和权限，不执行 `cat`、`head`、`tail` 或其他会输出内容的命令：

```bash
sudo test -s /etc/daytona/runner.token
sudo stat -c '%U:%G %a %n' /etc/daytona/runner.token
```

预期属主为 `root:root`，权限为 `600`（只读的 `400` 也可）。不符合时停止安装并要求用户修正文件；不要把 Token 复制到仓库或离线包。

先检查目标机架构、Docker、端口、磁盘和到控制面的 TLS 连接。GPU 模式还需检查 `nvidia-smi`、NVIDIA Container Toolkit、Docker `nvidia` runtime 和 GPU 数量/型号。把检查结果展示给用户。

### 2. 在联网源机器准备离线包

固定最终 Runner 镜像标签，并显式列出目标机会用到的 Sandbox/Snapshot 镜像。当前 Server 使用自签名证书时，确认 [assets/daytona-server-ca.crt](assets/daytona-server-ca.crt) 仍与服务端证书一致；不一致则替换 CA 后重建。

```bash
scripts/bundle-images.sh \
  --build-gpu \
  --base-runner-image daytona-runner-gpu:v0.187.0 \
  --runner-image daytona-runner-gpu-current-server:v0.187.0 \
  --include daytonaio/sandbox:0.5.0-slim \
  --output dist/runner-bundles/daytona-runner-gpu-v0.187.0.tar.gz
```

迁移整个 Skill 目录以及归档、`.sha256`、`.manifest` 三个文件。不要把 Token 文件放进迁移包。镜像列表较大时，先让用户确认目标磁盘容量。

示例的本地基础镜像已经包含 `gcompat`，构建 CA 层不需要访问 Alpine 镜像源。若源机器只有未修改的官方 Runner 镜像，则将 base 改为官方精确标签并加 `--install-gpu-compat`；这一步需要访问 Alpine 软件源。

### 3. 在目标机器加载镜像

```bash
scripts/load-images.sh \
  --archive /path/daytona-runner-gpu-v0.187.0.tar.gz
```

脚本默认要求并校验相邻的 `.sha256`。确认加载后的精确镜像标签，不在离线机器上使用 `latest` 或执行隐式 pull。

### 4. 为目标 GPU 主机生成 CDI

只在 `GPU_ENABLED=true` 时执行：

```bash
sudo bash scripts/generate-cdi.sh --output /etc/daytona/nvidia-cdi.yaml
```

检查生成文件包含 `kind: nvidia.com/gpu`、目标 GPU 设备以及目标驱动路径。该脚本会把 Debian/Ubuntu multiarch 和 `/lib64` 下的驱动 `hostPath` 调整为 Alpine Runner 中 NVIDIA runtime 实际注入的 `/usr/lib64`，并删除不能在内层容器执行的宿主 hooks。


### 5. 安装 Runner

确认用户已在目标机准备标准 Token 文件，再以 `sudo env` 提供非秘密配置。`install-runner.sh` 默认读取 `/etc/daytona/runner.token`：

```bash
sudo env \
  DAYTONA_API_URL='https://host:8999/api' \
  RUNNER_NAME='runner-2' \
  RUNNER_DOMAIN='10.127.2.19' \
  RUNNER_API_PORT='3004' \
  RUNNER_IMAGE='daytona-runner-gpu-current-server:v0.187.0' \
  RUNNER_EXTRA_HOSTS='registry:10.127.2.18' \
  GPU_ENABLED='true' \
  RUNNER_CDI_SPEC='/etc/daytona/nvidia-cdi.yaml' \
  RUNNER_PRELOAD_IMAGES='daytonaio/sandbox:0.5.0-slim' \
  "$PWD/scripts/install-runner.sh"
```

先在相同命令中加入 `DRY_RUN=true` 检查命令；输出不得出现 Token 或 AWS Secret。仅在非标准部署确有需要时才覆盖 `DAYTONA_RUNNER_TOKEN_FILE`。远端机器使用受信任的 HTTPS；只有控制面与 Runner 位于同一 Docker 主机时，才可设置 `RUNNER_DOCKER_NETWORK` 并使用 `http://api:3000/api`。

`RUNNER_EXTRA_HOSTS` 用于持久化 Runner 容器所需的静态解析，多个 `主机名:地址` 以空格分隔。等价的 Compose 配置是：

```yaml
services:
  runner:
    extra_hosts:
      - "registry:10.127.2.18"
```

### 6. 验证完整链路

```bash
DAYTONA_API_URL='https://host:8999/api' \
RUNNER_NAME='runner-2' \
EXPECTED_REGION='custom-region-id' \
GPU_ENABLED='true' \
RUNNER_REGISTRY_URL='http://registry:6000' \
GPU_SMOKE_IMAGE='daytonaio/sandbox:0.5.0-slim' \
scripts/verify-runner.sh
```

完成条件：

1. Runner 容器健康、本地接口正常；
2. `/api/runners/me` 的 `name`、`region`、`state=ready`、API v2 均正确；
3. GPU 模式下，控制面 GPU 数与 Runner 容器可见数量一致且大于 0；
4. 内层 Docker 使用 `nvidia.com/gpu=0` 启动 smoke image，容器内恰好只看到一张 GPU；
5. Dashboard 对应 Custom Region 中可看到同名 Runner，`lastChecked` 持续更新。
6. 配置 `RUNNER_REGISTRY_URL` 时，Runner 容器访问 Registry `/v2/` 成功。

V100 在当前控制面可报告 GPU 数量，但 `gpuType` 会是 `null`；这不代表 GPU 失效。不要宣称成功，除非 CDI 单卡 smoke test 已通过。

## 故障与回滚

先读取 Runner 日志和 [references/offline-gpu.md](references/offline-gpu.md) 的失败处理。若新容器未注册成功，保留日志，停止并删除新容器；不要删除命名 Docker volumes，除非用户确认其中没有需保留的 Sandbox 数据。控制面删除 Runner 记录或轮换 Token 前，先将节点设为不可调度并处置存量 Sandbox。
