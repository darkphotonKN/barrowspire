// Package temporal holds the shared Temporal client and worker bootstrap used
// by every service that participates in a saga.
//
// Architecture (ADR-0011): activities run inside the service that owns the data,
// routed by task queue. A workflow hosted by marketplace schedules an activity
// onto the `wallet` queue and wallet's own worker executes it against wallet's
// own use case. No saga step makes a gRPC call.
package temporal

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

// TaskQueue is the routing identity for a worker fleet.
//
// A task queue is just a string, and it has no inherent relationship to which
// service a worker lives in — the relationship is established by convention
// here and enforced by each service registering only its own activities.
type TaskQueue string

const (
	QueueMarketplace TaskQueue = "marketplace"
	QueueItems       TaskQueue = "items"
	QueueWallet      TaskQueue = "wallet"
	QueueLedger      TaskQueue = "ledger"
)

func (q TaskQueue) String() string { return string(q) }

// Config is everything a service needs to join the cluster.
//
// HostPort must come from configuration, never a constant: it is
// "temporal:7233" from inside the compose network and "localhost:7233" from an
// IDE or a test run on the host.
type Config struct {
	HostPort  string
	Namespace string
	TaskQueue TaskQueue

	// DialMaxAttempts bounds startup retry. Temporal's schema setup takes tens
	// of seconds on a cold volume, so an eager worker without this will
	// crash-loop and look like a config error when it is only impatience.
	DialMaxAttempts int
	DialBackoffMin  time.Duration
	DialBackoffMax  time.Duration
}

const (
	EnvHostPort  = "TEMPORAL_HOST_PORT"
	EnvNamespace = "TEMPORAL_NAMESPACE"

	DefaultHostPort  = "localhost:7233"
	DefaultNamespace = "barrowspire"
)

// LoadConfig reads connection settings from the environment and pairs them with
// the caller's own task queue. Each service passes its own queue; that is the
// one thing that is not environment-driven, because it is identity, not config.
func LoadConfig(queue TaskQueue) (Config, error) {
	if queue == "" {
		return Config{}, fmt.Errorf("temporal: task queue is required")
	}

	cfg := Config{
		HostPort:        envOr(EnvHostPort, DefaultHostPort),
		Namespace:       envOr(EnvNamespace, DefaultNamespace),
		TaskQueue:       queue,
		DialMaxAttempts: envIntOr("TEMPORAL_DIAL_MAX_ATTEMPTS", 30),
		DialBackoffMin:  time.Second,
		DialBackoffMax:  15 * time.Second,
	}
	return cfg, nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envIntOr(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}
