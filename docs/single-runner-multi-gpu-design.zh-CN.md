# 单 Runner 多 GPU Sandbox 设计

## 文档状态

- 状态：Proposal
- 更新时间：2026-07-17
- 目标场景：单台 Daytona Runner 上的单个 Sandbox 使用多张 NVIDIA GPU
- 首个验证环境：`h200-runner-267`，单机 8 张 H200

## 1. 背景

当前实现已经能够识别一台 Runner 上的 GPU 总数，并让一台多卡 Runner 并发运行多个单卡 Sandbox。每个 GPU Sandbox 在 Runner 上分配一个物理 GPU index，并通过 NVIDIA CDI 只把该设备注入容器。

当前实现不能让一个 Sandbox 同时使用两张或更多 GPU：

- Sandbox 和 Snapshot 的 API 参数把 `gpu` 限制为最大值 1。
- 控制面按 GPU Sandbox 的数量而不是各 Sandbox 请求的 GPU 数量统计 Runner 占用。
- Runner 分配器每次只返回一个 GPU index。
- Docker `DeviceRequests` 每次只包含一个 CDI Device ID。
- 容器标签和 CUDA 环境变量都只描述一个 GPU。

本文设计把现有的单卡分配模型扩展为单机多卡分配模型。它不引入跨 Runner 的分布式作业编排。

## 2. 目标与非目标

### 2.1 目标

1. 用户可以在创建 Sandbox 时通过 `--gpu N` 指定 GPU 数量。
2. 一个 Sandbox 请求的所有 GPU 必须来自同一台 Runner。
3. GPU 分配是原子的：要么一次得到 N 张卡，要么创建失败，不允许部分分配。
4. 多个并发创建请求不能重复使用同一张物理 GPU。
5. 控制面配额、Runner 容量和容器实际可见 GPU 数量保持一致。
6. 单卡 Sandbox 的现有行为保持兼容。
7. Runner 重启后能够根据现有容器标签重建 GPU 占用状态。
8. 支持同一台 8 卡 Runner 上的混合分配，例如 `4 + 2 + 1 + 1`。

### 2.2 非目标

1. 不支持一个 Sandbox 跨多台 Runner 使用 GPU。
2. 不负责 NCCL 多节点网络、RDMA、InfiniBand 或分布式 rendezvous。
3. 不支持 GPU 在线扩容或缩容。修改 GPU 数量需要创建新 Sandbox。
4. 不支持用户指定宿主机 GPU index。
5. 不支持 MIG 或小数 GPU。
6. 第一阶段不做 NVLink/NVSwitch/PCIe 拓扑感知调度。
7. 第一阶段不按 GPU 数量自动放大 CPU、内存和磁盘配额。
8. H200 作为独立 `gpuType` 的枚举支持不在本文范围内；GPU 类型过滤沿用现有行为。

## 3. 核心语义

### 3.1 `gpu` 参数

`gpu` 表示一个 Sandbox 需要独占的物理 GPU 数量：

- `gpu` 必须是整数。
- `gpu = 0` 表示 CPU Sandbox。
- `gpu > 0` 表示 GPU Sandbox。
- 平台允许任意正整数，不把数量限制为 1、2、4、8；实际可调度上限由 Runner 容量和组织 Region GPU 配额决定。
- `gpu` 在 Sandbox 创建后不可修改。

选择任意正整数而不是只允许 2 的幂，是因为平台只负责资源分配。SGLang、PyTorch 或模型结构是否接受对应的 tensor parallel 数量，应由工作负载自行校验。

### 3.2 创建时覆盖 Snapshot 默认值

用户入口为：

```bash
daytona create \
  --name h200-four-gpu-demo \
  --snapshot sglang-0.5.15 \
  --gpu 4 \
  --target "$REGION_ID" \
  --auto-delete 0
```

有效 GPU 数量按以下规则计算：

```text
effectiveGpu = request.gpu is defined ? request.gpu : snapshot.gpu
```

因此：

