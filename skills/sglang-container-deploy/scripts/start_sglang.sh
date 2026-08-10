#!/bin/bash
# 容器内运行：加载环境变量文件，建立模型软链，启动 sglang
# 用法: start_sglang.sh <env文件容器内路径> <模型容器内路径>
set -e

ENV_FILE="$1"          # 每行 KEY=VALUE
MODEL_ROOT_PATH="$2"   # 例如 /workspace/qwen3-30b-a3b-279-plan_fp8_blockwise

if [ ! -f "$ENV_FILE" ] || [ ! -d "$MODEL_ROOT_PATH" ]; then
  echo "Usage: $0 <env_file> <model_root_path>; both must exist in container" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

cd /sgl-workspace/scripts
mkdir -p /target
[ -L /target/search-lightning-container ] && rm -f /target/search-lightning-container
ln -s "$MODEL_ROOT_PATH" /target/search-lightning-container

/bin/bash sglang_control.sh start &>/tmp/log &
echo "SGLANG_STARTING pid=$!"
