#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo 'Usage: load-images.sh --archive FILE [--skip-checksum]'
}

archive=''
skip_checksum=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --archive) archive=${2:?missing value for --archive}; shift 2 ;;
    --skip-checksum) skip_checksum=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ -f "$archive" ]] || { echo "archive not found: $archive" >&2; exit 1; }
command -v docker >/dev/null || { echo 'docker is required' >&2; exit 1; }
docker info >/dev/null || { echo 'Docker daemon is not reachable' >&2; exit 1; }

checksum_file="${archive}.sha256"
if [[ "$skip_checksum" == false ]]; then
  [[ -f "$checksum_file" ]] || {
    echo "checksum not found: $checksum_file (use --skip-checksum only with explicit approval)" >&2
    exit 1
  }
  (
    cd -- "$(dirname -- "$archive")"
    sha256sum -c "$(basename -- "$checksum_file")"
  )
fi

case "$archive" in
  *.gz|*.tgz) gzip -dc -- "$archive" | docker load ;;
  *) docker load < "$archive" ;;
esac