- 不传 `--gpu` 时保持当前行为，继承 Snapshot 的默认 GPU 数量。
- 传 `--gpu N` 时只覆盖 GPU 数量。
- CPU、内存和磁盘仍继承 Snapshot，第一阶段不允许在基于 Snapshot 创建时覆盖这些资源。
- Snapshot 本身也允许保存大于 1 的默认 GPU 数量，但这不是使用多卡的前提。

当前 CLI 只在 `gpu > 0` 时向 API 发送该字段，因此 `--gpu 0` 不能表达“覆盖一个 GPU Snapshot 并创建 CPU Sandbox”。第一阶段不支持这种降级覆盖。如果以后需要，应把 CLI 参数改成可区分“未设置”和“显式设置 0”的可空类型。

### 3.3 GPU 类型

有效 GPU 类型按以下顺序决定：

1. 请求显式提供 `gpuType` 时，按现有偏好顺序和 Region allowlist 解析。
2. 否则继承 Snapshot 的 `gpuType`。
3. 两者都没有时，不增加 GPU 类型过滤，只要求数量满足。

`effectiveGpu = 0` 时，`gpuType` 必须为空。

### 3.4 生命周期

GPU Sandbox 继续沿用现有 ephemeral 约束：

- 必须设置 `autoDeleteInterval = 0`。
- 第一次停止后立即删除。
- GPU 分配持续到容器被删除，而不是只持续到容器进程退出。
- 退出 SSH 不会停止或删除 Sandbox。

## 4. 当前实现与差距

### 4.1 API

当前 `CreateSandboxDto.gpu` 和 `CreateSnapshotDto.gpu` 都使用 `@Max(1)`，因此服务端会拒绝 `gpu > 1`。

基于 Snapshot 创建时，Controller 会拒绝所有资源参数，包括 `gpu`。这与“创建时通过参数指定 GPU 数量”的目标冲突。

需要调整为：

- `gpu` 使用 `@IsInt()` 和 `@Min(0)`。
- 删除固定的 `@Max(1)`。
- 基于 Snapshot 创建时继续拒绝 `cpu`、`memory` 和 `disk`，但允许 `gpu`。
- `createFromSnapshot` 使用 `effectiveGpu` 执行配额校验、Runner 调度和 Sandbox 持久化。
- OpenAPI 和生成的 API Client 需要重新生成。

### 4.2 控制面调度

当前调度器首先用 `runner.gpu >= requestedGpu` 过滤 Runner，这部分已经表达了数量需求。

容量排除逻辑仍然使用：

```sql
COUNT(gpu_sandbox) >= runner.gpu
```

该逻辑只适用于每个 Sandbox 固定占一张卡。例如，一台 8 卡 Runner 已有一个 4 卡 Sandbox 和一个 2 卡 Sandbox时，`COUNT(*) = 2`，但实际只剩两张卡。

容量判断必须改为：

```text
usedGpu + requestedGpu <= runner.gpu
```

其中 `usedGpu` 是该 Runner 上仍然保留 GPU 所有权的 Sandbox 的 `SUM(sandbox.gpu)`。

### 4.3 Runner 分配器

当前 Runner 分配器：

1. 扫描 Docker 容器。
2. 读取单值标签 `daytona.gpu_index`。
3. 返回最低的一个空闲 GPU index。
4. 在 `ContainerCreate` 完成前持有进程内 mutex。

多卡版本需要一次选择 N 个空闲 index，并在同一个临界区内创建包含完整 GPU 标签的容器。

### 4.4 Docker 设备注入

当前容器配置等价于：

```go
DeviceIDs: []string{"nvidia.com/gpu=3"}
```

多卡容器需要：

```go
DeviceIDs: []string{
    "nvidia.com/gpu=1",
    "nvidia.com/gpu=3",
    "nvidia.com/gpu=5",
    "nvidia.com/gpu=7",
}
```

容器内设备使用逻辑编号 `0..N-1`，不暴露宿主机 index 作为 CUDA 逻辑编号。

## 5. 总体架构

