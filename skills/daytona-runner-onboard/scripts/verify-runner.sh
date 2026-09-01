#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Required environment:
  DAYTONA_API_URL            Runner-to-control-plane API URL, including /api
  RUNNER_NAME                expected control-plane Runner name
  EXPECTED_REGION            expected control-plane Custom Region ID
  GPU_ENABLED                true or false

Optional environment:
  RUNNER_CONTAINER_NAME      default daytona-runner-<runner-name>
  RUNNER_REGISTRY_URL        registry base URL checked from the Runner container
  GPU_SMOKE_IMAGE            image already loaded in the inner Docker daemon
EOF
}

if [[ "${1:-}" == '--help' || "${1:-}" == '-h' ]]; then
  usage
  exit 0
fi

: "${DAYTONA_API_URL:?DAYTONA_API_URL is required}"
: "${RUNNER_NAME:?RUNNER_NAME is required}"
: "${EXPECTED_REGION:?EXPECTED_REGION is required}"
: "${GPU_ENABLED:?GPU_ENABLED is required}"
[[ "$GPU_ENABLED" == true || "$GPU_ENABLED" == false ]] || {
  echo 'GPU_ENABLED must be true or false' >&2
  exit 1
}

runner_name=$RUNNER_NAME
container_name=${RUNNER_CONTAINER_NAME:-daytona-runner-${runner_name}}
gpu_enabled=$GPU_ENABLED

command -v docker >/dev/null || { echo 'docker is required' >&2; exit 1; }
[[ "$(docker inspect --format '{{.State.Health.Status}}' "$container_name")" == healthy ]] || {
  echo "Runner container is not healthy: $container_name" >&2
  exit 1
}

docker exec "$container_name" sh -c 'curl -fsS http://127.0.0.1:"$API_PORT"/' >/dev/null
configured_api=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container_name" | sed -n 's/^DAYTONA_API_URL=//p')
[[ "$configured_api" == "$DAYTONA_API_URL" ]] || {
  echo "configured API URL does not match expected URL: $configured_api" >&2
  exit 1
}
if [[ -n "${RUNNER_REGISTRY_URL:-}" ]]; then
  registry_url=${RUNNER_REGISTRY_URL%/}
  [[ "$registry_url" =~ ^https?://[^/]+$ ]] || {
    echo 'RUNNER_REGISTRY_URL must be an http(s) registry base URL without a path' >&2
    exit 1
  }
  docker exec "$container_name" curl -fsS "$registry_url/v2/" >/dev/null
  echo "Runner registry connectivity passed: $registry_url/v2/"
fi
runner_json=$(docker exec "$container_name" sh -c 'curl -fsS "$DAYTONA_API_URL/runners/me" -H "Authorization: Bearer $DAYTONA_RUNNER_TOKEN"')
safe_json=$(printf '%s' "$runner_json" | sed -E 's/"apiKey":"[^"]*"/"apiKey":"<redacted>"/')
printf '%s\n' "$safe_json" | grep -oE '"(name|region|state|apiVersion|appVersion|gpu|gpuType|lastChecked)"[^,}]+' || true

json_string() {
  printf '%s' "$runner_json" | sed -nE 's/.*"'"$1"'"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/p'
}
json_number() {
  printf '%s' "$runner_json" | sed -nE 's/.*"'"$1"'"[[:space:]]*:[[:space:]]*([0-9]+).*/\1/p'
}

[[ "$(json_string name)" == "$runner_name" ]] || {
  echo "control-plane validation failed: runner name is not $runner_name" >&2
  exit 1
}
[[ "$(json_string region)" == "$EXPECTED_REGION" ]] || {
  echo "control-plane validation failed: region is not $EXPECTED_REGION" >&2
  exit 1
}
[[ "$(json_string state)" == ready ]] || {
  echo 'control-plane validation failed: runner is not ready' >&2
  exit 1
}
[[ "$(json_string apiVersion)" == 2 ]] || {
  echo 'control-plane validation failed: apiVersion is not 2' >&2
  exit 1
}

if [[ "$gpu_enabled" == true ]]; then
  outer_gpus=$(docker exec "$container_name" nvidia-smi --query-gpu=index,name,memory.total --format=csv,noheader)
  printf '%s\n' "$outer_gpus"
  outer_count=$(printf '%s\n' "$outer_gpus" | sed '/^[[:space:]]*$/d' | wc -l)
  reported_count=$(json_number gpu)
  [[ -n "$reported_count" && "$reported_count" -gt 0 && "$reported_count" -eq "$outer_count" ]] || {
    echo "GPU count mismatch: control-plane=${reported_count:-missing}, runner-container=$outer_count" >&2
    exit 1
  }
  : "${GPU_SMOKE_IMAGE:?GPU_SMOKE_IMAGE is required for GPU validation}"
  docker exec "$container_name" docker image inspect "$GPU_SMOKE_IMAGE" >/dev/null || {
    echo "GPU smoke image is not loaded in inner Docker: $GPU_SMOKE_IMAGE" >&2
    exit 1
  }
  smoke_name="daytona-gpu-smoke-$RANDOM"
  cleanup() {
    docker exec "$container_name" docker rm -f "$smoke_name" >/dev/null 2>&1 || true
  }
  trap cleanup EXIT
  docker exec "$container_name" docker create \
    --name "$smoke_name" \
    --device nvidia.com/gpu=0 \
    --entrypoint sh \
    "$GPU_SMOKE_IMAGE" \
    -c 'nvidia-smi -L; set -- /dev/nvidia[0-9]*; [ "$#" -eq 1 ] && [ -c "$1" ]' >/dev/null
  if ! smoke_output=$(docker exec "$container_name" docker start -a "$smoke_name"); then
    printf '%s\n' "$smoke_output"
    echo 'GPU CDI smoke container failed' >&2
    exit 1
  fi
  printf '%s\n' "$smoke_output"
  smoke_gpu_count=$(printf '%s\n' "$smoke_output" | grep -c '^GPU [0-9]' || true)
  [[ "$smoke_gpu_count" -eq 1 ]] || {
    echo "GPU CDI isolation failed: smoke container saw $smoke_gpu_count GPUs" >&2
    exit 1
  }
  cleanup
  trap - EXIT
  echo 'GPU CDI smoke test passed: nvidia.com/gpu=0'
fi

echo 'Runner validation passed.'
