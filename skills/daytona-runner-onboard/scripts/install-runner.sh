#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Required environment:
  DAYTONA_API_URL          Runner-to-control-plane API URL, including /api
  RUNNER_NAME              control-plane Runner name bound to the token
  RUNNER_DOMAIN            Address reachable by the control plane/proxy
  RUNNER_API_PORT          unused host/Runner API port
  RUNNER_IMAGE             exact local Runner image tag
  GPU_ENABLED              true or false

Optional environment:
  DAYTONA_RUNNER_TOKEN_FILE default: /etc/daytona/runner.token
  RUNNER_CONTAINER_NAME    default: daytona-runner-<runner-name>
  RUNNER_DOCKER_NETWORK    Docker network name for same-host control planes
  RUNNER_CDI_SPEC          CDI file for GPU DinD mode
  RUNNER_PRELOAD_IMAGES    whitespace-separated local image refs for inner Docker
  REPLACE_EXISTING         true only after explicitly approving replacement
  DRY_RUN                  true to print the docker command without starting it
EOF
}

if [[ "${1:-}" == '--help' || "${1:-}" == '-h' ]]; then
  usage
  exit 0
fi

DAYTONA_RUNNER_TOKEN_FILE=${DAYTONA_RUNNER_TOKEN_FILE:-/etc/daytona/runner.token}

: "${DAYTONA_API_URL:?DAYTONA_API_URL is required}"
: "${RUNNER_NAME:?RUNNER_NAME is required}"
: "${RUNNER_DOMAIN:?RUNNER_DOMAIN is required}"
: "${RUNNER_API_PORT:?RUNNER_API_PORT is required}"
: "${RUNNER_IMAGE:?RUNNER_IMAGE is required}"
: "${GPU_ENABLED:?GPU_ENABLED is required}"

