#!/bin/bash
# 宿主机运行：用实时时间戳创建 sglang 部署容器
# 用法: create_container.sh <镜像名> <挂载路径 host:container>
set -e

IMAGE="$1"
MOUNT="$2"   # 例如 /ssd2/wangning33/agent_workspace:/workspace

if [ -z "$IMAGE" ] || [ -z "$MOUNT" ]; then
  echo "Usage: $0 <image> <host_path:container_path>" >&2
  exit 1
fi

HOST_DIR="${MOUNT%%:*}"
mkdir -p "$HOST_DIR"

TS=$(date +%Y%m%d_%H%M%S)
CONTAINER_NAME="${USER}-sglang.${TS}"

docker run --init --network=host -d -it \
  --hostname docker-${USER} \
  --name "${CONTAINER_NAME}" \
  --runtime=nvidia --gpus all \
  --shm-size=700g --privileged \
  --cap-add=SYS_ADMIN --cap-add=NET_RAW --cap-add=NET_ADMIN \
  --ulimit memlock=-1 \
  --device=/dev/fuse --device=/dev/infiniband \
  -v /etc/localtime:/etc/localtime:ro \
  -v /lib/modules:/lib/modules \
  -v /opt/compiler:/opt/compiler:ro \
  -v /home/opt:/home/opt:ro \
  -v ${HOME}:${HOME} \
  -v "${MOUNT}" \
  "$IMAGE" \
  /bin/bash -i -c "(getent group $(id -gn) || groupadd -g $(id -g) $(id -gn)) && (getent passwd ${USER}) || (useradd -d ${HOME} -u $(id -u) -g $(id -g) ${USER} && echo \"${USER} ALL=(ALL:ALL) NOPASSWD:ALL\" >> /etc/sudoers && echo \"127.0.0.1 docker-${USER}\" >> /etc/hosts)  && su -l ${USER}"

sleep 5
STATUS=$(docker ps --filter "name=${CONTAINER_NAME}" --format '{{.Status}}')
if [ -z "$STATUS" ]; then
  echo "ERROR: container ${CONTAINER_NAME} is not running" >&2
  docker logs "${CONTAINER_NAME}" 2>&1 | tail -20 >&2
  exit 1
fi
echo "CONTAINER_READY: ${CONTAINER_NAME} (${STATUS})"
