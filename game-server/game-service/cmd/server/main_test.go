package main

import "testing"

// FS-BDRTJ §Requirements 1: only development, in any case, turns the room on.
func TestDevTestRoomOn(t *testing.T) {
	tests := []struct {
		environment string
		want        bool
	}{
		{"development", true},
		{"DEVELOPMENT", true},
		{"Development", true},
		{"production", false},
		{"", false},
		{"develop", false},
		{"dev", false},
		{" development", false},
		{"staging", false},
	}
	for _, tt := range tests {
		t.Run(tt.environment, func(t *testing.T) {
			if got := devTestRoomOn(tt.environment); got != tt.want {
				t.Errorf("devTestRoomOn(%q) = %v, want %v", tt.environment, got, tt.want)
			}
		})
	}
}