[[ -f "$DAYTONA_RUNNER_TOKEN_FILE" ]] || { echo 'Runner token file not found' >&2; exit 1; }
token_mode=$(stat -c '%a' "$DAYTONA_RUNNER_TOKEN_FILE")
[[ "$token_mode" =~ ^[0-7]{3,4}$ ]] || { echo 'Could not validate Runner token file mode' >&2; exit 1; }
(( (8#$token_mode & 077) == 0 )) || {
  echo 'Runner token file must not be accessible by group or other users' >&2
  exit 1
}
token_owner=$(stat -c '%U:%G' "$DAYTONA_RUNNER_TOKEN_FILE")
[[ "$token_owner" == root:root ]] || {
  echo 'Runner token file must be owned by root:root' >&2
  exit 1
}
DAYTONA_RUNNER_TOKEN=$(<"$DAYTONA_RUNNER_TOKEN_FILE")
[[ -n "$DAYTONA_RUNNER_TOKEN" ]] || { echo 'Runner token file is empty' >&2; exit 1; }
[[ "$DAYTONA_API_URL" =~ ^https?://.+/api$ ]] || {
  echo 'DAYTONA_API_URL must be an http(s) URL ending in /api' >&2
  exit 1
}
[[ "$RUNNER_API_PORT" =~ ^[0-9]+$ ]] && (( RUNNER_API_PORT >= 1 && RUNNER_API_PORT <= 65535 )) || {
  echo 'RUNNER_API_PORT must be between 1 and 65535' >&2
  exit 1
}
[[ "$GPU_ENABLED" == true || "$GPU_ENABLED" == false ]] || {
  echo 'GPU_ENABLED must be true or false' >&2
  exit 1
}

runner_name=$RUNNER_NAME
container_name=${RUNNER_CONTAINER_NAME:-daytona-runner-${runner_name}}
runner_image=$RUNNER_IMAGE
api_port=$RUNNER_API_PORT
gpu_enabled=$GPU_ENABLED

command -v docker >/dev/null || { echo 'docker is required' >&2; exit 1; }
docker info >/dev/null || { echo 'Docker daemon is not reachable' >&2; exit 1; }
docker image inspect "$runner_image" >/dev/null || {
  echo "Runner image is not loaded locally: $runner_image" >&2
  exit 1
}

if docker container inspect "$container_name" >/dev/null 2>&1; then
  if [[ "${REPLACE_EXISTING:-false}" != true ]]; then
    echo "container already exists: $container_name (set REPLACE_EXISTING=true only with approval)" >&2
    exit 1
  fi
  if [[ "${DRY_RUN:-false}" == true ]]; then
    echo "dry-run: existing container would be replaced: $container_name" >&2
  else
    docker rm -f "$container_name" >/dev/null
  fi
fi

run_args=(
  docker run -d
  --name "$container_name"
  --privileged
  --restart unless-stopped
  -p "${api_port}:${api_port}"
  -e "ENVIRONMENT=production"
  -e "API_PORT=${api_port}"
  -e "API_VERSION=2"
  -e "DAYTONA_API_URL=${DAYTONA_API_URL}"
  -e "DAYTONA_RUNNER_TOKEN=${DAYTONA_RUNNER_TOKEN}"
  -e "RUNNER_DOMAIN=${RUNNER_DOMAIN}"
  -e "LOG_FILE_PATH=/home/daytona/runner/runner.log"
  -e "RESOURCE_LIMITS_DISABLED=${RESOURCE_LIMITS_DISABLED:-true}"
  -e "INTER_SANDBOX_NETWORK_ENABLED=${INTER_SANDBOX_NETWORK_ENABLED:-false}"
  -e "SSH_GATEWAY_ENABLE=${SSH_GATEWAY_ENABLE:-false}"
  -e "TINI_SUBREAPER=true"
  --health-cmd="curl -f http://localhost:${api_port}/ || exit 1"
  --health-interval=30s
  --health-timeout=5s
  --health-retries=3
  -v "${container_name}-docker:/var/lib/docker"
  -v "${container_name}-data:/home/daytona"
)

if [[ -n "${RUNNER_DOCKER_NETWORK:-}" ]]; then
  docker network inspect "$RUNNER_DOCKER_NETWORK" >/dev/null || {
    echo "Docker network does not exist: $RUNNER_DOCKER_NETWORK" >&2
    exit 1
  }
  run_args+=(--network "$RUNNER_DOCKER_NETWORK")
fi

for env_name in AWS_ENDPOINT_URL AWS_REGION AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_BUCKET; do
  if [[ -n "${!env_name:-}" ]]; then
    run_args+=( -e "${env_name}=${!env_name}" )
  fi
done

if [[ "$gpu_enabled" == true ]]; then
  : "${RUNNER_CDI_SPEC:?RUNNER_CDI_SPEC is required when GPU_ENABLED=true}"
  [[ -f "$RUNNER_CDI_SPEC" ]] || { echo "CDI spec not found: $RUNNER_CDI_SPEC" >&2; exit 1; }
  grep -q '^kind: nvidia.com/gpu$' "$RUNNER_CDI_SPEC" || { echo 'CDI spec has the wrong kind' >&2; exit 1; }
  command -v nvidia-smi >/dev/null || { echo 'nvidia-smi is required for GPU mode' >&2; exit 1; }
  nvidia-smi -L >/dev/null || { echo 'host nvidia-smi cannot see a GPU' >&2; exit 1; }
  run_args+=(
    --gpus all
    -e GPU_ENABLED=true
    -e NVIDIA_VISIBLE_DEVICES=all
    -e NVIDIA_DRIVER_CAPABILITIES=compute,utility
    -v "${RUNNER_CDI_SPEC}:/etc/cdi/nvidia.yaml:ro"
  )
else
  run_args+=( -e GPU_ENABLED=false )
fi

run_args+=( "$runner_image" )
if [[ "${DRY_RUN:-false}" == true ]]; then
  for arg in "${run_args[@]}"; do
    case "$arg" in
      DAYTONA_RUNNER_TOKEN=*|AWS_ACCESS_KEY_ID=*|AWS_SECRET_ACCESS_KEY=*)
        printf '%q ' "${arg%%=*}=<redacted>"
        ;;
      *) printf '%q ' "$arg" ;;
    esac
  done
  printf '\n'
  exit 0
fi

"${run_args[@]}" >/dev/null
deadline=$((SECONDS + ${RUNNER_START_TIMEOUT_SECONDS:-180}))
while (( SECONDS < deadline )); do
  status=$(docker inspect --format '{{.State.Health.Status}}' "$container_name" 2>/dev/null || true)
  [[ "$status" == healthy ]] && break
  if [[ "$status" == unhealthy || "$(docker inspect --format '{{.State.Status}}' "$container_name")" == exited ]]; then
    docker logs --tail 80 "$container_name" >&2 || true
    exit 1
  fi
  sleep 2
done

[[ "$(docker inspect --format '{{.State.Health.Status}}' "$container_name")" == healthy ]] || {
  echo "Runner did not become healthy: $container_name" >&2
  docker logs --tail 80 "$container_name" >&2 || true
  exit 1
}

if [[ -n "${RUNNER_PRELOAD_IMAGES:-}" ]]; then
  read -r -a preload_images <<< "$RUNNER_PRELOAD_IMAGES"
  for image in "${preload_images[@]}"; do
    docker image inspect "$image" >/dev/null || { echo "preload image is not local: $image" >&2; exit 1; }
    docker save "$image" | docker exec -i "$container_name" docker load >/dev/null
  done
fi

echo "Runner container is healthy: $container_name"
echo 'Run verify-runner.sh next; the token is intentionally not printed.'
