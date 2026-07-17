# Daytona Runner 接入操作手册

本文说明如何把一台 Linux 机器注册为 Daytona v2 Runner、启动服务并验证接入结果。文中的 Runner 是 Daytona 计算节点，不是 GitHub Actions Runner。

## 1. 接入模型

接入分为两个动作：

1. 在 Daytona 控制面创建 Runner 记录，得到一次性 `DAYTONA_RUNNER_TOKEN`。
2. 在计算节点运行 Runner 进程，使其携带该 Token 访问 `DAYTONA_API_URL`。Runner 会主动轮询任务并上报健康状态；v2 模式不依赖控制面主动访问 Runner API。

同一台宿主机通常只运行一个 Runner。不要复用其他 Runner 的 Token，否则两个进程会被控制面识别为同一节点。

## 2. 上线前检查

### 控制面准备

- 已有一个归属当前组织的 **Custom Region**。组织用户不能向 shared/dedicated region 添加自管 Runner。
- 已启用 `ORGANIZATION_INFRASTRUCTURE` 功能，并拥有创建 Runner 的权限。
- 可以访问 Daytona Dashboard，或持有可调用 `POST /api/runners` 的组织 API Token。
- 已确定 Runner 到控制面 API 的地址，例如 `https://app.example.com/api`；不要漏掉 `/api`。

### 计算节点准备

- Linux AMD64/x86_64。仓库当前发布流程只产出 AMD64 Runner 二进制和 `.deb`。
- Docker daemon 可用；执行 `docker info` 必须成功。
- 至少预留一个 API 监听端口，默认 `8080`；仓库 Docker Compose 示例使用 `3003`。
- Runner 能通过 HTTPS/HTTP 访问控制面 API、镜像仓库和对象存储。若需要从控制面直接访问 Runner API/代理，再配置入站端口和 `RUNNER_DOMAIN`。
- 生产环境建议使用 Ubuntu 22.04 或更新版本及 systemd。仓库提供的 `.deb` 安装脚本依赖 systemd。
- 建议让 Daytona 独占 Docker daemon 或独占机器。Runner 会创建/删除容器、镜像、卷、网络和 iptables 规则，不应和无关生产容器共用 daemon。
- 确认磁盘空间充足。磁盘使用率会参与 Runner 健康与调度评分。

快速检查：

```bash
uname -m
docker version
docker info
df -h
curl -fsS https://app.example.com/api/health || true
```

如需 GPU Sandbox，还要安装 NVIDIA 驱动和 NVIDIA Container Toolkit，并先验证：

```bash
nvidia-smi
docker run --rm --gpus all <内部已缓存的 CUDA 镜像> nvidia-smi
```

## 3. 在控制面创建 Runner

### Dashboard 方式

1. 打开 **Dashboard -> Regions**，确认或创建 Custom Region。
2. 打开 **Dashboard -> Runners -> Create Runner**。
3. 选择 Custom Region，填写唯一名称并创建。
4. 立即保存页面展示的 Runner Token；该值只展示一次。

### API 方式

如果组织要求显式组织头，设置 `X-Daytona-Organization-ID`。不要把 Token 写入 shell 历史或提交到 Git。

```bash
export DAYTONA_CONTROL_PLANE='https://app.example.com'
export DAYTONA_ORGANIZATION_ID='<organization-id>'
export DAYTONA_USER_TOKEN='<organization-api-token>'
export DAYTONA_REGION_ID='<custom-region-id>'
export DAYTONA_RUNNER_NAME='<unique-runner-name>'

curl --fail-with-body "$DAYTONA_CONTROL_PLANE/api/runners" \
  --request POST \
  --header 'Content-Type: application/json' \
  --header "Authorization: Bearer $DAYTONA_USER_TOKEN" \
  --header "X-Daytona-Organization-ID: $DAYTONA_ORGANIZATION_ID" \
  --data "{\"name\":\"$DAYTONA_RUNNER_NAME\",\"regionId\":\"$DAYTONA_REGION_ID\"}"
```

响应中的 `apiKey` 就是后续配置的 `DAYTONA_RUNNER_TOKEN`：

```json
{
  "id": "<runner-uuid>",
  "apiKey": "<one-time-runner-token>"
}
```

## 4. 安装与配置

### 方案 A：官方 `.deb` + systemd（生产推荐）

从对应 GitHub Release 下载与控制面兼容的 `daytona-runner-<version>-amd64.deb`，核验校验和后安装：

```bash
sudo apt install ./daytona-runner-<version>-amd64.deb
```

安装包会放置：

