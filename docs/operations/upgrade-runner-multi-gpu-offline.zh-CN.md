# 存量 Runner 离线升级并启用多卡

本文用于把已经运行的容器化 Daytona Runner 升级到支持单个 Sandbox 多卡分配的版本。目标 Runner 主机不需要访问 Docker Hub、`docker.1ms.run` 或任何其他镜像仓库：镜像在可联网的源机器构建并打包，目标机只校验并加载离线归档，然后替换 Runner 容器。

本文假设 Runner 使用 Docker-in-Docker（DinD）模式，并使用仓库中的 `skills/daytona-runner-onboard/scripts/`。systemd `.deb` Runner 不适用 `install-runner.sh` 的容器替换步骤，应按同样的发布顺序替换二进制并重启 systemd 服务。

## 1. 变更内容和发布顺序

新版 Runner 在健康上报中发送：

```json
{
  "capabilities": {
    "multiGpuPerSandbox": true
  }
}
```

控制面只会把 `multiGpuPerSandbox=true` 的 Runner 用于 `gpu > 1` 的 Sandbox。旧 Runner 在 API 升级后仍可运行单卡 Sandbox，多卡请求在它上报能力之前必须保持不可调度。

按以下顺序发布：

1. 备份数据库，并运行 API 的 pre-deploy migration。
2. 部署包含多卡调度代码的 API。
3. 将目标存量 Runner 标记为 `unschedulable` 或 `draining`，停止接收新 Sandbox。
4. 在源机器构建带多卡代码的 Runner 镜像，并生成离线包。
5. 在目标机校验并加载镜像，重新生成本机 NVIDIA CDI 文件，替换 Runner 容器。
6. 确认 Runner 健康、GPU 数量和 `multiGpuPerSandbox` 能力已上报。
7. 先创建 `gpu=2` 的验收 Sandbox，验收通过后再开放生产多卡请求。

不要在 API migration 或新版 API 部署前创建多卡 Sandbox。不要让同一个 Runner Token 同时运行在旧容器和新容器中。

## 2. 参数和安全边界

以下变量只在示例中使用占位符，执行前替换为实际值：

```bash
export API_URL='https://<control-plane>/api'
export RUNNER_NAME='<existing-runner-name>'
export RUNNER_DOMAIN='<runner-address-reachable-by-control-plane>'
export RUNNER_API_PORT='3004'
export EXPECTED_REGION='<custom-region-id>'
export RUNNER_CONTAINER_NAME="daytona-runner-${RUNNER_NAME}"
export VERSION='v0.187.0-multi-gpu.1'
export RUNNER_IMAGE="daytona-runner-multi-gpu:${VERSION}"
export SANDBOX_IMAGE='daytonaio/sandbox:0.5.0-slim'
```

- `API_URL` 必须是 Runner 访问的 API 根地址并以 `/api` 结尾，不能填 Dashboard 的 `/dashboard` 地址。
- `RUNNER_NAME` 必须与现有 Runner 记录和 Token 一致；不要用容器名代替 Runner 名称。
- `RUNNER_DOMAIN` 和 `RUNNER_API_PORT` 必须是控制面能访问的地址和端口。
- 生产镜像使用精确版本标签，不使用 `latest`。
- Token 只放在目标机 `/etc/daytona/runner.token`，要求 `root:root` 且权限为 `0600` 或更严格。Token 不得出现在离线包、命令行、日志、Git 或本文档中。
- 不要复制其他主机的 CDI 文件。每台 GPU 主机都必须重新生成。

检查目标机 Token 文件时只输出元数据，不输出内容：

```bash
sudo test -s /etc/daytona/runner.token
sudo stat -c '%U:%G %a %n' /etc/daytona/runner.token
```

预期输出的属主为 `root:root`，权限为 `600`（`400` 也可以）。

## 3. 升级前保护存量 Runner

### 3.1 API migration

在 API 发布机执行 migration。具体数据库连接变量沿用现有 API 部署配置：

```bash
nix develop .#node --command yarn migration:run:pre-deploy
```

本次 migration 为 `apps/api/src/migrations/pre-deploy/1784280000000-migration.ts`，新增 `runner.capabilities` JSONB 字段，默认值为 `{}`。确认 migration 已在目标数据库完成后，再部署 API。部署后确认 API 日志没有 migration 或 schema 错误。

