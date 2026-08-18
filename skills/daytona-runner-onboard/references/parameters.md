# 参数清单

## Token 文件交接约定

用户在目标机直接提供 `/etc/daytona/runner.token`，然后只告知 Agent 文件已就绪，不在聊天中发送 Token 内容。该路径是 `install-runner.sh` 的默认值，不再作为每次接入都要询问的参数。

Agent 在使用前只做无内容输出的检查：

```bash
sudo test -s /etc/daytona/runner.token
sudo stat -c '%U:%G %a %n' /etc/daytona/runner.token
```

文件必须属于 `root:root`，且 group/other 没有任何权限；推荐 `0600`，只读的 `0400` 也可。检查失败时停止，不要尝试从聊天、Shell 历史、仓库、离线包或其他机器恢复 Token。仅在非标准部署确有需要时才覆盖 `DAYTONA_RUNNER_TOKEN_FILE`。

## 必填参数

在执行任何变更前，向用户确认以下参数。不要猜测 Token、地址或目标 Runner。

| 参数 | 示例 | 说明 |
| --- | --- | --- |
| `DAYTONA_API_URL` | `https://10-127-2-18.sslip.io:8999/api` | Runner 实际访问的 API 根地址，必须包含 `/api`，不能填 Dashboard 的 `/dashboard` 页面地址。 |
| `RUNNER_NAME` | `runner-2` | 必须与 Token 对应的控制面 Runner 名称一致。可先调用 `/api/runners/me` 核对。 |
| `EXPECTED_REGION` | `wn-test_0pd3` | `/api/runners/me` 返回的 Custom Region ID，用于验收；它可能不同于 Dashboard 显示名 `wn-test`。 |
| `RUNNER_DOMAIN` | `10.127.2.19` | 控制面、Proxy 或其他相关服务能访问的新机器 IP/域名。不能沿用旧机器地址。 |
| `RUNNER_API_PORT` | `3004` | 新机器上未被占用且防火墙允许的端口。 |
| `RUNNER_IMAGE` | `daytona-runner-gpu:v0.187.0` | 已通过离线包加载的精确镜像标签；不要在离线环境使用 `latest`。 |
| `GPU_ENABLED` | `true` | 明确选择 CPU 或 GPU Runner。不能仅根据机器名推断。 |

## GPU 必填参数

当 `GPU_ENABLED=true` 时还必须确认：

| 参数 | 示例 | 说明 |
| --- | --- | --- |
| `RUNNER_CDI_SPEC` | `/etc/daytona/nvidia-cdi.yaml` | 必须在目标机运行 `generate-cdi.sh` 生成，不能从其他驱动版本机器复制。 |
| `GPU_SMOKE_IMAGE` | `daytonaio/sandbox:0.5.0-slim` | 已预热到 Runner 内层 Docker 的本地镜像，用于 CDI 单卡验证。 |
| `RUNNER_PRELOAD_IMAGES` | `daytonaio/sandbox:0.5.0-slim` | 从宿主 Docker 导入 Runner 内层 Docker 的镜像列表，空格分隔。至少包含 smoke image。 |

目标机还必须具备 NVIDIA 驱动、`nvidia-smi`、NVIDIA Container Toolkit 和 Docker `nvidia` runtime。GPU 数量和型号必须在执行前展示给用户确认。

## 按部署填写

| 参数 | 默认 | 何时填写 |
| --- | --- | --- |
| `RUNNER_CONTAINER_NAME` | `daytona-runner-$RUNNER_NAME` | 同一机器运行多个 Runner，或需要固定运维名称时。 |
| `RUNNER_DOCKER_NETWORK` | Docker 默认 bridge | 只有 Runner 与控制面在同一 Docker 主机时才填写服务网络，例如 `daytona_daytona-network`。远端机器不能加入另一台主机的 bridge 网络。 |
| `RUNNER_EXTRA_HOSTS` | 空 | Runner 无法通过 DNS 解析内部服务时使用，空格分隔 `主机名:地址`，例如 `registry:10.127.2.18`。它会持久化为 Docker `--add-host`；地址变化后必须重建 Runner。 |
| `RUNNER_REGISTRY_URL` | 空 | 验收时从 Runner 容器访问的 Registry 基础 URL，例如 `http://registry:6000`；只用于 `verify-runner.sh` 连通性检查。 |
| `AWS_ENDPOINT_URL` | 空 | 使用快照、备份或 S3 兼容存储时。远端 Runner 必须能访问该地址。 |
| `AWS_REGION` | 空 | 使用对象存储时。 |
| `AWS_ACCESS_KEY_ID` | 空 | 使用对象存储时，通过秘密文件或环境注入。 |
| `AWS_SECRET_ACCESS_KEY` | 空 | 使用对象存储时，通过秘密文件或环境注入，禁止入库。 |
| `AWS_DEFAULT_BUCKET` | 空 | 使用对象存储时。 |
| `SSH_GATEWAY_ENABLE` | `false` | Custom Region 已部署并配置 SSH Gateway 时才开启。 |
| `INTER_SANDBOX_NETWORK_ENABLED` | `false` | 只有明确允许同 Runner Sandbox 互通时才改为 `true`。 |
| `RESOURCE_LIMITS_DISABLED` | `true` | DinD 环境默认关闭 cgroup 资源限制；改为 `false` 前必须做配额测试。 |

## 当前 Server 示例

当前 Server 的 Dashboard 是 `https://10-127-2-18.sslip.io:8999/dashboard/`，远端 Runner 应使用：

```dotenv
DAYTONA_API_URL=https://10-127-2-18.sslip.io:8999/api
```

该入口使用自签名证书。Skill 的 `assets/daytona-server-ca.crt` 与 GPU Runner 镜像用于信任当前证书。若 Server 证书变更，必须替换 CA、重建 Runner 镜像和离线包。不要使用 `curl -k` 的成功结果代替 Runner TLS 验证。

同机部署可使用 `http://api:3000/api` 加 Docker 网络，但这个地址不能用于其他机器。

## Token 规则

- Token 只能对应一个 Runner；不要在两台机器同时使用同一 Token。
- 不在命令行参数、Git、日志、离线镜像包或聊天回复中回显 Token。
- 用户直接将 Token 写入目标机 `/etc/daytona/runner.token`；Agent 只接收路径约定和“文件已就绪”的确认。
- 保持该文件为 `root:root`，权限为 `0600` 或更严格；Agent 不通过内容输出命令检查文件。
- 若用户只提供 Custom Region 显示名，先通过控制面或 `/runners/me` 查到稳定 Region ID，再填写 `EXPECTED_REGION`。
- Token 已泄漏或机器迁移完成后，在控制面轮换，并重建 Runner 容器。
- 若 `/api/runners/me` 的 `name` 或 `region` 与用户目标不一致，停止操作。
