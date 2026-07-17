#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bundle-images.sh --output FILE [options]

Options:
  --output FILE              gzip Docker archive to create (required)
  --runner-image IMAGE       Runner image to package (default: daytona-runner-gpu:v0.187.0)
  --base-runner-image IMAGE  Base image used by --build-gpu (default: daytona-runner-gpu:v0.187.0)
  --install-gpu-compat       Install gcompat into an unmodified upstream base (needs Alpine registry)
  --build-gpu                Build the gcompat + CA GPU Runner image first
  --include IMAGE            Additional local image to package (repeatable)
  --help                     Show this help
EOF
}

output=''
runner_image='daytona-runner-gpu:v0.187.0'
base_image='daytona-runner-gpu:v0.187.0'
build_gpu=false
install_gpu_compat=false
declare -a include_images=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output) output=${2:?missing value for --output}; shift 2 ;;
    --runner-image) runner_image=${2:?missing value for --runner-image}; shift 2 ;;
    --base-runner-image) base_image=${2:?missing value for --base-runner-image}; shift 2 ;;
    --install-gpu-compat) install_gpu_compat=true; shift ;;
    --build-gpu) build_gpu=true; shift ;;
    --include) include_images+=("${2:?missing value for --include}"); shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ -n "$output" ]] || { echo '--output is required' >&2; usage >&2; exit 2; }
command -v docker >/dev/null || { echo 'docker is required' >&2; exit 1; }
docker info >/dev/null || { echo 'Docker daemon is not reachable' >&2; exit 1; }

skill_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
if [[ "$build_gpu" == true ]]; then
  docker build --network=host \
    --build-arg "RUNNER_BASE_IMAGE=$base_image" \
    --build-arg "INSTALL_GPU_COMPAT=$install_gpu_compat" \
    -t "$runner_image" \
    -f "$skill_dir/assets/runner-gpu.Dockerfile" \
    "$skill_dir/assets"
fi

images=("$runner_image" "${include_images[@]}")
for image in "${images[@]}"; do
  docker image inspect "$image" >/dev/null || {
    echo "image is not available locally: $image" >&2
    exit 1
  }
done

mkdir -p "$(dirname -- "$output")"
output=$(cd -- "$(dirname -- "$output")" && pwd)/$(basename -- "$output")
tmp_archive=$(mktemp "${output}.tmp.XXXXXX")
trap 'rm -f "$tmp_archive"' EXIT

docker save "${images[@]}" | gzip -1 > "$tmp_archive"
mv "$tmp_archive" "$output"
(
  cd -- "$(dirname -- "$output")"
  sha256sum "$(basename -- "$output")" > "$(basename -- "$output").sha256"
  {
    printf 'created=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'archive=%s\n' "$(basename -- "$output")"
    printf 'image_count=%s\n' "${#images[@]}"
    printf '%s\n' "${images[@]}"
  } > "$(basename -- "$output").manifest"
)

echo "created: $output"
echo "checksum: ${output}.sha256"
echo "manifest: ${output}.manifest"