### 3.2 Drain 和现场盘点

在 Dashboard 将 Runner 设为不可调度/排空，或者使用现有运维 API 完成同等操作。等待调度器不再给它分配新 Sandbox，并记录维护窗口内仍在运行的 Sandbox。

在目标机保存旧容器配置、镜像和 volume 信息：

```bash
docker inspect "$RUNNER_CONTAINER_NAME" > "/var/tmp/${RUNNER_CONTAINER_NAME}.inspect.json"
docker inspect --format '{{.Config.Image}}' "$RUNNER_CONTAINER_NAME"
docker inspect --format '{{range .Mounts}}{{println .Name .Destination}}{{end}}' "$RUNNER_CONTAINER_NAME"
docker ps -a --format '{{.ID}}\t{{.Names}}\t{{.Label "daytona.gpu_indices"}}\t{{.Label "daytona.gpu_index"}}'
docker volume ls --format '{{.Name}}' | grep -E "${RUNNER_CONTAINER_NAME}-(docker|data)$" || true
```

`install-runner.sh` 默认使用以下命名 volume：

```text
${RUNNER_CONTAINER_NAME}-docker:/var/lib/docker
${RUNNER_CONTAINER_NAME}-data:/home/daytona
```

只有当 `docker inspect` 确认旧容器使用的 volume 名称与上述名称一致时，才直接使用该脚本替换。名称不一致时不要继续，否则新容器可能挂载空 volume；应先按现有部署方式制作等价的替换配置，或显式迁移并核对 volume。无论采用哪种方式，都不要删除旧 volume。

升级前必须确认：

- 旧 Runner 已 drain，或用户明确批准在维护窗口中中断存量 Sandbox。
- 没有需要保留的运行中 Sandbox，或者已有迁移/停止方案。
- 目标机磁盘空间足够，尤其是 DinD 的 `/var/lib/docker` volume。
- 不会执行 `docker system prune`，也不会删除旧镜像和命名 volume。

## 4. 源机器构建和打包

以下步骤在可访问代码依赖和镜像源的源机器执行，目标 Runner 主机不执行 `docker pull`，也不需要解析 `docker.1ms.run`。源码必须包含本次多卡改动以及 `apps/api/src/migrations/pre-deploy/1784280000000-migration.ts`。如果源机器也无法访问这些基础镜像，应在另一台可联网构建机完成整个 Runner 镜像，再只传输本节生成的离线包。

### 4.1 构建 Runner 镜像

仓库的 `apps/runner/Dockerfile` 已固定使用 `docker.1ms.run/library/golang:1.25.7-alpine` 作为 Go 工具链。先准备 Node 依赖和 Docker BuildKit：

该 Go 镜像只存在于 Dockerfile 的构建阶段，不会进入最终 Runner 运行时镜像，也不需要单独传到目标机。目标机只加载最终的 `RUNNER_IMAGE` 和实际会被 Sandbox 使用的镜像。

```bash
nix develop .#node --command yarn install --immutable
docker buildx version
docker pull docker.1ms.run/library/golang:1.25.7-alpine
```

使用仓库已有 Nx Docker 目标构建 AMD64 镜像。`--configuration=pr-build` 禁止推送，`--load` 将结果加载到源机器的本地 Docker 镜像库：

```bash
env -u ARCH VERSION="$VERSION" nix develop .#node --command \
  ./node_modules/.bin/nx run runner:docker \
  --configuration=pr-build \
  --load

docker image inspect "daytonaio/daytona-runner:${VERSION}"
docker tag "daytonaio/daytona-runner:${VERSION}" "$RUNNER_IMAGE"
docker image inspect "$RUNNER_IMAGE"
```

如果所用 Nx 版本不接受命令行 `--load`，使用等价的 BuildKit 命令。先生成 Dockerfile 所需的 computer-use AMD64 二进制，再直接构建：

```bash
env -u ARCH VERSION="$VERSION" nix develop .#node --command \
  ./node_modules/.bin/nx run computer-use:build-amd64 \
  --configuration=production

docker buildx build \
  --platform linux/amd64 \
  --load \
  --build-arg "VERSION=${VERSION}" \
  --tag "$RUNNER_IMAGE" \
  --file apps/runner/Dockerfile \
  .
```