- 二进制：`/opt/daytona/runner`
- 配置：`/etc/daytona/runner.env`
- 数据目录：`/var/lib/daytona/runner`
- systemd 单元：`daytona-runner.service`

编辑 `/etc/daytona/runner.env`。至少配置前两项：

```dotenv
DAYTONA_API_URL=https://app.example.com/api
DAYTONA_RUNNER_TOKEN=<one-time-runner-token>

# 建议显式设置
API_VERSION=2
API_PORT=8080
RUNNER_DOMAIN=runner-01.internal.example.com
LOG_FILE_PATH=/var/log/daytona/runner.log
INTER_SANDBOX_NETWORK_ENABLED=false
RESOURCE_LIMITS_DISABLED=false

# 需要调度 GPU Sandbox 时启用
GPU_ENABLED=false

# 使用快照/备份时按部署填写 S3 或兼容存储
AWS_ENDPOINT_URL=https://s3.example.com
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<access-key>
AWS_SECRET_ACCESS_KEY=<secret-key>
AWS_DEFAULT_BUCKET=daytona
```

配置文件含密钥，权限应为 `0600`：

```bash
sudo chown root:root /etc/daytona/runner.env
sudo chmod 600 /etc/daytona/runner.env
sudo systemctl enable --now daytona-runner
```

说明：

- `DAYTONA_API_URL` 是控制面 API 根地址。
- `DAYTONA_RUNNER_TOKEN` 必须来自本次创建的 Runner。
- `RUNNER_DOMAIN` 会随健康上报写入控制面；使用可被相关服务解析/访问的主机名或 IP。若不设置，Runner 会从默认路由推断本机 IPv4。
- `INTER_SANDBOX_NETWORK_ENABLED=false` 会阻止同一 Runner 上的 Sandbox 默认互通，除非业务明确要求，否则不要打开。
- 只有 Docker 环境无法使用 cgroup 资源限制时才设 `RESOURCE_LIMITS_DISABLED=true`。
- `GPU_ENABLED=true` 只会触发 GPU 发现；驱动、容器运行时与设备能力仍需在主机侧先配置好。
- Runner 使用 CDI 设备名 `nvidia.com/gpu=N` 给 Sandbox 分配单卡。容器化 Runner 除了设置 `GPU_ENABLED=true` 和 `--gpus all`，还必须让内层 Docker daemon 读取与自身文件系统一致的 NVIDIA CDI spec；可参考同目录的 `runner-nvidia-cdi.min.yaml`，并按宿主驱动版本更新库文件名。

### 方案 B：容器化 Runner

官方 `daytonaio/daytona-runner` 镜像以 Docker-in-Docker 方式启动，必须授予高权限。生产环境应固定版本，不要使用 `latest`。下面是最小 Compose 模板；对象存储参数按实际环境补充：

```yaml
services:
  runner:
    image: daytona-runner-gpu:<version>
    privileged: true
    restart: unless-stopped
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    ports:
      - "8080:8080"
    environment:
      DAYTONA_API_URL: https://app.example.com/api
      DAYTONA_RUNNER_TOKEN: ${DAYTONA_RUNNER_TOKEN}
      API_VERSION: "2"
      API_PORT: "8080"
      RUNNER_DOMAIN: runner-01.internal.example.com
      LOG_FILE_PATH: /var/lib/daytona/runner.log
      INTER_SANDBOX_NETWORK_ENABLED: "false"
      RESOURCE_LIMITS_DISABLED: "true"
      GPU_ENABLED: "true"
      NVIDIA_DRIVER_CAPABILITIES: compute,utility
    volumes:
      - runner-docker:/var/lib/docker
      - runner-data:/var/lib/daytona
      - ./runner-nvidia-cdi.min.yaml:/etc/cdi/nvidia.yaml:ro

volumes:
  runner-docker:
  runner-data:
```

将 Token 放入不入库的 `.env` 或 secret manager 后启动：

```bash
chmod 600 .env
docker compose up -d runner
```

容器方案默认使用容器内独立 Docker daemon。不要把宿主机 `/var/run/docker.sock` 暴露给来源不可信的 Runner 容器。

GPU 版 Runner 镜像需要让 Alpine 基础镜像能够执行宿主 NVIDIA 工具。当前实测镜像是在官方 Runner 镜像上增加 `gcompat`；可直接使用同目录的 `runner-gpu.Dockerfile`。迁移到当前自签名 HTTPS Server 时还需加入 CA，仓库 Skill 内的 [GPU Dockerfile](../../skills/daytona-runner-onboard/assets/runner-gpu.Dockerfile) 已包含这两项：

