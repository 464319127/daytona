---
name: sglang-container-deploy
description: 自动化 sglang 容器部署流程：创建 GPU 容器、从 BOS 拉取模型并校验完整性、导入环境变量启动 sglang 并做健康检查。当用户要求部署 sglang 服务、在容器里起 sglang、从 BOS 拉模型部署推理服务时使用。
---

# sglang 容器化自动部署

将「创建容器 → 拉取模型 → 启动 sglang → 健康检查」四步流程自动化。

## 需要用户提供的信息

开始前先收集以下参数（缺少必填项时询问用户）：

| 参数 | 必填 | 说明 | 示例 |
|------|------|------|------|
| 镜像名 | 是 | 部署镜像完整地址 | `iregistry.baidu-int.com/sglang/sglang_deploy_images/sglang_deploy_jit:v0.5.13.post1.dev__20260708_192028` |
| 挂载路径 | 是 | `宿主机路径:容器路径`，容器路径通常为 `/workspace` | `/ssd2/wangning33/agent_workspace:/workspace` |
| `BOS_AK` 环境变量 | 是* | 在 skill 执行环境中预先注入的 BOS Access Key（*跳过模型拉取时可不填） | 只检查是否非空，不通过聊天收集值 |
| `BOS_SK` 环境变量 | 是* | 在 skill 执行环境中预先注入的 BOS Secret Key（*跳过模型拉取时可不填） | 只检查是否非空，不通过聊天收集值 |
| 是否跳过模型拉取 | 否 | 上次已拉取过模型时可跳过步骤2，默认否 | 否 |
| 模型 BOS 路径 | 是 | 模型在 BOS 上的目录 | `bos:/wn-test1/qwen3-30b-a3b-279-plan_fp8_blockwise` |
| sglang 环境变量列表 | 是 | 每行 `KEY=VALUE`，其中 `BASE_PORT` 用于健康检查 | `SGLANG_MODE=single`、`BASE_PORT=30000` 等 |

派生变量：
- `MODEL_NAME` = 模型 BOS 路径的最后一段目录名
- `MODEL_ROOT_PATH`（容器内模型路径）= `<挂载路径的容器侧>/<MODEL_NAME>`，如 `/workspace/qwen3-30b-a3b-279-plan_fp8_blockwise`
- `HOST_WORKSPACE` = 挂载路径的宿主机侧，用于向容器传文件

## 执行流程

### 凭据环境变量预检

用户未选择跳过模型拉取时，在执行任何 Docker 操作前运行：

```bash
bash scripts/check_bos_env.sh
```

脚本必须输出 `BOS_ENV_READY` 才能继续。缺少变量时停止部署，提示用户在启动 skill 的同一宿主机执行环境中注入 `BOS_AK`、`BOS_SK`；不要要求用户在聊天中发送值，也不要从历史容器或其他用户配置中读取。

### 步骤 0：环境预检（宿主机）

```bash
docker --version && nvidia-smi -L
# 检查 BASE_PORT 起的端口是否被占用；被占用时提醒用户换端口或清理旧服务
ss -tlnp | grep ':<BASE_PORT>' || echo PORT_FREE
# 镜像不在本地时先拉取（镜像较大，建议后台执行）
docker pull <镜像名>
```

如宿主机已有同名/旧的 sglang 容器占用 GPU 或端口，先向用户确认是否停掉，不要擅自删除。

### 步骤 1：创建容器（宿主机）

```bash
bash scripts/create_container.sh <镜像名> <挂载路径>
```

脚本用实时时间戳生成容器名 `${USER}-sglang.YYYYmmdd_HHMMSS`，输出 `CONTAINER_READY: <容器名>`。记住这个容器名，后续步骤都用它。

创建后验证容器内 GPU 可见：

```bash
docker exec <容器名> nvidia-smi -L
```

### 步骤 2：拉取模型（容器内，可跳过）

若用户选择「跳过模型拉取」，只需确认 `MODEL_ROOT_PATH` 在容器内已存在（`docker exec <容器名> ls <MODEL_ROOT_PATH>`），然后直接进入步骤 3。

否则把脚本复制到挂载目录并在容器内执行：

```bash
cp scripts/pull_model.sh <HOST_WORKSPACE>/pull_model.sh && chmod +x <HOST_WORKSPACE>/pull_model.sh
docker exec --env BOS_AK --env BOS_SK <容器名> /bin/bash /workspace/pull_model.sh <模型BOS路径>
```