```text
daytona create --gpu N
          |
          v
CreateSandboxDto 校验整数 N
          |
          v
计算 effectiveGpu 和 effectiveGpuType
          |
          v
组织/Region GPU 配额校验
          |
          v
在 Region GPU 调度锁内选择 remainingGpu >= N 的 Runner
          |
          v
持久化 sandbox.gpu=N 和 runnerId
          |
          v
Runner 收到 CreateSandboxDTO.gpuQuota=N
          |
          v
Runner 本地分配器原子选择 N 个 GPU index
          |
          v
ContainerCreate 写入标签并注入 N 个 CDI Device ID
          |
          v
容器内 nvidia-smi 只看到 N 张 GPU
```

控制面负责全局容量决策，Runner 本地分配器是最终一致性和并发安全的第二道校验。Runner 不应信任控制面一定有空闲 GPU。

## 6. API 与数据模型设计

### 6.1 外部创建 API

请求示例：

```json
{
  "name": "h200-four-gpu-demo",
  "snapshot": "sglang-0.5.15",
  "target": "wn-test_0pd3",
  "gpu": 4,
  "autoDeleteInterval": 0
}
```

API 校验：

- 非整数：返回 `400 GPU count must be an integer`。
- 负数：返回 `400 GPU count must be greater than or equal to 0`。
- Region 配额不足：返回现有 GPU quota 错误。
- 没有单台 Runner 能容纳 N 张卡：返回 `400 No runner has N available GPUs`。
- `gpu > 0` 且 `autoDeleteInterval != 0`：继续返回现有 ephemeral 错误。

不设置固定 `@Max(8)`。这样同一套 API 可以支持未来的 16 卡 Runner，实际边界由调度器校验。

### 6.2 Snapshot

`Snapshot.gpu` 保留为默认资源值，数据库字段已经是整数，不需要迁移。

需要放宽 Snapshot DTO 的最大值限制，使管理员能够创建默认 2/4/8 卡的 Snapshot。Snapshot 的镜像内容不因 GPU 数量发生复制；GPU 数量是运行时资源属性。

基于 Snapshot 创建时：

```text
cpu = snapshot.cpu
memory = snapshot.mem
disk = snapshot.disk
gpu = request.gpu ?? snapshot.gpu
```

Snapshot 可用性和预拉取记录不能再假定 `snapshot.gpu` 永远等于 Sandbox 的 GPU 数量。调度时必须以 `sandbox.gpu` 为准；如果已有 Snapshot 的 Runner 没有足够 GPU，应选择同 Region 的其他兼容 GPU Runner并在该 Runner 上拉取镜像。

### 6.3 内部 Runner DTO

`CreateSandboxDTO.GpuQuota` 已经是 `int64`，无需改字段类型。语义从“是否需要 GPU”明确为“需要的物理 GPU 数量”。

Runner 必须校验：

```text
0 <= gpuQuota <= detectedGpuCount
```

当 `GPU_ENABLED=false` 且 `gpuQuota > 0` 时必须显式失败，不能创建一个没有 GPU 的容器。

### 6.4 数据库

以下字段已经可以保存多卡数量：

- `sandbox.gpu`: integer
- `snapshot.gpu`: integer
- `runner.gpu`: number/integer capacity
- Region quota 的 GPU 总量和当前用量

核心功能不需要数据库 schema migration。

如果采用第 11 节的 Runner capability 持久化方案，则需要新增 capability 字段或 JSONB 字段；这是兼容性能力，不是 GPU 数量数据本身的要求。

## 7. 控制面调度设计

### 7.1 Runner 候选过滤

GPU 请求的基础过滤条件：

```text
runner.state == READY
runner.unschedulable == false
runner.draining == false
runner.availabilityScore >= threshold
runner.gpu >= requestedGpu
runner.gpuType 满足请求（如果指定）
runner.sandboxClass 匹配
runner.region 匹配
runner 支持 multiGpuPerSandbox（requestedGpu > 1 时）
```

### 7.2 剩余容量计算

建议把当前 `getRunnersAtGpuCapacity()` 改为接受请求量的接口：

