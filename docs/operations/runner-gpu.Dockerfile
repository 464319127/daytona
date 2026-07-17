FROM daytonaio/daytona-runner:v0.187.0

# The upstream runner image is Alpine-based. gcompat provides the glibc
# compatibility layer needed by the host-injected NVIDIA utilities.
RUN apk add --no-cache gcompat