构建完成后必须能在源机器上 `docker image inspect "$RUNNER_IMAGE"`。镜像 tag 必须包含版本号；不要用 `latest` 覆盖旧版本。

### 4.2 选择并打包镜像

`bundle-images.sh` 只打包本地镜像。不要在这里使用 `--build-gpu`，因为 Runner 镜像已经由当前源码构建完成；`--build-gpu` 仅用于给已有镜像增加 gcompat/CA 层。

至少把 Runner 镜像和验收用 Sandbox 镜像打包。目标机还无法拉取的业务 Sandbox、Snapshot 或构建基础镜像也必须逐一加入 `--include`：

```bash
mkdir -p dist/runner-bundles
skills/daytona-runner-onboard/scripts/bundle-images.sh \
  --runner-image "$RUNNER_IMAGE" \
  --include "$SANDBOX_IMAGE" \
  --output "dist/runner-bundles/daytona-runner-multi-gpu-${VERSION}.tar.gz"
```

脚本会生成三个文件：

```text
daytona-runner-multi-gpu-<version>.tar.gz
daytona-runner-multi-gpu-<version>.tar.gz.sha256
daytona-runner-multi-gpu-<version>.tar.gz.manifest
```

核对 manifest 和归档校验和，然后通过受控介质或内部文件传输服务将三个文件传到目标机。不要把 Token、AWS Secret、SSH 私钥或目标机 CDI 文件放入归档。

目标机还需要能执行仓库中的 `bundle-images.sh`、`load-images.sh`、`generate-cdi.sh`、`install-runner.sh` 和 `verify-runner.sh`。可随代码发布包传输 `skills/daytona-runner-onboard/`，或单独传输这些脚本；脚本包中同样不得包含 Token、密钥或 CDI 文件。

```bash
cat "dist/runner-bundles/daytona-runner-multi-gpu-${VERSION}.tar.gz.manifest"
sha256sum -c "dist/runner-bundles/daytona-runner-multi-gpu-${VERSION}.tar.gz.sha256"
```

## 5. 目标机离线加载

目标机不需要 Docker Hub、`docker.1ms.run` 或任何 registry 的访问权限。把归档、`.sha256` 和 `.manifest` 放在同一目录后执行：

```bash
sudo bash skills/daytona-runner-onboard/scripts/load-images.sh \
  --archive "/path/daytona-runner-multi-gpu-${VERSION}.tar.gz"
```

脚本默认先校验 SHA-256，再执行 `gzip -dc | docker load`。确认精确 tag 已加载，且没有发生隐式拉取：

```bash
docker image inspect "$RUNNER_IMAGE"
docker image inspect "$SANDBOX_IMAGE"
docker image ls --no-trunc "$RUNNER_IMAGE" "$SANDBOX_IMAGE"
```

如果 `docker image inspect` 失败，停止操作并重新传输离线包；不要在目标机执行 `docker pull`，也不要让 Runner 通过外部 registry 补拉 Sandbox 镜像。

目标机不要运行 `bundle-images.sh --build-gpu`、`docker build` 或任何会解析 `FROM` 的命令；这些操作可能尝试访问基础镜像仓库。

若校验文件缺失，不要直接加 `--skip-checksum`；应重新传输归档和校验文件，只有在已完成独立完整性校验并得到变更批准时才允许跳过。

## 6. 目标机重新生成 NVIDIA CDI

仅对 `GPU_ENABLED=true` 的 Runner 执行。目标机需要已安装驱动、NVIDIA Container Toolkit，并且宿主 `nvidia-smi` 可见全部 GPU：

```bash
nvidia-smi -L
sudo bash skills/daytona-runner-onboard/scripts/generate-cdi.sh \
  --output /etc/daytona/nvidia-cdi.yaml
grep -q '^kind: nvidia.com/gpu$' /etc/daytona/nvidia-cdi.yaml
grep -nE 'nvidia.com/gpu|hostPath|deviceNodes' /etc/daytona/nvidia-cdi.yaml | head -80
```

不要从源机器或另一台 GPU 主机复制 CDI。驱动升级、宿主路径布局变化或 CDI 报 `hostPath ... no such file` 时，都要在目标机重新运行脚本。该文件不应进入镜像离线包。

## 7. 替换存量 Runner

