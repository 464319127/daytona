# 离线与 GPU 说明

## 镜像边界

离线包应包含：

- 精确版本的 Runner 镜像；
- GPU Runner 的 `gcompat` 与当前 Server CA 层；
- 用于 CDI 验证的轻量 Sandbox 镜像；
- 业务确定会使用且目标机无法拉取的 Sandbox/Snapshot 镜像。

不要默认打包宿主机所有镜像。大模型、训练镜像可能达到几十 GB，必须让用户确认镜像列表和目标磁盘空间。`docker save` 会对共享层去重。

Runner 镜像包不能包含 Token、AWS Secret、SSH 私钥或目标机生成的 CDI 文件。

## DinD GPU 链路

GPU 数据路径是：

```text
宿主 NVIDIA 驱动
  -> 外层 Runner 容器 (--gpus all)
  -> Runner 内层 Docker daemon
  -> CDI nvidia.com/gpu=N
  -> Daytona Sandbox
```

外层 Runner 使用 `NVIDIA_DRIVER_CAPABILITIES=compute,utility`，只注入 CUDA/NVML 运行所需文件；不要为规避 CDI 缺文件错误盲目启用图形 capability。

只看到控制面 `gpu > 0` 不算完整验收。必须同时满足：

1. 宿主 `nvidia-smi` 成功；
2. Runner 容器内 `nvidia-smi` 成功；
3. 控制面 `/runners/me` 返回 `state=ready` 和正确 `gpu` 数量；
4. 内层 Docker 以 `--device nvidia.com/gpu=0` 启动 smoke image；
5. Smoke Sandbox 内只看到一张 GPU，且 `nvidia-smi -L` 成功。

`generate-cdi.sh` 必须在目标机运行。自动生成的 spec 基于宿主驱动文件路径；脚本会把 Debian/Ubuntu multiarch 和 `/lib64` 路径调整为 Alpine DinD 中实际注入驱动的 `/usr/lib64`、去掉不可在容器中执行的 host hook 和图形-only 挂载，并补齐 CUDA/NVML/PTX 的 ABI 别名。

## 版本限制

当前控制面 GPU 类型只识别 H100 和 RTX PRO 6000。V100 能通过 `gpu` 数量参与不指定类型的调度，但上报的 `gpuType` 会被规范化为 `null`。用户要求指定 V100 类型调度时，需先扩展 API 的 GPU 类型枚举、客户端和 Dashboard。

## 失败处理

- 外层 Runner 无 GPU：检查 `--gpus all`、Docker `nvidia` runtime、驱动与 toolkit。
- 内层创建时报 `hostPath ... no such file`：CDI 来自错误机器或驱动已升级，重新运行 `generate-cdi.sh`。
- HTTPS 证书错误：替换 Skill CA 并重建镜像；不要给 Runner 增加 insecure TLS。
- Runner `ready` 但 Sandbox 拉取失败：把所需镜像加入离线包，并通过 `RUNNER_PRELOAD_IMAGES` 导入内层 Docker。
- 磁盘不足：停止导入，先扩容；不要直接运行 `docker system prune`。
