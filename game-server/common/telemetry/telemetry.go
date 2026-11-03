/*
OpenTelemetry METRICS setup (OTLP push to a collector).

Traces live in common/tracing. This only ships otel.Meter(...) instruments,
which today is game-service's tick metrics, to the local docker collector.
Request (RED) metrics do not use this: they are Prometheus, scraped from /metrics.

Design constraints:
  - Telemetry must NEVER block the request path. Timeouts are aggressive
    (3s for exports) so a degraded collector burns at most 3s per attempt.
  - Telemetry must be killable. Set `OTEL_ENABLED=false` (or leave
    `COLLECTOR_ENDPOINT` empty) and Init returns a no-op shutdown; no
    exporters or providers are installed. Code that calls
    otel.Meter(...) gets the SDK's default noop providers, so callers
    don't need to branch.
  - Periodic reader fires every 30s (not 10s) — less log spam when the
    collector is unhealthy in dev.
*/
package telemetry

import (
	"context"
	"fmt"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
	"google.golang.org/grpc"
)

// Config holds the configuration for telemetry initialization.
// You'll typically populate this from environment variables.
type Config struct {
	ServiceName       string // e.g., "stats-service", "auth-service"
	ServiceVersion    string // e.g., "1.0.0" - useful for tracking deployments
	Environment       string // e.g., "development", "staging", "production"
	CollectorEndpoint string // e.g., "localhost:4430" - where the OTel Collector lives

	// Enabled toggles the whole OTel setup. When false, Init returns a no-op
	// shutdown function and installs nothing globally. Wire this from the
	// OTEL_ENABLED env var so you can flip telemetry off in dev when the
	// collector is unhealthy.
	Enabled bool
}

// Timeouts kept short so a degraded collector never makes a request goroutine
// wait. 3s is the sweet spot — long enough for a cold gRPC dial + handshake
// on first export, short enough that a stuck collector isn't a long block.
// Periodic reader fires every 30s, so the failure budget is bounded.
const (
	exportTimeout  = 3 * time.Second
	metricInterval = 30 * time.Second
)

// noopShutdown is returned when telemetry is disabled.
func noopShutdown(context.Context) error { return nil }

// Init initializes OpenTelemetry and returns a shutdown function.
// Always call the returned shutdown on service exit so pending data flushes.
//
// When Enabled=false (or CollectorEndpoint=""), Init is a no-op: no exporters
// are created, no global providers are set, and the returned shutdown does
// nothing. Code that calls otel.Meter(...) gets the SDK's
// default noop providers, so no branching is needed elsewhere.
func Init(ctx context.Context, cfg Config) (shutdown func(context.Context) error, err error) {
	if !cfg.Enabled || cfg.CollectorEndpoint == "" {
		return noopShutdown, nil
	}

	// A Resource describes WHO is producing the telemetry — metadata attached
	// to every metric (filter by service.name in Grafana).
	res := resource.NewWithAttributes(
		semconv.SchemaURL,
		semconv.ServiceName(cfg.ServiceName),
		semconv.ServiceVersion(cfg.ServiceVersion),
		semconv.DeploymentEnvironment(cfg.Environment),
	)

	// --- metrics ---

	metricExporter, err := otlpmetricgrpc.New(ctx,
		otlpmetricgrpc.WithEndpoint(cfg.CollectorEndpoint),
		otlpmetricgrpc.WithInsecure(),
		otlpmetricgrpc.WithTimeout(exportTimeout),
		otlpmetricgrpc.WithDialOption(grpc.WithDisableServiceConfig()),
	)
	if err != nil {
		return noopShutdown, fmt.Errorf("creating metric exporter: %w", err)
	}

	meterProvider := sdkmetric.NewMeterProvider(
		sdkmetric.WithResource(res),
		sdkmetric.WithReader(
			sdkmetric.NewPeriodicReader(metricExporter,
				sdkmetric.WithInterval(metricInterval),
			),
		),
	)
	otel.SetMeterProvider(meterProvider)

	return meterProvider.Shutdown, nil
}
