#!/usr/bin/env python3
"""Deploy SGLang into a Daytona GPU Sandbox using REST and Toolbox APIs."""

from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import sys
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


TERMINAL_ERROR_STATES = {"build_failed", "destroyed", "error"}
IMAGE_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:/@-]*\Z")
ENV_KEY_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*\Z")
SECRET_KEY_RE = re.compile(r"(?:AK|API_KEY|CREDENTIAL|PASSWORD|SECRET|SK|TOKEN)", re.IGNORECASE)


class DeployError(RuntimeError):
    pass


class DaytonaClient:
    def __init__(
        self,
        api_url: str,
        token: str,
        organization_id: str | None,
        ssl_context: ssl.SSLContext,
        secrets: list[str],
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.token = token
        self.organization_id = organization_id
        self.ssl_context = ssl_context
        self.secrets = [value for value in secrets if value]

    def _headers(self) -> dict[str, str]:
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.token}",
            "User-Agent": "sglang-daytona-deploy/1",
        }
        if self.organization_id:
            headers["X-Daytona-Organization-ID"] = self.organization_id
        return headers

    def _redact(self, text: str) -> str:
        for secret in sorted(self.secrets, key=len, reverse=True):
            text = text.replace(secret, "[REDACTED]")
        return text

    def request_json(
        self,
        method: str,
        url: str,
        payload: dict[str, Any] | None = None,
        timeout: int = 120,
    ) -> dict[str, Any]:
        data = None
        headers = self._headers()
        if payload is not None:
            data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = Request(url, data=data, headers=headers, method=method)
        raw = self._open(request, timeout)
        if not raw:
            return {}
        try:
            value = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise DeployError(f"{method} {url} returned invalid JSON") from exc
        if not isinstance(value, dict):
            raise DeployError(f"{method} {url} returned an unexpected JSON value")
        return value

    def upload_file(self, toolbox_base: str, local_path: Path, remote_path: str) -> None:
        boundary = f"daytona-{uuid.uuid4().hex}"
        content = local_path.read_bytes()
        filename = local_path.name.replace('"', "")
        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
            "Content-Type: application/octet-stream\r\n\r\n"
        ).encode("ascii") + content + f"\r\n--{boundary}--\r\n".encode("ascii")
        query = urlencode({"path": remote_path})
        headers = self._headers()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        headers["Content-Length"] = str(len(body))
        request = Request(
            f"{toolbox_base}/files/upload?{query}",
            data=body,
            headers=headers,
            method="POST",
        )
        self._open(request, 300)

    def _open(self, request: Request, timeout: int) -> bytes:
        try:
            with urlopen(request, timeout=timeout, context=self.ssl_context) as response:
                return response.read()
        except HTTPError as exc:
            try:
                detail = exc.read(4096).decode("utf-8", errors="replace")
            except Exception:
                detail = ""
            detail = self._redact(detail).strip()
            suffix = f": {detail}" if detail else ""
            raise DeployError(f"{request.method} {request.full_url} failed with HTTP {exc.code}{suffix}") from exc
        except URLError as exc:
            raise DeployError(f"{request.method} {request.full_url} failed: {exc.reason}") from exc