```ts
getRunnersWithoutGpuCapacity(requestedGpu: number): Promise<string[]>
```

等价 SQL：

```sql
SELECT sandbox."runnerId"
FROM sandbox
JOIN runner ON runner.id = sandbox."runnerId"
WHERE sandbox."runnerId" IS NOT NULL
  AND sandbox.gpu > 0
  AND sandbox.state NOT IN ('DESTROYED', 'ARCHIVED', 'BUILD_FAILED')
GROUP BY sandbox."runnerId", runner.gpu
HAVING SUM(sandbox.gpu) + :requestedGpu > runner.gpu;
```

没有任何 GPU Sandbox 的 Runner 不会出现在该查询结果中，因此仍可作为候选。

不能只判断 `SUM(sandbox.gpu) >= runner.gpu`，因为调度器必须考虑当前请求量。示例：8 卡 Runner 已用 6 张，新的 4 卡请求应被排除，新的 2 卡请求可以进入。

### 7.3 所有调度入口必须统一

以下入口都必须使用同一个剩余 GPU 容量函数，不能只比较 Runner 总容量：

- 从 Snapshot 创建 Sandbox。
- 从 Dockerfile/build info 创建 Sandbox。
- Sandbox Start 时重新分配 Runner。
- Snapshot 构建和拉取的初始 Runner 选择。
- Runner draining/migration。
- fork/recover。
- linked Sandbox 指定同一 Runner 的路径。
- Snapshot Runner fallback 路径。

当前部分 fallback 路径只判断 `runner.gpu < sandbox.gpu`，会绕开已使用容量检查。设计要求收敛为一个公共的 `canRunnerFitGpu(runnerId, requestedGpu)` 或批量排除接口。

### 7.4 并发控制

保留现有按 Region 的 Redis 锁：

```text
gpu-runner-assignment:<regionId>
```

锁内操作顺序：

1. 查询 Runner 剩余 GPU。
2. 选择 Runner。
3. 写入带 `sandbox.gpu=N` 和 `runnerId` 的 Sandbox 记录。
4. 提交数据库写入。
5. 释放 Redis 锁。

这样其他 API 实例在获得锁后能从数据库看到新的 GPU 预留。

Runner 本地 mutex 仍然必需，因为：

- 控制面任务可能重试。
- Runner 可能同时处理多个已经入队的创建任务。
- 数据库状态与 Docker 容器状态之间存在短暂延迟。

部署约束保持为一台宿主机只运行一个 Daytona Runner。多个 Runner 进程共享同一个 Docker daemon 时，进程内 mutex 不足以防止竞争，不属于支持场景。

### 7.5 选卡策略

第一阶段选择排序后最小的 N 个空闲 GPU index，不要求连续：

```text
free = [0, 2, 4, 6]
request = 4
allocation = [0, 2, 4, 6]
```

不要求连续可以减少资源碎片和不必要的调度失败。H200 NVSwitch 机器上通常不需要通过连续 index 推断 GPU 拓扑。

如后续需要拓扑优化，应通过 NVML 或 `nvidia-smi topo -m` 建模，不应假设 index 连续就代表链路更优。

## 8. Runner GPU 分配器设计

### 8.1 接口

将单卡接口：

```go
Acquire(ctx, dockerClient) (int, release, error)
```

改为：

```go
Acquire(ctx, dockerClient, count int) ([]int, release, error)
```

行为：

1. 获取 allocator mutex。
2. 校验 `count > 0` 且 `count <= total`。
3. 扫描所有 Daytona GPU 容器的分配标签。
4. 构造已占用 GPU index 集合。
5. 选择 N 个空闲 index。
6. 空闲数量不足时释放锁并返回错误。
7. 成功时继续持有锁，直到调用方完成 `ContainerCreate`。

错误示例：

```text
insufficient free GPUs on runner: requested 4, available 2, capacity 8
```

### 8.2 容器标签

新增规范标签：

```text
daytona.gpu_indices=0,2,4,6
```

兼容规则：

