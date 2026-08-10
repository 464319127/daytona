#!/bin/bash
# 容器内运行：下载 bcecmd、配置凭证、从 BOS 同步模型并校验完整性
# 用法: BOS_AK=<AK> BOS_SK=<SK> pull_model.sh <模型BOS路径>
set -euo pipefail

BOS_AK="${BOS_AK:-}"
BOS_SK="${BOS_SK:-}"
MODEL_BOS_PATH="${1:-}"   # 例如 bos:/wn-test1/qwen3-30b-a3b-279-plan_fp8_blockwise
MODEL_NAME="$(basename "${MODEL_BOS_PATH%/}")"
MODEL_LOCAL_PATH="/workspace/${MODEL_NAME}"

if [ -z "$BOS_AK" ] || [ -z "$BOS_SK" ] || [ -z "$MODEL_BOS_PATH" ]; then
  echo "Usage: set non-empty BOS_AK and BOS_SK, then run $0 <model_bos_path>" >&2
  exit 1
fi
case "$MODEL_BOS_PATH" in
  *\?*)
    echo "ERROR: model BOS path must not contain query parameters or credentials" >&2
    exit 1
    ;;
esac

cd /workspace

ENV_HOME="${HOME:-}"
HOME_DIR="$(getent passwd "$(id -u)" | cut -d: -f6)"
[ -n "$HOME_DIR" ] || HOME_DIR="$ENV_HOME"
CREDENTIALS_FILE="${HOME_DIR}/.go-bcecli/credentials"
CONFIG_OUTPUT=""
AUTH_DEBUG_OUTPUT=""

cleanup() {
  [ -z "$CONFIG_OUTPUT" ] || rm -f "$CONFIG_OUTPUT"
  [ -z "$AUTH_DEBUG_OUTPUT" ] || rm -f "$AUTH_DEBUG_OUTPUT"
}
trap cleanup EXIT

fingerprint() {
  printf '%s' "$1" | sha256sum | awk '{print substr($1, 1, 12)}'
}

read_credential_field() {
  local field="$1"
  local file="$2"
  awk -F= -v field="$field" '
    BEGIN {
      field=tolower(field)
    }
    {
      key=$1
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", key)
      if (tolower(key) == field) {
        value=substr($0, index($0, "=") + 1)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
        print value
        exit
      }
    }
  ' "$file"
}

log_credential_summary() {
  local stage="$1"
  local ak="$2"
  local sk="$3"
  printf 'CREDENTIAL_DIAG stage=%s ak_len=%d ak_sha256_12=%s sk_len=%d sk_sha256_12=%s\n' \
    "$stage" "${#ak}" "$(fingerprint "$ak")" "${#sk}" "$(fingerprint "$sk")"
}

print_safe_debug_summary() {
  local file="$1"
  echo "==== sanitized bcecmd debug summary ====" >&2
  LC_ALL=C grep -E \
    'CanonicalRequest data:|^(HEAD|GET|PUT|POST|DELETE)$|^host:|^x-bce-date:|SendRequest: send http request:|^[[:space:]]+(HEAD|GET|PUT|POST|DELETE) https://|receive http response:|^Error:|^提示:' \
    "$file" >&2 || true
}

echo "==== BOS credential diagnostics ===="
printf 'EXECUTION_DIAG uid=%s user=%s env_home=%s resolved_home=%s credentials_file=%s local_time=%s utc_time=%s model_bos_path=%s\n' \
  "$(id -u)" "$(id -un)" "${ENV_HOME:-unset}" "$HOME_DIR" "$CREDENTIALS_FILE" \
  "$(date -Ins)" "$(date -u -Ins)" "$MODEL_BOS_PATH"
log_credential_summary "input" "$BOS_AK" "$BOS_SK"
if [ -f "$CREDENTIALS_FILE" ]; then
  before_ak="$(read_credential_field ak "$CREDENTIALS_FILE")"
  before_sk="$(read_credential_field sk "$CREDENTIALS_FILE")"
  log_credential_summary "before_config" "$before_ak" "$before_sk"
  stat -c 'CREDENTIAL_FILE_DIAG stage=before_config mtime=%y mode=%a size=%s' "$CREDENTIALS_FILE"
else
  echo "CREDENTIAL_FILE_DIAG stage=before_config state=missing"
fi

# 1. 获取 bcecmd 并授权
if [ ! -x ./bcecmd ]; then
  wget -q http://10.48.51.15:8081/qianfan/bcecmd
  chmod +x bcecmd