def parse_env_file(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not raw_line.strip() or raw_line.lstrip().startswith("#"):
            continue
        if "=" not in raw_line:
            raise DeployError(f"{path}:{line_number}: expected KEY=VALUE")
        key, value = raw_line.split("=", 1)
        if not ENV_KEY_RE.fullmatch(key):
            raise DeployError(f"{path}:{line_number}: invalid environment variable name")
        if key in env:
            raise DeployError(f"{path}:{line_number}: duplicate environment variable {key}")
        if "\x00" in value:
            raise DeployError(f"{path}:{line_number}: NUL is not allowed")
        env[key] = value
    if "BASE_PORT" not in env:
        raise DeployError(f"{path}: BASE_PORT is required")
    base_port = parse_port(env["BASE_PORT"], "BASE_PORT")
    single_num = parse_positive_int(env.get("SINGLE_NUM", "1"), "SINGLE_NUM")
    if base_port + single_num - 1 > 65535:
        raise DeployError("BASE_PORT + SINGLE_NUM exceeds port 65535")
    return env


def parse_port(value: str, name: str) -> int:
    number = parse_positive_int(value, name)
    if number > 65535:
        raise DeployError(f"{name} must be at most 65535")
    return number


def parse_positive_int(value: str, name: str) -> int:
    try:
        number = int(value)
    except ValueError as exc:
        raise DeployError(f"{name} must be an integer") from exc
    if number <= 0:
        raise DeployError(f"{name} must be positive")
    return number


def parse_key_value(items: list[str], option: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for item in items:
        if "=" not in item:
            raise DeployError(f"{option} expects KEY=VALUE")
        key, value = item.split("=", 1)
        if not key:
            raise DeployError(f"{option} key cannot be empty")
        values[key] = value
    return values


def parse_volumes(items: list[str]) -> list[dict[str, str]]:
    volumes: list[dict[str, str]] = []
    for item in items:
        parts = item.split(":", 2)
        if len(parts) < 2 or not parts[0] or not parts[1].startswith("/"):
            raise DeployError("--volume expects VOLUME_ID:/absolute/mount/path[:subpath]")
        volume = {"volumeId": parts[0], "mountPath": parts[1]}
        if len(parts) == 3 and parts[2]:
            volume["subpath"] = parts[2]
        volumes.append(volume)
    return volumes


def derive_model_path(model_bos_path: str, workspace: str) -> str:
    if "?" in model_bos_path or "#" in model_bos_path:
        raise DeployError("model BOS path must not contain query parameters or fragments")
    if not model_bos_path.startswith("bos:/"):
        raise DeployError("model BOS path must start with bos:/")
    model_name = model_bos_path.rstrip("/").rsplit("/", 1)[-1]
    if not model_name or model_name in {".", ".."} or "/" in model_name:
        raise DeployError("model BOS path must end with a model directory name")
    return f"{workspace.rstrip('/')}/{model_name}"


def build_payload(args: argparse.Namespace, labels: dict[str, str], volumes: list[dict[str, str]]) -> dict[str, Any]:
    if not IMAGE_RE.fullmatch(args.image):
        raise DeployError("--image contains whitespace or unsupported characters")
    payload: dict[str, Any] = {
        "name": args.name,
        "target": args.target,
        "user": args.user,
        "buildInfo": {"dockerfileContent": f"FROM {args.image}\n"},
        "gpu": args.gpu,
        "gpuType": args.gpu_type or None,
        "autoStopInterval": 0,
        "autoDeleteInterval": 0,
        "public": args.public,
        "labels": {"managed-by": "sglang-daytona-deploy", "workload": "sglang", **labels},
    }
    if args.network_block_all:
        payload["networkBlockAll"] = True
    if args.network_allow_list:
        payload["networkAllowList"] = args.network_allow_list
    for key in ("cpu", "memory", "disk"):
        value = getattr(args, key)
        if value is not None:
            payload[key] = value
    if volumes:
        payload["volumes"] = volumes
    return {key: value for key, value in payload.items() if value is not None}


def toolbox_base(sandbox: dict[str, Any]) -> str:
    proxy_url = sandbox.get("toolboxProxyUrl")
    sandbox_id = sandbox.get("id")
    if not isinstance(proxy_url, str) or not proxy_url or not isinstance(sandbox_id, str):
        raise DeployError("sandbox response is missing id or toolboxProxyUrl")
    return f"{proxy_url.rstrip('/')}/{quote(sandbox_id, safe='')}"


def execute(
    client: DaytonaClient,
    base: str,
    command: str,
    envs: dict[str, str] | None = None,
    timeout: int = 120,
) -> str:
    payload: dict[str, Any] = {"command": command, "timeout": timeout}
    if envs:
        payload["envs"] = envs
    response = client.request_json("POST", f"{base}/process/execute", payload, timeout=timeout + 30)
    exit_code = response.get("exitCode", response.get("code"))
    result = str(response.get("result", ""))
    if exit_code != 0:
        raise DeployError(f"sandbox command failed with exit code {exit_code}: {result[-4000:]}")
    return result


def wait_for_started(client: DaytonaClient, sandbox: dict[str, Any], timeout: int, interval: int) -> dict[str, Any]:
    sandbox_id = str(sandbox["id"])
    deadline = time.monotonic() + timeout
    last_state = None
    while True:
        current = client.request_json("GET", f"{client.api_url}/sandbox/{quote(sandbox_id, safe='')}")
        state = current.get("state")
        if state != last_state:
            print(f"SANDBOX_STATE: {state}", flush=True)
            last_state = state
        if state == "started":
            return current
        if state in TERMINAL_ERROR_STATES:
            reason = current.get("errorReason") or "no error reason returned"
            raise DeployError(f"sandbox entered terminal state {state}: {reason}")
        if time.monotonic() >= deadline:
            raise DeployError(f"sandbox did not start within {timeout} seconds (last state: {state})")
        time.sleep(interval)


def wait_for_model_pull(
    client: DaytonaClient,
    base: str,
    timeout: int,
    interval: int,
) -> None:
    status_path = "/tmp/sglang-model-pull.rc"
    log_path = "/tmp/sglang-model-pull.log"
    deadline = time.monotonic() + timeout
    attempts = 0
    while time.monotonic() < deadline:
        attempts += 1
        command = (
            f"if [ -f {shlex.quote(status_path)} ]; then "
            f"printf 'DONE:'; cat {shlex.quote(status_path)}; "
            "else printf 'RUNNING'; fi"
        )
        result = execute(client, base, command, timeout=30).strip()
        if result.startswith("DONE:"):
            try:
                exit_code = int(result.split(":", 1)[1].strip())
            except ValueError as exc:
                raise DeployError(f"invalid model pull status: {result}") from exc
            tail = execute(client, base, f"tail -80 {shlex.quote(log_path)} 2>/dev/null || true", timeout=30)
            print(tail.rstrip(), flush=True)
            if exit_code != 0:
                raise DeployError(f"model pull failed with exit code {exit_code}; see {log_path}")
            return
        print(f"MODEL_PULL_WAIT: attempt={attempts}", flush=True)
        time.sleep(interval)
    tail = execute(client, base, f"tail -80 {shlex.quote(log_path)} 2>/dev/null || true", timeout=30)
    print(tail.rstrip(), flush=True)
    raise DeployError(f"model pull did not finish within {timeout} seconds; see {log_path}")


def preview_info(client: DaytonaClient, sandbox_id: str, port: int) -> dict[str, Any]:
    return client.request_json(
        "GET",
        f"{client.api_url}/sandbox/{quote(sandbox_id, safe='')}/ports/{port}/preview-url",
    )


def health_status(client: DaytonaClient, url: str, token: str) -> int:
    request = Request(
        f"{url.rstrip('/')}/health_generate",
        headers={"x-daytona-preview-token": token, "User-Agent": "sglang-daytona-deploy/1"},
        method="GET",
    )
    try:
        with urlopen(request, timeout=10, context=client.ssl_context) as response:
            response.read(1024)
            return response.status
    except HTTPError as exc:
        return exc.code
    except (URLError, OSError):
        return 0


def wait_for_health(
    client: DaytonaClient,
    sandbox_id: str,
    port: int,
    timeout: int,
    interval: int,
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    attempts = 0
    info: dict[str, Any] | None = None
    while time.monotonic() < deadline:
        attempts += 1
        try:
            if info is None:
                info = preview_info(client, sandbox_id, port)
            url = str(info["url"])
            token = str(info["token"])
            code = health_status(client, url, token)
        except (DeployError, KeyError):
            code = 0
            info = None
        print(f"HEALTH_WAIT: attempt={attempts} port={port} http_code={code:03d}", flush=True)
        if code == 200 and info is not None:
            return info
        time.sleep(interval)
    raise DeployError(f"SGLang did not become healthy on port {port} within {timeout} seconds")


def signed_preview_url(client: DaytonaClient, sandbox_id: str, port: int, expires: int) -> str:
    query = urlencode({"expiresInSeconds": expires})
    info = client.request_json(
        "GET",
        f"{client.api_url}/sandbox/{quote(sandbox_id, safe='')}/ports/{port}/signed-preview-url?{query}",
    )
    url = info.get("url")
    if not isinstance(url, str) or not url:
        raise DeployError("signed preview API response is missing url")
    return url


def make_ssl_context(ca_cert: str | None) -> ssl.SSLContext:
    import ssl

    if ca_cert:
        return ssl.create_default_context(cafile=ca_cert)
    return ssl.create_default_context()


def default_name() -> str:
    return time.strftime("sglang-%Y%m%d-%H%M%S", time.localtime())


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True, help="SGLang container image")
    parser.add_argument("--target", default=os.getenv("DAYTONA_TARGET"), help="Daytona target/region")
    parser.add_argument("--gpu", required=True, type=int, help="GPU count")
    parser.add_argument("--gpu-type", action="append", choices=("H100", "RTX-PRO-6000"), default=[])
    parser.add_argument("--cpu", type=int)
    parser.add_argument("--memory", type=int, help="Memory in GiB")
    parser.add_argument("--disk", type=int, help="Disk in GiB")
    parser.add_argument("--name", default=default_name())
    parser.add_argument("--user", default="root")
    parser.add_argument("--volume", action="append", default=[], metavar="ID:/PATH[:SUBPATH]")
    parser.add_argument("--label", action="append", default=[], metavar="KEY=VALUE")
    parser.add_argument("--workspace", default="/workspace")
    parser.add_argument("--model-bos-path", required=True)
    parser.add_argument("--env-file", required=True, type=Path)
    parser.add_argument("--skip-model-pull", action="store_true")
    parser.add_argument("--public", action="store_true")
    parser.add_argument("--network-block-all", action="store_true")
    parser.add_argument("--network-allow-list", help="Comma-separated CIDR allow-list for Sandbox egress")
    parser.add_argument("--signed-preview-expires", type=int, default=0, metavar="SECONDS")
    parser.add_argument("--api-url", default=os.getenv("DAYTONA_API_URL", "https://app.daytona.io/api"))
    parser.add_argument("--ca-cert", default=os.getenv("DAYTONA_CA_CERT"))
    parser.add_argument("--sandbox-timeout", type=int, default=1800)
    parser.add_argument("--model-timeout", type=int, default=14400)
    parser.add_argument("--health-timeout", type=int, default=1200)
    parser.add_argument("--poll-interval", type=int, default=20)
    parser.add_argument("--dry-run", action="store_true")
    return parser


def validate_args(args: argparse.Namespace) -> None:
    if not args.target:
        raise DeployError("--target or DAYTONA_TARGET is required")
    if args.gpu <= 0:
        raise DeployError("--gpu must be positive")
    for key in ("cpu", "memory", "disk"):
        value = getattr(args, key)
        if value is not None and value <= 0:
            raise DeployError(f"--{key} must be positive")
    if not args.workspace.startswith("/") or args.workspace == "/":
        raise DeployError("--workspace must be a non-root absolute path")
    if args.poll_interval <= 0:
        raise DeployError("--poll-interval must be positive")
    if args.signed_preview_expires and not 1 <= args.signed_preview_expires <= 86400:
        raise DeployError("--signed-preview-expires must be between 1 and 86400")
    if args.network_block_all and args.network_allow_list:
        raise DeployError("--network-block-all cannot be combined with --network-allow-list")
    if args.network_block_all and not args.skip_model_pull:
        raise DeployError("--network-block-all requires --skip-model-pull")


def run(args: argparse.Namespace) -> None:
    validate_args(args)
    env = parse_env_file(args.env_file)
    labels = parse_key_value(args.label, "--label")
    volumes = parse_volumes(args.volume)
    model_path = derive_model_path(args.model_bos_path, args.workspace)
    payload = build_payload(args, labels, volumes)

    if args.dry_run:
        print("DRY_RUN_REQUEST:")
        print(json.dumps(payload, indent=2, sort_keys=True))
        print(f"MODEL_PATH: {model_path}")
        print("SGLANG_ENV_KEYS: " + ",".join(sorted(env)))
        return

    api_key = os.getenv("DAYTONA_API_KEY")
    jwt_token = os.getenv("DAYTONA_JWT_TOKEN")
    organization_id = os.getenv("DAYTONA_ORGANIZATION_ID")
    if not api_key and not jwt_token:
        raise DeployError("set DAYTONA_API_KEY, or DAYTONA_JWT_TOKEN with DAYTONA_ORGANIZATION_ID")
    if not api_key and not organization_id:
        raise DeployError("DAYTONA_ORGANIZATION_ID is required with DAYTONA_JWT_TOKEN")

    bos_ak = os.getenv("BOS_AK", "")
    bos_sk = os.getenv("BOS_SK", "")
    if not args.skip_model_pull and (not bos_ak or not bos_sk):
        raise DeployError("set non-empty BOS_AK and BOS_SK, or use --skip-model-pull")
    if "\n" in bos_ak + bos_sk or "\r" in bos_ak + bos_sk:
        raise DeployError("BOS_AK and BOS_SK must not contain newlines")

    secret_values = [api_key or jwt_token or "", bos_ak, bos_sk]
    secret_values.extend(
        value for key, value in env.items() if SECRET_KEY_RE.search(key) and len(value) >= 4
    )
    client = DaytonaClient(
        args.api_url,
        api_key or jwt_token or "",
        None if api_key else organization_id,
        make_ssl_context(args.ca_cert),
        secret_values,
    )

    sandbox = client.request_json("POST", f"{client.api_url}/sandbox", payload, timeout=180)
    sandbox_id = sandbox.get("id")
    if not isinstance(sandbox_id, str) or not sandbox_id:
        raise DeployError("create sandbox response is missing id")
    print(
        f"SANDBOX_CREATED: id={sandbox_id} name={sandbox.get('name', args.name)} state={sandbox.get('state')}",
        flush=True,
    )
    sandbox = wait_for_started(client, sandbox, args.sandbox_timeout, args.poll_interval)
    base = toolbox_base(sandbox)

    gpu_output = execute(client, base, "nvidia-smi -L", timeout=60)
    if not gpu_output.strip():
        raise DeployError("nvidia-smi returned no visible GPU")
    print(f"GPU_READY: count={len([line for line in gpu_output.splitlines() if line.startswith('GPU ')])}", flush=True)

    scripts_dir = Path(__file__).resolve().parent
    remote_dir = f"{args.workspace.rstrip('/')}/.daytona-sglang"
    execute(client, base, f"mkdir -p {shlex.quote(remote_dir)}", timeout=60)
    remote_pull = f"{remote_dir}/pull_model.sh"
    remote_start = f"{remote_dir}/start_sglang.sh"
    client.upload_file(base, scripts_dir / "pull_model.sh", remote_pull)
    client.upload_file(base, scripts_dir / "start_sglang.sh", remote_start)
    execute(client, base, f"chmod 700 {shlex.quote(remote_pull)} {shlex.quote(remote_start)}", timeout=60)

    if args.skip_model_pull:
        execute(client, base, f"test -d {shlex.quote(model_path)}", timeout=60)
        print(f"MODEL_READY: path={model_path} source=existing", flush=True)
    else:
        status_path = "/tmp/sglang-model-pull.rc"
        log_path = "/tmp/sglang-model-pull.log"
        inner = (
            f"/bin/bash {shlex.quote(remote_pull)} {shlex.quote(args.model_bos_path)} "
            f"{shlex.quote(args.workspace)}; rc=$?; printf '%s\\n' \"$rc\" > {shlex.quote(status_path)}"
        )
        command = (
            f"rm -f {shlex.quote(status_path)} {shlex.quote(log_path)}; "
            f"nohup /bin/bash -lc {shlex.quote(inner)} </dev/null >{shlex.quote(log_path)} 2>&1 & "
            "echo MODEL_PULL_STARTED"
        )
        execute(client, base, command, {"BOS_AK": bos_ak, "BOS_SK": bos_sk}, timeout=60)
        print(f"MODEL_PULL_STARTED: path={model_path}", flush=True)
        wait_for_model_pull(client, base, args.model_timeout, args.poll_interval)
        print(f"MODEL_READY: path={model_path} source=bos", flush=True)

    start_output = execute(
        client,
        base,
        f"/bin/bash {shlex.quote(remote_start)} {shlex.quote(model_path)}",
        env,
        timeout=120,
    )
    print(start_output.rstrip(), flush=True)

    base_port = int(env["BASE_PORT"])
    single_num = int(env.get("SINGLE_NUM", "1"))
    main_preview = wait_for_health(
        client,
        sandbox_id,
        base_port,
        args.health_timeout,
        args.poll_interval,
    )
    ports: list[dict[str, Any]] = []
    for port in range(base_port, base_port + single_num):
        info = main_preview if port == base_port else wait_for_health(
            client,
            sandbox_id,
            port,
            args.health_timeout,
            args.poll_interval,
        )
        port_result: dict[str, Any] = {
            "port": port,
            "previewUrl": info.get("url"),
            "healthy": True,
        }
        if args.signed_preview_expires:
            port_result["signedPreviewUrl"] = signed_preview_url(
                client, sandbox_id, port, args.signed_preview_expires
            )
            port_result["signedPreviewExpiresInSeconds"] = args.signed_preview_expires
        ports.append(port_result)

    result = {
        "sandboxId": sandbox_id,
        "sandboxName": sandbox.get("name", args.name),
        "target": sandbox.get("target", args.target),
        "modelPath": model_path,
        "ports": ports,
        "logs": {
            "modelPull": "/tmp/sglang-model-pull.log",
            "sglang": "/tmp/sglang.log",
        },
    }
    print("DEPLOYMENT_RESULT: " + json.dumps(result, ensure_ascii=True, sort_keys=True), flush=True)


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        run(args)
    except (DeployError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