- 分配器优先读取 `daytona.gpu_indices`。
- 没有新标签时读取旧的 `daytona.gpu_index`。
- 新版 Runner 创建单卡 Sandbox 时同时写入：

```text
daytona.gpu_indices=3
daytona.gpu_index=3
```

- 新版 Runner 创建多卡 Sandbox 时只要求写入 `daytona.gpu_indices`；可不写语义不完整的旧标签。
- index 必须去重、排序，并且都在 `[0, total)` 范围内。

标签解析失败不能静默忽略，否则可能把已占用 GPU 再次分配。发现 Daytona GPU 标签格式错误时，分配器应 fail closed，拒绝新的 GPU 分配并记录容器 ID 和错误标签。

### 8.3 GPU 所有权周期

分配器应把所有仍然存在且带有效 GPU 标签的容器视为占用 GPU，直到容器被删除。不能在容器只是 `exited` 时立即释放 GPU，因为该容器的 HostConfig 仍保存 DeviceRequests，后续重新启动可能和新容器冲突。

这比当前“退出即释放”的行为更严格，但与控制面“Sandbox 未销毁就占用 GPU”的容量模型一致。GPU Sandbox 设置 `autoDeleteInterval=0` 后，正常停止会很快删除容器并释放标签。

如果残留的 ERROR/DEAD 容器长期占卡，应由现有销毁/恢复任务清理，并通过监控暴露；不能通过重复分配同一设备来掩盖残留容器。

### 8.4 创建临界区

创建顺序必须保持：

```text
Acquire(N) 持锁
  -> 构造包含 gpu_indices 的 ContainerConfig
  -> ContainerCreate
  -> Docker 中已经可见完整标签
Release allocator lock
  -> ContainerStart
```

不需要在镜像拉取和 ContainerStart 期间持锁。

如果 `ContainerCreate` 失败，释放锁且不产生 GPU 所有权。如果 `ContainerCreate` 成功但后续 Start 失败，容器标签继续保留 GPU，直到错误清理流程删除容器。

## 9. Docker 与 CUDA 配置

### 9.1 CDI DeviceRequests

HostConfig 使用一个 DeviceRequest，包含 N 个 CDI Device ID：

```go
container.DeviceRequest{
    Driver: "cdi",
    DeviceIDs: []string{
        "nvidia.com/gpu=0",
        "nvidia.com/gpu=2",
        "nvidia.com/gpu=4",
        "nvidia.com/gpu=6",
    },
}
```

继续保持 GPU Sandbox `Privileged=false`，防止容器通过 privileged 模式看到未分配的 `/dev/nvidia*`。

### 9.2 容器内逻辑编号

容器内统一使用 `0..N-1`：

```text
NVIDIA_VISIBLE_DEVICES=0,1,2,3
CUDA_VISIBLE_DEVICES=0,1,2,3
```

宿主机分配可能是 `[0,2,4,6]`，但工作负载不需要知道宿主机 index。

在 H200 真机测试中必须验证 CDI/NVIDIA Container Toolkit 的实际重编号行为。验收条件不是环境变量文本本身，而是：

- `nvidia-smi -L` 只显示 N 张卡。
- CUDA `device_count()` 返回 N。
- 未分配设备不能被打开。

如果当前 CDI 版本不保证自动重编号，应让 NVIDIA runtime 管理 `NVIDIA_VISIBLE_DEVICES`，只设置 `CUDA_VISIBLE_DEVICES=0..N-1`。最终实现以真机验证结果为准。

### 9.3 CPU、内存和磁盘

第一阶段沿用现有 GPU Sandbox 固定配额：

- CPU：16 cores
- Memory：256 GiB
- Disk：512 GiB

这些配额不随 GPU 数量自动乘以 N。原因是宿主机 CPU/内存配置未必按 GPU 数量线性增长，直接倍增可能让合法的 8 卡请求因内存配额无法调度。

如果 SGLang 8 卡场景确认需要更高的主机资源，应单独设计 GPU Sandbox resource profile，而不是隐式乘法。

## 10. 配额、计费和展示

现有组织使用量已经按 `SUM(sandbox.gpu)` 计算，语义适合多卡，不应改回按 Sandbox 数量计数。