### 7.1 Dry-run

先确认 Token 文件元数据，然后执行 dry-run。`install-runner.sh` 会检查本地镜像、GPU 和 CDI，并只打印将要执行的 `docker run`；Token 会被脱敏：

```bash
sudo test -s /etc/daytona/runner.token
sudo stat -c '%U:%G %a %n' /etc/daytona/runner.token

sudo env \
  DAYTONA_API_URL="$API_URL" \
  RUNNER_NAME="$RUNNER_NAME" \
  RUNNER_DOMAIN="$RUNNER_DOMAIN" \
  RUNNER_API_PORT="$RUNNER_API_PORT" \
  RUNNER_CONTAINER_NAME="$RUNNER_CONTAINER_NAME" \
  RUNNER_IMAGE="$RUNNER_IMAGE" \
  GPU_ENABLED='true' \
  RUNNER_CDI_SPEC='/etc/daytona/nvidia-cdi.yaml' \
  RUNNER_PRELOAD_IMAGES="$SANDBOX_IMAGE" \
  REPLACE_EXISTING='true' \
  DRY_RUN='true' \
  bash skills/daytona-runner-onboard/scripts/install-runner.sh
```

检查 dry-run 输出中的容器名、镜像 tag、端口、`--gpus all`、CDI 挂载和两个 volume。任何 `DAYTONA_RUNNER_TOKEN=`、AWS Secret 或其他秘密都不应以明文出现。

### 7.2 实际替换

在已批准的维护窗口执行同一命令，去掉 `DRY_RUN`：

```bash
sudo env \
  DAYTONA_API_URL="$API_URL" \
  RUNNER_NAME="$RUNNER_NAME" \
  RUNNER_DOMAIN="$RUNNER_DOMAIN" \
  RUNNER_API_PORT="$RUNNER_API_PORT" \
  RUNNER_CONTAINER_NAME="$RUNNER_CONTAINER_NAME" \
  RUNNER_IMAGE="$RUNNER_IMAGE" \
  GPU_ENABLED='true' \
  RUNNER_CDI_SPEC='/etc/daytona/nvidia-cdi.yaml' \
  RUNNER_PRELOAD_IMAGES="$SANDBOX_IMAGE" \
  REPLACE_EXISTING='true' \
  bash skills/daytona-runner-onboard/scripts/install-runner.sh
```

`REPLACE_EXISTING=true` 会执行 `docker rm -f` 删除旧 Runner 容器，然后创建同名新容器。脚本不会删除 named volume 或旧镜像，但替换期间该 Runner 的存量 Sandbox 可能中断，因此必须先 drain。若旧部署还使用了 `AWS_*`、`RUNNER_DOCKER_NETWORK`、`SSH_GATEWAY_ENABLE` 或网络策略等配置，应根据保存的 inspect 结果补齐相应的非秘密变量。

## 8. 验收

### 8.1 Runner 本机和控制面

```bash
docker inspect --format '{{.State.Health.Status}}' "$RUNNER_CONTAINER_NAME"
curl --fail-with-body "http://127.0.0.1:${RUNNER_API_PORT}/"

sudo env \
  DAYTONA_API_URL="$API_URL" \
  RUNNER_NAME="$RUNNER_NAME" \
  RUNNER_CONTAINER_NAME="$RUNNER_CONTAINER_NAME" \
  EXPECTED_REGION="$EXPECTED_REGION" \
  GPU_ENABLED='true' \
  GPU_SMOKE_IMAGE="$SANDBOX_IMAGE" \
  bash skills/daytona-runner-onboard/scripts/verify-runner.sh
```

验证脚本会检查容器健康、Runner 名称、Region ID、API v2、控制面 GPU 数量、外层容器 GPU 可见性，以及内层 Docker 的单卡 CDI smoke test。它不会输出 Token。

新版 Runner 健康上报后，控制面数据库中对应记录应包含 capability。由于当前 `RunnerFullDto` 不直接返回该字段，用只读数据库账号执行类似查询：

```sql
SELECT "name", "state", "gpu", "capabilities", "lastChecked"
FROM runner
WHERE "name" = '<existing-runner-name>';
```

预期 `capabilities` 至少包含 `{"multiGpuPerSandbox": true}`，`state` 为 `ready`，`gpu` 与 `nvidia-smi -L` 数量一致，`lastChecked` 持续更新。

