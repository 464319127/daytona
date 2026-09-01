#!/bin/bash
# Run inside a Daytona Sandbox. SGLang configuration is injected with Toolbox ExecuteRequest.envs.
set -euo pipefail

MODEL_ROOT_PATH="${1:-}"

if [ -z "$MODEL_ROOT_PATH" ] || [ ! -d "$MODEL_ROOT_PATH" ]; then
  echo "Usage: $0 <model_root_path>; the model directory must exist" >&2
  exit 1
fi
if [ -z "${BASE_PORT:-}" ]; then
  echo "ERROR: BASE_PORT is required" >&2
  exit 1
fi
case "$BASE_PORT" in
  *[!0-9]*|"")
    echo "ERROR: BASE_PORT must be numeric" >&2
    exit 1
    ;;
esac
if [ ! -x /sgl-workspace/scripts/sglang_control.sh ] && [ ! -f /sgl-workspace/scripts/sglang_control.sh ]; then
  echo "ERROR: /sgl-workspace/scripts/sglang_control.sh is missing" >&2
  exit 1
fi

mkdir -p /target
rm -f /target/search-lightning-container
ln -s "$MODEL_ROOT_PATH" /target/search-lightning-container

cd /sgl-workspace/scripts
rm -f /tmp/sglang.log
nohup /bin/bash sglang_control.sh start </dev/null >/tmp/sglang.log 2>&1 &
pid=$!
printf '%s\n' "$pid" >/tmp/sglang.pid
echo "SGLANG_STARTING: pid=$pid log=/tmp/sglang.log"