`docker exec --env BOS_AK --env BOS_SK` 只在命令中出现变量名，值从当前宿主机执行环境传入容器。脚本内部：读取环境变量 → 下载 bcecmd → 脱敏记录凭据指纹 → 写入 AK/SK 配置 → 校验配置文件与输入完全一致 → 发起只读鉴权探测 → `bos sync` 拉取（concurrency 4）→ 对比远端与本地的文件数和总字节数校验完整性。成功时输出 `MODEL_PULL_DONE: <MODEL_ROOT_PATH>`；校验失败会以非零退出，此时可重跑（sync 支持断点续传）。

鉴权诊断日志只输出 AK/SK 的长度和 SHA-256 前 12 位，不输出凭据原文。重点判读：

- `CREDENTIAL_DIAG`：对比 `input`、`before_config`、`after_config` 三阶段的指纹。
- `EXECUTION_DIAG`：区分环境变量 `HOME` 与 passwd 解析出的实际配置 home；bcecmd 默认按执行用户的 passwd home 写配置。
- `CREDENTIAL_CONFIG_VERIFY`：`ak_match=yes sk_match=yes` 表示 bcecmd 落盘内容与脚本参数逐字一致。
- `BOS_AUTH_PROBE_OK`：只读 BOS 请求鉴权成功，并附带服务端状态、debug ID 和 request ID。
- `BOS authentication probe failed`：脚本输出已过滤 Authorization 和凭据的 canonical request、endpoint、请求时间及服务端错误，使用 request ID/debug ID 继续排查。

大模型下载耗时可能较长（几十 GB 量级），建议后台执行并轮询输出。

### 步骤 3：启动 sglang（容器内）

先把用户给的环境变量列表写成文件放到挂载目录（每行 `KEY=VALUE`，注意去掉行尾多余空格）：

```bash
# 写 <HOST_WORKSPACE>/sglang_env.list
cp scripts/start_sglang.sh <HOST_WORKSPACE>/start_sglang.sh && chmod +x <HOST_WORKSPACE>/start_sglang.sh
docker exec <容器名> /bin/bash /workspace/start_sglang.sh /workspace/sglang_env.list <MODEL_ROOT_PATH>
```

脚本内部：`source` 环境变量（`set -a` 全部导出）→ `cd /sgl-workspace/scripts` → 软链 `MODEL_ROOT_PATH` 到 `/target/search-lightning-container` → 后台执行 `sglang_control.sh start`，日志写 `/tmp/log`。

### 步骤 4：健康检查（宿主机）

```bash
bash scripts/health_check.sh <BASE_PORT>
```

每 20 秒向 `http://localhost:<BASE_PORT>/health_generate` 发一次请求，返回 200 即成功（实测约 3 分钟就绪，脚本默认最多等 20 分钟）。若 `SINGLE_NUM>1`，可顺带检查 `BASE_PORT` 到 `BASE_PORT+SINGLE_NUM-1` 各端口。

失败时排查：`docker exec <容器名> tail -50 /tmp/log` 查看启动日志。

## 完成后向用户汇报

- 容器名
- 模型容器内路径
- 服务端口列表及健康状态
- 日志位置（容器内 `/tmp/log`）

## 注意事项

- 所有 `docker exec` 使用字面容器名，不要依赖 shell 会话中的环境变量（会话可能重置）。
- bcecmd 下载源 `http://10.48.51.15:8081/qianfan/bcecmd` 为内网地址，容器使用 host 网络可直接访问。
- AK/SK 是敏感信息，不要写入日志或回显完整内容。
- 不要把 AK/SK 放入聊天、命令位置参数、BOS 路径 query 或脚本文件；只通过预检后的 `BOS_AK`、`BOS_SK` 环境变量传递。
- 不要执行可能回显凭据的 `env`、`printenv`、`set` 或 `export -p`；环境检查只判断变量是否非空。
- 不要直接透传 `bcecmd --debug` 原始输出，其中可能包含 AK 和 Authorization；只使用 `pull_model.sh` 生成的脱敏摘要。
- 健康检查 `http_code=000` 表示服务尚未监听端口，属于启动期正常现象，继续等待即可。
