package temporal

import (
	"context"
	"fmt"
	"time"

	"go.temporal.io/sdk/client"
	sdklog "go.temporal.io/sdk/log"
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
		c, err := client.Dial(client.Options{
			HostPort:  cfg.HostPort,
			Namespace: cfg.Namespace,
			Logger:    logger,
		})
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
