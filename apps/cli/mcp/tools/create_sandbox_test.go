// Copyright 2025 Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0

package tools

import "testing"

func TestCreateSandboxRequestAllowsGpuOverrideFromSnapshot(t *testing.T) {
	snapshot := "gpu-snapshot"
	gpu := int32(4)

	request, err := createSandboxRequest(CreateSandboxArgs{Snapshot: &snapshot, Gpu: &gpu})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got, ok := request.GetGpuOk(); !ok || *got != gpu {
		t.Fatalf("GPU override = %v, %v; want %d, true", got, ok, gpu)
	}
}

func TestCreateSandboxRequestRejectsCpuOverrideFromSnapshot(t *testing.T) {
	snapshot := "gpu-snapshot"
	cpu := int32(2)

	if _, err := createSandboxRequest(CreateSandboxArgs{Snapshot: &snapshot, Cpu: &cpu}); err == nil {
		t.Fatal("expected CPU override to be rejected when using a snapshot")
	}
}