```dockerfile
FROM daytonaio/daytona-runner:v0.187.0
RUN apk add --no-cache gcompat
```

启动外层 Runner 容器时还需传入 `--gpus all`（Compose 可使用 GPU device reservation）。CDI spec 应由 `nvidia-ctk cdi generate` 生成后审查；DinD 场景下生成文件中的 `hostPath` 必须指向 Runner 容器内实际存在的驱动文件，而不是宿主机原始路径。

## 5. 验收

### 进程与本地接口

systemd 安装：

```bash
sudo systemctl status daytona-runner --no-pager
sudo journalctl -u daytona-runner -n 100 --no-pager
curl -fsS http://127.0.0.1:8080/
curl -fsS http://127.0.0.1:8080/info \
  --header "Authorization: Bearer $DAYTONA_RUNNER_TOKEN"
```

容器安装：

```bash
docker compose ps runner
docker compose logs --tail=100 runner
curl -fsS http://127.0.0.1:8080/
```

根路径应返回 `status: ok`；`/info` 中 `serviceHealth` 的 Docker 状态应为 healthy。不要把携带 Token 的命令输出粘贴到公共工单。

### 控制面

创建 Runner 的组织用户可以在 Dashboard 查看状态；Runner Token 可直接验证它绑定的 Runner：

```bash
curl --fail-with-body "$DAYTONA_CONTROL_PLANE/api/runners/me" \
  --header "Authorization: Bearer $DAYTONA_RUNNER_TOKEN"
```

验收标准：

- `state` 为 `ready`；
- `apiVersion` 为 `2`；
- `lastChecked` 持续更新（默认约每 30 秒上报一次，以实际配置为准）；
- `serviceHealth` 中 Docker healthy；
- CPU、内存、磁盘容量与机器预期一致；
- `unschedulable` 为 `false`；
- 创建一个最小 Sandbox 能完成 create/start/exec/destroy 全流程。

## 6. 常见故障

| 现象 | 检查与处理 |
| --- | --- |
| `401 Unauthorized` | Token 是否属于该 Runner；请求头是否为 `Authorization: Bearer <token>`；控制面和 Runner 配置是否误用了用户 Token。 |
| Runner 一直 `unresponsive` | 检查节点到 `DAYTONA_API_URL` 的 DNS、TLS、代理和防火墙；查看 `lastChecked` 与 Runner 日志。 |
| `failed to get Docker info` | 确认 Docker daemon 正常，运行 Runner 的用户有 Docker 权限；容器部署需 `privileged: true`。 |
| `/info` 返回 401 | Header 必须包含 `Bearer ` 前缀。 |
| Sandbox 无法联网或互相访问 | 核对 `INTER_SANDBOX_NETWORK_ENABLED`、主机 iptables/nftables 后端和 `DOCKER-USER` 链；不要为规避报错直接放宽网络隔离。 |
| 磁盘指标过高、可用性评分低 | 清理不再使用的镜像/卷，扩容 Docker Root Dir；清理前确认不会影响存量 Sandbox。 |
| GPU 数量为 0 | 检查 `GPU_ENABLED=true`、`nvidia-smi`、NVIDIA Container Toolkit，以及 Runner 进程/容器是否能看到设备。 |
| 快照或备份失败 | 检查 `AWS_*` 配置、bucket 权限、endpoint 可达性和镜像仓库访问。 |

## 7. 下线与回滚

1. 先在 Dashboard 将 Runner 标记为不可调度，停止接收新 Sandbox。
2. 迁移或销毁该节点上的存量 Sandbox。
3. 停止服务：`sudo systemctl stop daytona-runner` 或 `docker compose stop runner`。
4. 在 Dashboard 删除 Runner，或调用 `DELETE /api/runners/{runnerId}`。
5. 删除/轮换 Runner Token，并按数据保留策略处理 Docker 数据与日志。

不要直接删除仍承载 Sandbox 的 Runner，也不要在未确认数据归属前执行 `docker system prune`。

## 8. 使用 Skill 离线迁移

仓库内已提供可迁移 Skill：`skills/daytona-runner-onboard/`。它包含参数清单、当前 Server CA、GPU Runner Dockerfile，以及镜像打包、加载、CDI 生成、安装和验证脚本。复制到其他机器的 Codex 环境时，可放到 `$CODEX_HOME/skills/daytona-runner-onboard/`；也可以直接从仓库目录执行脚本。

在可访问镜像源的机器构建并打包：

```bash
skills/daytona-runner-onboard/scripts/bundle-images.sh \
  --build-gpu \
  --base-runner-image daytona-runner-gpu:v0.187.0 \
  --runner-image daytona-runner-gpu-current-server:v0.187.0 \
  --include daytonaio/sandbox:0.5.0-slim \
  --output dist/runner-bundles/daytona-runner-gpu-v0.187.0.tar.gz
```

