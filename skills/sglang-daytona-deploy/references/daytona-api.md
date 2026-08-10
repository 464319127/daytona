# Daytona API mapping

`scripts/deploy.py` implements these calls with `Authorization: Bearer <token>`. With JWT authentication it also sends `X-Daytona-Organization-ID`.

## Create a custom-image GPU Sandbox

```http
POST ${DAYTONA_API_URL}/sandbox
Content-Type: application/json
```

```json
{
  "name": "sglang-20260717-120000",
  "target": "gpu-region",
  "user": "root",
  "buildInfo": {
    "dockerfileContent": "FROM registry.example.com/sglang:tag\n"
  },
  "gpu": 1,
  "gpuType": ["H100"],
  "autoStopInterval": 0,
  "autoDeleteInterval": 0,
  "public": false,
  "networkAllowList": "10.48.51.15/32",
  "labels": {
    "managed-by": "sglang-daytona-deploy",
    "workload": "sglang"
  }
}
```

Use `buildInfo.dockerfileContent`, not an `image` field, for the current Daytona REST schema. GPU Sandboxes must set `autoDeleteInterval` to `0`; stopping one deletes it.

Poll `GET /sandbox/{id}` until `state` is `started`. Treat `error`, `build_failed`, and `destroyed` as terminal failures. The response includes `toolboxProxyUrl`.

## Toolbox API

Build the base URL as:

```text
{toolboxProxyUrl without trailing slash}/{sandboxId}
```

Execute commands with:

```http
POST {toolboxBase}/process/execute
Content-Type: application/json
```

```json
{
  "command": "nvidia-smi -L",
  "envs": {
    "EXAMPLE": "value"
  },
  "timeout": 60
}
```

The response is `{ "exitCode": 0, "result": "..." }`. Pass credentials only through `envs`; never interpolate them into `command`.

Upload a file with `POST {toolboxBase}/files/upload?path=<remote-path>` as multipart form field `file`.

## Port preview

Get a standard preview URL and short-lived access token:

```http
GET ${DAYTONA_API_URL}/sandbox/{id}/ports/{port}/preview-url
```

Call the service with `x-daytona-preview-token: <token>`. Do not print the token.

Generate a shareable signed URL only after explicit user request:

```http
GET ${DAYTONA_API_URL}/sandbox/{id}/ports/{port}/signed-preview-url?expiresInSeconds=3600
```

The signed URL contains authorization material. Its expiry must be between 1 and 86400 seconds.

## Volumes and bind mounts

Daytona API accepts persistent volumes as:

```json
{
  "volumes": [
    {
      "volumeId": "model-cache",
      "mountPath": "/workspace",
      "subpath": "models/team-a"
    }
  ]
}
```

Do not send host bind mount syntax such as `/host/path:/workspace`; the runner host filesystem is outside the Sandbox API contract.

## Failure inspection and lifecycle

Read logs with Toolbox command execution, for example `tail -80 /tmp/sglang.log`. Do not stop a failed Sandbox until the user approves.

After approval, stop it with:

```http
POST ${DAYTONA_API_URL}/sandbox/{id}/stop
```

Because the deployment is ephemeral (`autoDeleteInterval: 0`), stopping deletes the GPU Sandbox.
