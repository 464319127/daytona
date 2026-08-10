// Copyright 2025 Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0

package docker

import (
	"reflect"
	"testing"

	runnerconfig "github.com/daytonaio/runner/cmd/runner/config"
	"github.com/daytonaio/runner/pkg/api/dto"
	"github.com/docker/docker/api/types/image"
	imageconfig "github.com/moby/docker-image-spec/specs-go/v1"
)

func TestMultiGpuContainerConfigs(t *testing.T) {
	initContainerConfigTestConfig(t)
	d := &DockerClient{gpuEnabled: true, resourceLimitsDisabled: true}
	sandbox := dto.CreateSandboxDTO{Id: "sandbox", Snapshot: "snapshot", OsUser: "daytona"}
	img := &image.InspectResponse{Config: &imageconfig.DockerOCIImageConfig{}}

	containerConfig, hostConfig, _, err := d.getContainerConfigs(sandbox, img, nil, []int{1, 3, 5, 7})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := containerConfig.Labels[GpuIndicesLabel]; got != "1,3,5,7" {
		t.Fatalf("GPU indices label = %q", got)
	}
	if _, exists := containerConfig.Labels[GpuIndexLabel]; exists {
		t.Fatal("legacy single-GPU label must not be written for a multi-GPU allocation")
	}
	assertEnvContains(t, containerConfig.Env, "NVIDIA_VISIBLE_DEVICES=0,1,2,3")
	assertEnvContains(t, containerConfig.Env, "CUDA_VISIBLE_DEVICES=0,1,2,3")

	if hostConfig.Privileged {
		t.Fatal("GPU container must not be privileged")
	}
	wantDeviceIDs := []string{"nvidia.com/gpu=1", "nvidia.com/gpu=3", "nvidia.com/gpu=5", "nvidia.com/gpu=7"}
	if len(hostConfig.DeviceRequests) != 1 || !reflect.DeepEqual(hostConfig.DeviceRequests[0].DeviceIDs, wantDeviceIDs) {
		t.Fatalf("device requests = %#v, want %v", hostConfig.DeviceRequests, wantDeviceIDs)
	}
}

func TestSingleGpuContainerWritesBothLabels(t *testing.T) {
	initContainerConfigTestConfig(t)
	d := &DockerClient{gpuEnabled: true, resourceLimitsDisabled: true}
	sandbox := dto.CreateSandboxDTO{Id: "sandbox", Snapshot: "snapshot", OsUser: "daytona"}
	img := &image.InspectResponse{Config: &imageconfig.DockerOCIImageConfig{}}

	containerConfig, _, _, err := d.getContainerConfigs(sandbox, img, nil, []int{3})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := containerConfig.Labels[GpuIndicesLabel]; got != "3" {
		t.Fatalf("GPU indices label = %q", got)
	}
	if got := containerConfig.Labels[GpuIndexLabel]; got != "3" {
		t.Fatalf("legacy GPU index label = %q", got)
	}
}

func initContainerConfigTestConfig(t *testing.T) {
	t.Helper()
	t.Setenv("DAYTONA_API_URL", "http://api")
	t.Setenv("DAYTONA_RUNNER_TOKEN", "test-token")
	t.Setenv("RUNNER_DOMAIN", "127.0.0.1")
	if _, err := runnerconfig.GetConfig(); err != nil {
		t.Fatalf("initialize runner config: %v", err)
	}
}

func assertEnvContains(t *testing.T, env []string, want string) {
	t.Helper()
	for _, value := range env {
		if value == want {
			return
		}
	}
	t.Fatalf("environment %v does not contain %q", env, want)
}