向目标机传输整个 Skill 目录，以及生成的 `.tar.gz`、`.sha256` 和 `.manifest`。Token 不得随镜像包传输；应通过独立安全通道写入目标机 `/etc/daytona/runner.token`，权限设为 `0600`。目标机先运行 `load-images.sh`，GPU 机器再运行 `generate-cdi.sh`，最后按 Skill 的 `SKILL.md` 执行 `install-runner.sh` 和 `verify-runner.sh`。

迁移到当前 Server 时，外部 API 地址是 `https://10-127-2-18.sslip.io:8999/api`，目标 Custom Region 显示名为 `wn-test`、API ID 为 `wn-test_0pd3`。Skill 内 CA 仅适用于当前证书；若证书发生变化，应替换 CA、重建 GPU Runner 镜像和离线包。每台新机器都必须重新生成 CDI，不能复制本机的 `runner-nvidia-cdi.min.yaml`。

必填项及其语义见 `skills/daytona-runner-onboard/references/parameters.md`。尤其需要为每台机器确认唯一 Runner 名称、绑定该 Runner 的 Token、目标机可达地址、未占用端口、精确镜像标签、是否启用 GPU，以及 `/runners/me` 返回的 Region ID。

## 9. 当前机器实测记录（2026-07-16）

在 `yq01-searcher-gpu-002-v100.yq01.baidu.com` 上检查到：

- Linux x86_64，40 CPU，约 502 GiB 内存；宿主 Docker 24.0.4 可用，支持 `nvidia` runtime。
- 本地 Daytona Compose 栈已经运行，包含 `daytona-runner-1`，映射宿主端口 `3003`。
- 控制面 `GET /api/runners/me` 返回 Runner `default`，状态 `ready`、API v2、应用版本 `v0.187.0`、Docker healthy，`lastChecked` 正常更新。
- 当前 Runner 属于 shared region `us`，是本地 OSS Compose 的默认 Runner；它不等同于新建的组织 Custom Runner。
- 根据本次接入，目标 Custom Region `wn-test_0pd3` 中的 Runner `runner-1` 已运行在容器 `daytona-runner-wn-test-runner-1`，宿主端口为 `3004`。
- 该 Custom Runner 的控制面状态为 `ready`，API v2，应用版本 `v0.187.0`，Docker healthy，`lastChecked` 正常更新。
- 该容器使用容器内 Docker 28.5.2（DinD），不是直接复用宿主 Docker daemon。
- 由于目标入口使用自签名 HTTPS 证书，Runner 在同一 Docker 网络中使用 `http://api:3000/api` 访问控制面；对外健康上报地址为 `http://10.127.2.18:3004`。跨主机部署时必须改为受信任的 HTTPS API 地址，不能照搬这个内部地址。
- 当前磁盘使用率约 95.3%，正式接入更多负载前必须先扩容或安全清理。
- Runner 日志持续报告 iptables backend/`DOCKER-USER` 链异常；应统一 legacy/nft 后端并完成 Sandbox 网络策略测试。
- `runner-1` 已启用 `GPU_ENABLED=true`，控制面报告 `gpu=8`；Runner 内可以识别 8 张 Tesla V100-SXM2-32GB（每张 32768 MiB）。
- 当前 API 的 GPU 类型枚举只包含 H100 和 RTX PRO 6000，因此 V100 会保留为 `gpuType=null`；不指定 GPU 类型时可按 GPU 数量调度，指定 V100 类型则当前版本不支持。
- 已通过内层 Docker CDI 单卡冒烟验证：以 `nvidia.com/gpu=0` 创建设备请求，Sandbox 中只显示一张 V100，`nvidia-smi -L` 和设备节点检查均成功。
- GPU 使用的精简 CDI 配置保存在 `docs/operations/runner-nvidia-cdi.min.yaml`；它包含驱动版本 `525.125.06` 的路径，升级驱动后必须重新生成并验证。
- 本次使用 `SSH_GATEWAY_ENABLE=false` 启动，Sandbox SSH 能力尚未验收；需要 SSH 时应先为 Custom Region 配置 SSH Gateway，再重新配置 Runner。

结论：当前机器同时存在本地 OSS 的 `default` Runner，以及目标 Custom Region `wn-test_0pd3` 的 GPU Runner `runner-1`，两者均已处于 `ready`。正式承载更多负载前，仍需处理磁盘、iptables，并按需配置 SSH Gateway。
