package temporal

import (
	"context"
	"crypto/tls"
	"fmt"
	"time"

	"go.temporal.io/sdk/client"
	sdklog "go.temporal.io/sdk/log"
	"google.golang.org/grpc"
)

// Dial connects to the Temporal frontend, retrying with bounded exponential
// backoff until the context is cancelled or DialMaxAttempts is exhausted.
//
// The retry is not a workaround for compose ordering. A frontend can be
// unreachable at any moment in production — during a rolling restart, a node
// replacement, a network blip — and a worker that exits on first dial failure
// turns every one of those into a manual restart.
func Dial(ctx context.Context, cfg Config, logger sdklog.Logger) (client.Client, error) {
	backoff := cfg.DialBackoffMin
	if backoff <= 0 {
		backoff = time.Second
	}
	maxBackoff := cfg.DialBackoffMax
	if maxBackoff <= 0 {
		maxBackoff = 15 * time.Second
	}
	attempts := cfg.DialMaxAttempts
	if attempts <= 0 {
		attempts = 30
	}

	var lastErr error
	for attempt := 1; attempt <= attempts; attempt++ {
		c, err := client.Dial(clientOptions(cfg, logger))
		if err == nil {
			if logger != nil {
				logger.Info("temporal: connected",
					"hostPort", cfg.HostPort,
					"namespace", cfg.Namespace,
					"taskQueue", cfg.TaskQueue.String(),
					"attempt", attempt,
				)
			}
			return c, nil
		}

		lastErr = err
		if logger != nil {
			logger.Warn("temporal: dial failed, retrying",
				"hostPort", cfg.HostPort,
				"attempt", attempt,
				"maxAttempts", attempts,
				"retryIn", backoff.String(),
				"error", err.Error(),
			)
		}

		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("temporal: dial cancelled after %d attempts: %w", attempt, ctx.Err())
		case <-time.After(backoff):
		}

		backoff *= 2
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
	}

	return nil, fmt.Errorf("temporal: dial %s failed after %d attempts: %w", cfg.HostPort, attempts, lastErr)
}

// clientOptions builds the SDK options for one dial attempt.
//
// With an API key the connection is Temporal Cloud's: TLS against the system
// CA pool plus the key as credentials. Without one it stays the plain
// connection a local or in-cluster server expects.
func clientOptions(cfg Config, logger sdklog.Logger) client.Options {
	opts := client.Options{
		HostPort:  cfg.HostPort,
		Namespace: cfg.Namespace,
		Logger:    logger,
		// Skip the DNS TXT service-config lookup that can stall a dial past
		// its deadline (see discovery.Dial). The SDK's own
		// default service config still applies.
		ConnectionOptions: client.ConnectionOptions{
			DialOptions: []grpc.DialOption{grpc.WithDisableServiceConfig()},
		},
	}

	if cfg.APIKey != "" {
		opts.Credentials = client.NewAPIKeyStaticCredentials(cfg.APIKey)
		opts.ConnectionOptions.TLS = &tls.Config{}
	}

	return opts
}
