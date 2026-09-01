// Copyright Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0

package docker

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"sync"

	"github.com/docker/docker/api/types/container"
)

const (
	// GpuIndicesLabel is the canonical allocation label. Its value is a sorted,
	// comma-separated list of physical GPU indices assigned to the container.
	GpuIndicesLabel = "daytona.gpu_indices"
	// GpuIndexLabel is retained for containers created by older runners and is
	// also written for new single-GPU containers.
	GpuIndexLabel = "daytona.gpu_index"
)

// gpuAllocator hands out GPU device indices to GPU sandboxes on a runner.
// Allocation is serialized by a mutex so concurrent sandbox creations cannot
// pick the same physical card.
type gpuAllocator struct {
	mu    sync.Mutex
	total int
}

func newGpuAllocator(total int) *gpuAllocator {
	return &gpuAllocator{total: total}
}

// Acquire returns the lowest count free GPU indices while keeping the allocator
// locked. The caller must create the labelled container before calling release.
func (a *gpuAllocator) Acquire(ctx context.Context, d *DockerClient, count int) ([]int, func(), error) {
	a.mu.Lock()
	release := func() { a.mu.Unlock() }

	if count <= 0 {
		release()
		return nil, nil, fmt.Errorf("GPU allocation count must be greater than zero")
	}
	if a.total <= 0 || count > a.total {
		release()
		return nil, nil, fmt.Errorf("invalid GPU allocation count: requested %d, capacity %d", count, a.total)
	}

	containers, err := d.apiClient.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		release()
		return nil, nil, fmt.Errorf("list containers for GPU allocation: %w", err)
	}

	allocated, err := selectFreeGpuIndices(containers, a.total, count)
	if err != nil {
		release()
		return nil, nil, err
	}
	return allocated, release, nil
}

func selectFreeGpuIndices(containers []container.Summary, total, count int) ([]int, error) {
	if count <= 0 || count > total {
		return nil, fmt.Errorf("invalid GPU allocation count: requested %d, capacity %d", count, total)
	}

	used := make(map[int]struct{}, len(containers))
	for _, c := range containers {
		indices, err := parseGpuAllocationLabels(c.Labels, total)
		if err != nil {
			return nil, fmt.Errorf("invalid GPU allocation labels on container %s: %w", c.ID, err)
		}
		for _, index := range indices {
			used[index] = struct{}{}
		}
	}

	available := total - len(used)
	if available < count {
		return nil, fmt.Errorf(
			"insufficient free GPUs on runner: requested %d, available %d, capacity %d",
			count,
			available,
			total,
		)
	}

	allocated := make([]int, 0, count)
	for i := 0; i < total; i++ {
		if _, taken := used[i]; !taken {
			allocated = append(allocated, i)
			if len(allocated) == count {
				return allocated, nil
			}
		}
	}

	return nil, fmt.Errorf("failed to allocate GPUs despite sufficient reported capacity")
}

func parseGpuAllocationLabels(labels map[string]string, total int) ([]int, error) {
	value, ok := labels[GpuIndicesLabel]
	if !ok {
		value, ok = labels[GpuIndexLabel]
	}
	if !ok {
		return nil, nil
	}
	if value == "" {
		return nil, fmt.Errorf("GPU allocation label is empty")
	}

	parts := strings.Split(value, ",")
	indices := make([]int, 0, len(parts))
	seen := make(map[int]struct{}, len(parts))
	for _, part := range parts {
		if part == "" || strings.TrimSpace(part) != part {
			return nil, fmt.Errorf("invalid GPU index %q", part)
		}
		index, err := strconv.Atoi(part)
		if err != nil {
			return nil, fmt.Errorf("invalid GPU index %q", part)
		}
		if index < 0 || index >= total {
			return nil, fmt.Errorf("GPU index %d is outside runner capacity %d", index, total)
		}
		if _, exists := seen[index]; exists {
			return nil, fmt.Errorf("duplicate GPU index %d", index)
		}
		seen[index] = struct{}{}
		indices = append(indices, index)
	}

	sort.Ints(indices)
	return indices, nil
}
