ARG RUNNER_BASE_IMAGE=daytonaio/daytona-runner:v0.187.0
FROM ${RUNNER_BASE_IMAGE}

# The validated local GPU base already contains gcompat. Set this to true only
# when rebuilding from the unmodified upstream image on a networked machine.
ARG INSTALL_GPU_COMPAT=false
RUN if [ "$INSTALL_GPU_COMPAT" = true ]; then \
      apk add --no-cache ca-certificates gcompat; \
    fi

# Trust the current self-signed Daytona control-plane certificate. Remove this
# COPY/RUN pair when the server uses a publicly trusted certificate, or replace
# the certificate with the CA used by the target control plane.
COPY daytona-server-ca.crt /usr/local/share/ca-certificates/daytona-server.crt
RUN update-ca-certificates
