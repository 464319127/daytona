#!/bin/bash
# 宿主机运行：轮询 sglang 主端口健康检查，直到就绪或超时
# 用法: health_check.sh <BASE_PORT> [最大尝试次数，默认60] [间隔秒数，默认20]
BASE_PORT="${1:-30000}"
MAX_ATTEMPTS="${2:-60}"
INTERVAL="${3:-20}"

for i in $(seq 1 "$MAX_ATTEMPTS"); do
  code=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://localhost:${BASE_PORT}/health_generate" || true)
  echo "attempt $i/$MAX_ATTEMPTS: http_code=$code"
  if [ "$code" = "200" ]; then
    echo "SGLANG_HEALTHY: port ${BASE_PORT}"
    exit 0
  fi
  sleep "$INTERVAL"
done

echo "ERROR: sglang not healthy after $((MAX_ATTEMPTS * INTERVAL)) seconds" >&2
exit 1
