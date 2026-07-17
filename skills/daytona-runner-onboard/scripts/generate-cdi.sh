#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: generate-cdi.sh [--output FILE]

Generate an NVIDIA CDI spec for a privileged Docker-in-Docker Runner. The
result rewrites Debian/Ubuntu multiarch and /lib64 host paths to /usr/lib64,
where --gpus all injects host libraries into the Alpine Runner container,
and removes the host-side nvidia-ctk hook that cannot run inside it.
EOF
}

output='/tmp/daytona-runner-nvidia-cdi.yaml'
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output) output=${2:?missing value for --output}; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

command -v nvidia-smi >/dev/null || { echo 'nvidia-smi is required' >&2; exit 1; }
command -v nvidia-ctk >/dev/null || { echo 'nvidia-ctk is required' >&2; exit 1; }
nvidia-smi -L >/dev/null || { echo 'nvidia-smi cannot see a GPU' >&2; exit 1; }

mkdir -p "$(dirname -- "$output")"
tmp_dir=$(mktemp -d)
raw="$tmp_dir/raw.yaml"
adapted="$tmp_dir/adapted.yaml"
trap 'rm -rf "$tmp_dir"' EXIT

nvidia-ctk cdi generate --output "$raw"
awk '
  function adapt_host_path(line) {
    gsub(/hostPath: \/(usr\/)?lib\/x86_64-linux-gnu\//, "hostPath: /usr/lib64/", line)
    gsub(/hostPath: \/lib64\//, "hostPath: /usr/lib64/", line)
    return line
  }
  function print_alias(path) {
    printf "  - containerPath: %s\n", path
    printf "    hostPath: %s\n", host_path
    print "    options:"
    print "    - ro"
    print "    - nosuid"
    print "    - nodev"
    print "    - bind"
  }
  function flush_mount() {
    if (block != "" && keep_mount) {
      printf "%s", block
      if (container_path ~ /\/libcuda\.so\.[0-9]/) {
        alias = container_path
        sub(/\/libcuda\.so\..*$/, "/libcuda.so.1", alias)
        print_alias(alias)
        sub(/\/libcuda\.so\.1$/, "/libcuda.so", alias)
        print_alias(alias)
      } else if (container_path ~ /\/libnvidia-ml\.so\.[0-9]/) {
        alias = container_path
        sub(/\/libnvidia-ml\.so\..*$/, "/libnvidia-ml.so.1", alias)
        print_alias(alias)
      } else if (container_path ~ /\/libnvidia-ptxjitcompiler\.so\.[0-9]/) {
        alias = container_path
        sub(/\/libnvidia-ptxjitcompiler\.so\..*$/, "/libnvidia-ptxjitcompiler.so.1", alias)
        print_alias(alias)
      }
    }
    block = ""
    keep_mount = 0
    container_path = ""
    host_path = ""
  }
  !skip && $0 ~ /^ *hooks: *$/ {
    skip = 1
    match($0, /^ */)
    hook_indent = RLENGTH
    next
  }
  skip {
    line = $0
    match(line, /^ */)
    indent = RLENGTH
    sub(/^ */, "", line)
    if (indent < hook_indent ||
        (indent == hook_indent && line ~ /^[A-Za-z0-9_-]+:/)) {
      skip = 0
    } else {
      next
    }
  }
  $0 == "  mounts:" {
    flush_mount()
    in_mounts = 1
    print
    next
  }
  in_mounts && $0 ~ /^[A-Za-z0-9_-]+:/ {
    flush_mount()
    in_mounts = 0
    print
    next
  }
  in_mounts && $0 ~ /^  - containerPath:/ {
    flush_mount()
    container_path = $0
    sub(/^  - containerPath: */, "", container_path)
    block = $0 "\n"
    next
  }
  in_mounts {
    $0 = adapt_host_path($0)
    block = block $0 "\n"
    if ($0 ~ /hostPath:/) {
      host_path = $0
      sub(/^ *hostPath: */, "", host_path)
      if (host_path ~ /(libcuda\.so\.|libnvidia-ml\.so\.|libnvidia-ptxjitcompiler\.so\.|\/usr\/bin\/nvidia-smi$)/) {
        keep_mount = 1
      }
    }
    next
  }
  { $0 = adapt_host_path($0); print }
  END { flush_mount() }
' "$raw" > "$adapted"

grep -q '^kind: nvidia.com/gpu$' "$adapted" || {
  echo 'generated CDI spec has no nvidia.com/gpu kind' >&2
  exit 1
}
if grep -Eq '^ *hooks: *$' "$adapted"; then
  echo 'generated CDI spec still contains an unsupported host hook' >&2
  exit 1
fi
if grep -Eq 'hostPath: /((usr/)?lib/x86_64-linux-gnu|lib64)/' "$adapted"; then
  echo 'generated CDI spec still contains an unadapted host library path' >&2
  exit 1
fi
bad_mounts=$(grep 'hostPath:' "$adapted" | \
  grep -Ev 'hostPath: .*libcuda\.so(\.|$)|hostPath: .*libnvidia-ml\.so(\.|$)|hostPath: .*libnvidia-ptxjitcompiler\.so(\.|$)|hostPath: /usr/bin/nvidia-smi$' || true)
if [[ -n "$bad_mounts" ]]; then
  echo 'generated CDI spec still contains a non-compute mount' >&2
  exit 1
fi
install -m 0644 "$adapted" "$output"

gpu_count=$(nvidia-smi --query-gpu=name --format=csv,noheader | sed '/^[[:space:]]*$/d' | wc -l)
driver=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader | sed -n '1{s/^[[:space:]]*//;s/[[:space:]]*$//;p;}')
printf 'CDI spec: %s\nGPUs: %s\nDriver: %s\n' "$output" "$gpu_count" "$driver"
