#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT
mkdir -p "$tmp_dir/bin"

cat > "$tmp_dir/raw.yaml" <<'EOF'
cdiVersion: 0.5.0
containerEdits:
  mounts:
  - containerPath: /lib/x86_64-linux-gnu/libcuda.so.550.127.08
    hostPath: /lib/x86_64-linux-gnu/libcuda.so.550.127.08
    options:
    - ro
  - containerPath: /lib64/libnvidia-ml.so.550.127.08
    hostPath: /lib64/libnvidia-ml.so.550.127.08
    options:
    - ro
  - containerPath: /usr/lib/x86_64-linux-gnu/libnvidia-ptxjitcompiler.so.550.127.08
    hostPath: /usr/lib/x86_64-linux-gnu/libnvidia-ptxjitcompiler.so.550.127.08
    options:
    - ro
  - containerPath: /lib/x86_64-linux-gnu/libnvidia-glcore.so.550.127.08
    hostPath: /lib/x86_64-linux-gnu/libnvidia-glcore.so.550.127.08
    options:
    - ro
  hooks:
  - args:
    - nvidia-ctk
    - hook
    hookName: createContainer
    path: /usr/bin/nvidia-cdi-hook
devices:
- containerEdits:
    deviceNodes:
    - path: /dev/nvidia0
  name: "0"
kind: nvidia.com/gpu
EOF

cat > "$tmp_dir/bin/nvidia-ctk" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

output=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output) output=${2:?missing output}; shift 2 ;;
    *) shift ;;
  esac
done
cp "$CDI_TEST_FIXTURE" "$output"
EOF

cat > "$tmp_dir/bin/nvidia-smi" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

case "$*" in
  -L) echo 'GPU 0: Test GPU (UUID: GPU-test)' ;;
  *--query-gpu=name*) echo 'Test GPU' ;;
  *--query-gpu=driver_version*) echo '550.127.08' ;;
  *) exit 2 ;;
esac
EOF
chmod +x "$tmp_dir/bin/nvidia-ctk" "$tmp_dir/bin/nvidia-smi"

PATH="$tmp_dir/bin:$PATH" CDI_TEST_FIXTURE="$tmp_dir/raw.yaml" \
  "$script_dir/scripts/generate-cdi.sh" --output "$tmp_dir/adapted.yaml" >/dev/null

grep -qxF 'kind: nvidia.com/gpu' "$tmp_dir/adapted.yaml"
grep -qxF 'devices:' "$tmp_dir/adapted.yaml"
grep -qF 'hostPath: /usr/lib64/libcuda.so.550.127.08' "$tmp_dir/adapted.yaml"
grep -qF 'containerPath: /lib/x86_64-linux-gnu/libcuda.so.1' "$tmp_dir/adapted.yaml"
grep -qF 'hostPath: /usr/lib64/libnvidia-ml.so.550.127.08' "$tmp_dir/adapted.yaml"
grep -qF 'hostPath: /usr/lib64/libnvidia-ptxjitcompiler.so.550.127.08' "$tmp_dir/adapted.yaml"
! grep -qE '^ *hooks: *$' "$tmp_dir/adapted.yaml"
! grep -qF 'libnvidia-glcore' "$tmp_dir/adapted.yaml"

echo 'generate-cdi test passed'
