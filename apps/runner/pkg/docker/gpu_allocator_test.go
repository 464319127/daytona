// Copyright 2025 Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0

package docker

import (
	"reflect"
	"strings"
	"testing"

	"github.com/docker/docker/api/types/container"
)

func TestSelectFreeGpuIndices(t *testing.T) {
	tests := []struct {
		name       string
		containers []container.Summary
		count      int
		want       []int
		wantErr    string
	}{
		{name: "empty runner", count: 4, want: []int{0, 1, 2, 3}},
		{
			name: "fills fragmented capacity from new label",
			containers: []container.Summary{{
				ID:     "existing",
				State:  "exited",
				Labels: map[string]string{GpuIndicesLabel: "0,2,4,6"},
			}},
			count: 4,
			want:  []int{1, 3, 5, 7},
		},
		{
			name: "reads legacy label",
			containers: []container.Summary{{
				ID:     "legacy",
				Labels: map[string]string{GpuIndexLabel: "0"},
			}},
			count: 1,
			want:  []int{1},
		},
		{
			name: "does not partially allocate",
			containers: []container.Summary{{
				ID:     "existing",
				Labels: map[string]string{GpuIndicesLabel: "0,1,2,3,4,5"},
			}},
			count:   3,
			wantErr: "requested 3, available 2, capacity 8",
		},
		{
			name: "fails closed on invalid label",
			containers: []container.Summary{{
				ID:     "invalid",
				Labels: map[string]string{GpuIndicesLabel: "0,0"},
			}},
			count:   1,
			wantErr: "duplicate GPU index 0",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := selectFreeGpuIndices(tt.containers, 8, tt.count)
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("expected error containing %q, got %v", tt.wantErr, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("got %v, want %v", got, tt.want)
			}
		})
	}
}

func TestParseGpuAllocationLabelsPrefersCanonicalLabel(t *testing.T) {
	got, err := parseGpuAllocationLabels(map[string]string{
		GpuIndicesLabel: "3,1",
		GpuIndexLabel:   "7",
	}, 8)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if want := []int{1, 3}; !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}