### 8.2 多卡 Sandbox 验收

先创建一个小规模 `gpu=2` Sandbox：

```bash
daytona create \
  --target "$EXPECTED_REGION" \
  --gpu 2 \
  --name "multi-gpu-smoke-${VERSION}"
```

在目标 Runner 的内层 Docker 检查容器标签和设备请求：

```bash
docker exec "$RUNNER_CONTAINER_NAME" docker ps -a \
  --filter 'label=daytona.gpu_indices' \
  --format '{{.Names}} {{.Label "daytona.gpu_indices"}} {{.Label "daytona.gpu_index"}}'
docker exec "$RUNNER_CONTAINER_NAME" docker inspect <sandbox-container> \
  --format '{{json .HostConfig.DeviceRequests}}'
```

验收条件：

- Sandbox 成功创建、启动、执行 `nvidia-smi -L` 并销毁。
- `daytona.gpu_indices` 是两个不同的宿主 GPU index；旧的单值 `daytona.gpu_index` 仍能被单卡容器识别。
- `DeviceRequests` 包含两个对应的 `nvidia.com/gpu=<index>` 设备请求。
- Sandbox 内 `nvidia-smi -L` 恰好显示两张 GPU，且看不到未分配的卡。
- 同时创建两个多卡请求时，两个 Sandbox 的 index 集合不重叠；释放后新请求能够复用已释放的 index。
- Runner 重启后，已有容器标签仍能恢复占用状态，不出现重复分配。

验收完成后删除 smoke Sandbox，并在 Dashboard 取消 drain/unschedulable。多卡能力上线前不要直接把所有生产流量切换到新 Runner。

## 9. 失败处理和回滚

### 9.1 新 Runner 未注册或不健康

保留以下信息用于排查，不要删除旧 volume：

```bash
docker logs --tail=200 "$RUNNER_CONTAINER_NAME"
docker inspect "$RUNNER_CONTAINER_NAME" > "/var/tmp/${RUNNER_CONTAINER_NAME}-failed.inspect.json"
```

常见原因：API 地址误填了 `/dashboard`、Token 不属于该 Runner、目标机 CDI 路径不匹配、外层 Runner 没有 `--gpus all`、离线包未包含 `RUNNER_PRELOAD_IMAGES` 指定的镜像，或旧 volume 名称不一致。

### 9.2 回滚条件和顺序

仅在多卡 Sandbox 全部停止/删除并确认没有多值 GPU 标签后回滚：

1. API 停止接受新的 `gpu > 1` 请求，或暂时关闭多卡入口。
2. 停止、迁移或删除所有多卡 Sandbox。
3. 确认目标 Runner 内没有 `daytona.gpu_indices` 多值标签。
4. 保留当前 named volume 和旧镜像，使用旧 Runner 镜像重新执行第 7 节替换。
5. 验证旧 Runner 回到 `ready` 后，再取消 drain。

```bash
export RUNNER_IMAGE='daytona-runner-gpu:<previous-version>'
# 重新执行 install-runner.sh，仍使用同一个 RUNNER_CONTAINER_NAME 和 named volumes
```

不能在多卡 Sandbox 仍存在时直接回滚。旧 Runner 不认识 `daytona.gpu_indices`，可能把已占用的 GPU 再次分配给其他 Sandbox。任何情况下都不要用 `docker system prune` 代替有针对性的清理。

## 10. 相关文件

- [多卡设计文档](../single-runner-multi-gpu-design.zh-CN.md)
- [Runner 接入手册](add-runner.zh-CN.md)
- [离线 GPU 说明](../../skills/daytona-runner-onboard/references/offline-gpu.md)
- [参数清单](../../skills/daytona-runner-onboard/references/parameters.md)
- [镜像打包脚本](../../skills/daytona-runner-onboard/scripts/bundle-images.sh)
- [镜像加载脚本](../../skills/daytona-runner-onboard/scripts/load-images.sh)
- [Runner 安装脚本](../../skills/daytona-runner-onboard/scripts/install-runner.sh)
- [Runner 验证脚本](../../skills/daytona-runner-onboard/scripts/verify-runner.sh)
- [CDI 生成脚本](../../skills/daytona-runner-onboard/scripts/generate-cdi.sh)