需要验证以下链路都使用 GPU 数量：

- pending GPU usage 增减。
- current GPU usage 聚合。
- Region `totalGpuQuota` 校验。
- 审计日志中的 `gpu` 字段。
- Dashboard Sandbox 详情和使用量展示。
- Metrics 中 requested/allocated GPU 数量。

示例：一个 4 卡 Sandbox 应消耗 4 个 Region GPU quota，而不是 1。

第一阶段 CLI 是主要入口。Dashboard 可以先只正确展示数量，创建表单的数量选择器可以作为后续工作。

## 11. Runner 版本与能力协商

这是上线时必须处理的兼容问题。

旧 Runner 收到 `gpuQuota=4` 时仍只会调用一次单卡 `Acquire()`，最终容器只得到一张卡。仅放宽 API 校验会造成“控制面显示 4 卡、容器实际 1 卡”的严重不一致。

建议新版 Runner 在健康上报中增加 capability：

```json
{
  "capabilities": {
    "multiGpuPerSandbox": true
  }
}
```

控制面规则：

- `requestedGpu <= 1`：允许旧 Runner 和新 Runner。
- `requestedGpu > 1`：只允许 `multiGpuPerSandbox=true` 的 Runner。
- capability 缺失按 `false` 处理。

能力可以存入 Runner 的 JSONB 字段，或者使用现有可扩展的 capability 存储结构。如果当前版本没有通用 capability 字段，优先增加通用结构，不建议通过字符串比较 `appVersion` 决定行为。

对于仅有一台自管 H200 Runner 的内部部署，可以通过“先升级 Runner，再升级 API”的操作顺序降低风险，但控制面 capability 过滤仍应实现，避免未来混合版本扩容时回归。

## 12. 故障处理与一致性

### 12.1 控制面认为有容量，Runner 认为没有

可能原因：

- Docker 中存在控制面尚未同步的残留容器。
- 手工创建了带 Daytona GPU 标签的容器。
- 前一次创建在 DB 和 Docker 之间部分失败。

处理方式：

- Runner 返回明确的 `insufficient free GPUs` 错误。
- 创建任务进入可观测错误状态，不尝试减少 GPU 数量继续创建。
- 控制面不应在同一次请求中自动降级为更少 GPU。
- 运维检查 Runner 容器标签并清理残留资源。

### 12.2 Runner 重启

Runner 不持久化内存中的 GPU bitmap。重启后每次分配都通过 Docker 容器标签重建占用集合，因此不会丢失已分配 GPU。

### 12.3 API 重试

如果相同 Sandbox 的容器已经存在，Create 保持现有幂等行为。Runner 应检查现有容器标签中的 GPU 数量是否等于请求的 `gpuQuota`：

- 相同：继续幂等启动/等待流程。
- 不同：拒绝请求并记录资源不一致错误，不能重新分配或静默接受。

### 12.4 回滚

回滚顺序：

1. API 先停止接受新的 `gpu > 1` 请求。
2. 等待或删除现有多卡 Sandbox。
3. 确认 Runner 上没有 `daytona.gpu_indices` 多值标签。
4. 再回滚 Runner。

不能在多卡 Sandbox 仍存在时直接回滚到旧 Runner。旧分配器不认识多值标签，可能重复分配已有 GPU。

## 13. 可观测性

### 13.1 日志

Runner 创建日志应包含：

```text
sandboxId
requestedGpuCount
allocatedGpuIndices
runnerGpuCapacity
```

控制面调度日志应包含：

```text
sandboxId
requestedGpuCount
selectedRunnerId
runnerGpuCapacity
runnerUsedGpu
runnerRemainingGpu
```

不要在普通用户 API 响应中暴露宿主机 GPU index；该信息只用于 Runner 运维日志。

### 13.2 Metrics

建议增加：

- `daytona_runner_gpu_allocated{runner_id}` gauge
- `daytona_runner_gpu_free{runner_id}` gauge
- `daytona_sandbox_gpu_requested` histogram
- `daytona_runner_gpu_allocation_failures_total{reason}` counter
- `daytona_runner_gpu_label_parse_errors_total` counter

