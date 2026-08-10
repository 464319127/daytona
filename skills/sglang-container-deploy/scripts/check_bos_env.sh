#!/bin/bash
# 宿主机运行：确认 BOS 凭据已注入当前 skill 执行环境，不输出凭据内容
set -euo pipefail

missing=()
[ -n "${BOS_AK:-}" ] || missing+=(BOS_AK)
[ -n "${BOS_SK:-}" ] || missing+=(BOS_SK)

if [ "${#missing[@]}" -ne 0 ]; then
  printf 'ERROR: missing required environment variable(s): %s\n' "${missing[*]}" >&2
  exit 1
fi

case "$BOS_AK$BOS_SK" in
  *$'\n'*|*$'\r'*)
    echo "ERROR: BOS_AK/BOS_SK must not contain newline characters" >&2
    exit 1
    ;;
esac

echo "BOS_ENV_READY: BOS_AK and BOS_SK are set (values hidden)"