fi
printf 'BCECMD_DIAG version=%s binary_sha256_12=%s\n' \
  "$(./bcecmd --version 2>&1 | tr '\n' ' ')" \
  "$(sha256sum ./bcecmd | awk '{print substr($1, 1, 12)}')"

# 2. 配置 bcecmd 凭证（交互式配置，AK/SK 后其余项回车默认）
CONFIG_OUTPUT="$(mktemp /tmp/bcecmd-config.XXXXXX)"
set +e
printf '%s\n' \
    "$BOS_AK" \
    "$BOS_SK" \
    "" "" "" "" "" "" "" "" "" "" "" "" \
    | ./bcecmd -c >"$CONFIG_OUTPUT" 2>&1
config_rc=${PIPESTATUS[1]}
set -e
if [ "$config_rc" -ne 0 ]; then
  echo "ERROR: bcecmd configuration failed, rc=$config_rc; prompt output withheld because it may contain credentials" >&2
  exit "$config_rc"
fi
if [ ! -f "$CREDENTIALS_FILE" ]; then
  echo "ERROR: bcecmd reported success but credentials file was not created: $CREDENTIALS_FILE" >&2
  exit 1
fi

configured_ak="$(read_credential_field ak "$CREDENTIALS_FILE")"
configured_sk="$(read_credential_field sk "$CREDENTIALS_FILE")"
log_credential_summary "after_config" "$configured_ak" "$configured_sk"
stat -c 'CREDENTIAL_FILE_DIAG stage=after_config mtime=%y mode=%a size=%s' "$CREDENTIALS_FILE"
ak_match=no
sk_match=no
[ "$configured_ak" != "$BOS_AK" ] || ak_match=yes
[ "$configured_sk" != "$BOS_SK" ] || sk_match=yes
echo "CREDENTIAL_CONFIG_VERIFY ak_match=$ak_match sk_match=$sk_match"
if [ "$ak_match" != yes ] || [ "$sk_match" != yes ]; then
  echo "ERROR: bcecmd credentials file does not exactly match the supplied AK/SK" >&2
  exit 1
fi

# 3. 发起只读鉴权探测。失败时仅输出不含 Authorization 和凭据的 debug 摘要。
AUTH_DEBUG_OUTPUT="$(mktemp /tmp/bcecmd-auth-debug.XXXXXX)"
set +e
./bcecmd --debug bos ls "${MODEL_BOS_PATH%/}/" >"$AUTH_DEBUG_OUTPUT" 2>&1
auth_rc=$?
set -e
if [ "$auth_rc" -ne 0 ]; then
  echo "ERROR: BOS authentication probe failed, rc=$auth_rc" >&2
  print_safe_debug_summary "$AUTH_DEBUG_OUTPUT"
  exit "$auth_rc"
fi
auth_response="$(LC_ALL=C grep 'receive http response:' "$AUTH_DEBUG_OUTPUT" | tail -1 || true)"
echo "BOS_AUTH_PROBE_OK ${auth_response:-response_status_unavailable}"

# 4. 拉取模型文件
./bcecmd bos sync "$MODEL_BOS_PATH" "$MODEL_LOCAL_PATH" --concurrency 4

# 5. 校验完整性：对比 BOS 侧与本地的文件数和总字节数
#    ls 输出每行格式: date time size STORAGE_CLASS key；目录占位对象无 key 字段(NF<5)，需排除
echo "==== checking model download integrity ===="
remote_stat=$(./bcecmd bos ls -a -r "${MODEL_BOS_PATH}/" | awk 'NF>=5 {count++; bytes+=$3} END {print count+0, bytes+0}')
remote_count=$(echo "$remote_stat" | awk '{print $1}')
remote_bytes=$(echo "$remote_stat" | awk '{print $2}')
local_count=$(find "$MODEL_LOCAL_PATH" -type f | wc -l)
local_bytes=$(find "$MODEL_LOCAL_PATH" -type f -printf '%s\n' | awk '{sum+=$1} END {print sum+0}')
echo "remote: $remote_count files, $remote_bytes bytes; local: $local_count files, $local_bytes bytes"
if [ "$remote_count" -ne "$local_count" ] || [ "$remote_bytes" -ne "$local_bytes" ]; then
  echo "ERROR: model download incomplete (file count or size mismatch)" >&2
  exit 1
fi
echo "MODEL_PULL_DONE: $MODEL_LOCAL_PATH"