### 13.3 告警

建议告警：

- 控制面统计的 allocated GPU 与 Runner 容器标签统计长期不一致。
- GPU 标签解析失败。
- Runner 连续出现 `insufficient free GPUs`，但控制面仍向该 Runner 调度。
- `nvidia-smi` 上报 GPU 数量下降。

## 14. 安全性

1. GPU Sandbox 必须保持 `Privileged=false`。
2. 只通过 CDI 注入分配的 Device ID。
3. 用户覆盖 `CUDA_VISIBLE_DEVICES` 最多隐藏已分配设备，不能绕过 CDI cgroup 获得其他 GPU。
4. 容器不得挂载宿主机 `/dev` 或 Docker socket，否则设备隔离失去意义。
5. GPU index 标签由 Runner 生成，不接受外部 API 直接传入。
6. 标签解析失败时 fail closed，避免重复分配。

## 15. 测试计划

### 15.1 API 单元测试

- `gpu=0/1/2/4/8` 通过 DTO 校验。
- `gpu=-1`、小数和非数字失败。
- Snapshot 创建允许 `gpu > 1`。
- 基于 Snapshot 创建允许 GPU override，但仍拒绝 CPU/内存/磁盘 override。
- 未传 `gpu` 时继承 Snapshot 默认值。
- GPU override 正确进入配额、Sandbox entity 和 Runner payload。
- `gpu > 1` 不会调度到缺少 capability 的 Runner。

### 15.2 调度器测试

8 卡 Runner 的关键用例：

| 已分配 | 新请求 | 结果 |
|---|---:|---|
| 无 | 8 | 成功 |
| 4 | 4 | 成功 |
| 4 | 5 | 拒绝 |
| 4 + 2 | 2 | 成功 |
| 4 + 2 | 3 | 拒绝 |
| 1 + 1 + 1 + 1 + 1 + 1 + 1 | 1 | 成功 |
| 8 | 1 | 拒绝 |

还需要覆盖：

- 两个并发 4 卡请求只能分别占用互不重叠的 4 张卡。
- 两个并发 6 卡请求只有一个成功。
- Region quota 为 6 时拒绝 8 卡请求。
- fallback、recover、fork 和 linked 路径不能绕过容量检查。

### 15.3 Runner 单元测试

- 从空闲 8 卡分配 4 卡得到 `[0,1,2,3]`。
- 已占 `[0,2,4,6]` 时分配 4 卡得到 `[1,3,5,7]`。
- 空闲不足时不返回部分结果。
- 同时解析新旧标签。
- 重复 index、越界 index、非法字符串导致 fail closed。
- 单卡创建同时写新旧标签。
- 多卡创建写入排序后的新标签。
- CDI DeviceIDs 数量和内容正确。
- CUDA 环境变量使用容器内逻辑编号。
- 容器已退出但尚未删除时仍占用 GPU。

### 15.4 H200 真机验收

在 `h200-runner-267` 上执行：

1. 创建一个 2 卡 Sandbox。
2. 创建一个 4 卡 Sandbox。
3. 再创建两个 1 卡 Sandbox。
4. 确认第五个 1 卡请求被拒绝。
5. 删除 4 卡 Sandbox，创建一个新的 4 卡 Sandbox并确认设备复用。
6. 重启 Runner，再创建/删除 Sandbox，确认标签恢复正确。

容器内验证：

```bash
nvidia-smi -L
python -c 'import torch; print(torch.cuda.device_count())'
```

SGLang 验证示例：

```bash
python -m sglang.launch_server \
  --model-path <model> \
  --tp-size 4 \
  --host 0.0.0.0 \
  --port 30000
```

验收条件：

- `nvidia-smi -L`、PyTorch device count 和 `--gpu N` 一致。
- SGLang tensor parallel 初始化成功。
- 容器看不到未分配 GPU。
- 多个 Sandbox 的宿主机 GPU index 不重叠。

## 16. 发布计划

### 阶段 1：Runner 向后兼容能力

- 实现多 index 分配、标签和 CDI 注入。
- 上报 `multiGpuPerSandbox=true`。
- API 仍限制 `gpu <= 1`。
- 在单卡生产流量下验证新版 Runner 没有回归。

### 阶段 2：控制面和 API

- 放宽 DTO 校验。
- 实现 GPU override 和 `effectiveGpu`。
- 调度容量从 COUNT 改为 SUM，并传入 requested GPU。
- capability 过滤生效。
- 重新生成 API Client 和 CLI 文档。

### 阶段 3：灰度验证

- 只对 H200 Region 开放多卡请求。
- 依次验证 2、4、8 卡。
- 观察分配失败、标签解析和容量不一致指标。
- 保留快速关闭 `gpu > 1` 请求的 feature flag。

### 阶段 4：通用开放

- 开放所有 capability 满足的自管 GPU Runner。
- 补充 Dashboard 数量选择器。
- 根据实际负载决定是否增加拓扑感知和资源 profile。

## 17. 预计改动位置

控制面/API：

- `apps/api/src/sandbox/dto/create-sandbox.dto.ts`
- `apps/api/src/sandbox/dto/create-snapshot.dto.ts`
- `apps/api/src/sandbox/controllers/sandbox.controller.ts`
- `apps/api/src/sandbox/services/sandbox.service.ts`
- `apps/api/src/sandbox/services/runner.service.ts`
- `apps/api/src/sandbox/managers/sandbox-actions/sandbox-start.action.ts`
- Snapshot/fork/recover/migration 的 Runner 选择路径
- Runner health/capability DTO 和持久化

Runner：

- `apps/runner/pkg/docker/gpu_allocator.go`
- `apps/runner/pkg/docker/create.go`
- `apps/runner/pkg/docker/container_configs.go`
- `apps/runner/pkg/runner/v2/healthcheck/healthcheck.go`
- 对应 Go 单元测试

生成物和文档：

- OpenAPI schema
- Go/TypeScript/Python/Ruby/Java API clients
- CLI reference
- GPU Runner 运维文档

## 18. 开发量评估

在本文范围内，不包含跨 Runner、多节点 NCCL、MIG 和拓扑感知：

| 工作项 | 估算 |
|---|---:|
| API 校验、GPU override、effective resource 逻辑 | 1.0-1.5 人日 |
| 控制面 SUM 容量调度及所有 fallback 路径收敛 | 1.5-2.0 人日 |
| Runner 多 index allocator、标签兼容和 CDI 注入 | 1.5-2.0 人日 |
| capability 协商和混合版本保护 | 0.5-1.0 人日 |
| 单元/集成测试 | 1.5-2.0 人日 |
| H200 部署与 2/4/8 卡验收 | 0.5-1.0 人日 |
| OpenAPI Client、CLI 文档等生成物 | 0.5 人日 |

核心功能和生产保护总计约 7-10 人日。单人实施通常需要 1.5-2 周日历时间，前提是 H200 环境和测试镜像可随时使用。

如果只做内部 MVP，省略 capability 持久化、Dashboard 和完整生成 Client，可以压缩到约 4-6 人日，但必须保证 Runner 先于 API 升级，且 Region 内不存在旧 Runner。

## 19. 设计决策摘要

本文建议采用以下默认决策：

1. 用户通过 `daytona create --gpu N` 指定数量。
2. 请求可以覆盖 Snapshot 的默认 GPU 数量。
3. GPU 数量允许任意正整数，上限由单台 Runner 和 Region quota 决定。
4. 所有 GPU 必须来自同一 Runner。
5. 按 `SUM(sandbox.gpu)` 调度和计费。
6. Runner 一次原子分配 N 个任意空闲 index，不要求连续。
7. GPU 所有权持续到容器删除。
8. GPU 数量不可在线调整。
9. 第一阶段不扩展 CPU/内存、不做拓扑感知、不做 MIG。
10. 通过 Runner capability 防止混合版本下的静默少分配。

