/*
Distributed tracing setup, shared by every service.

Init installs a global OTLP trace exporter, so the otelgrpc, otelgin and otelsql
instrumentation (and any otel.Tracer(...) call) produce spans with no
per-handler code. Context crosses service boundaries as W3C traceparent.

Env:
  - OTEL_ENABLED: "true" to export. Anything else installs nothing, and every
    tracer stays the SDK's no-op.
  - OTEL_EXPORTER_OTLP_ENDPOINT: OTLP gRPC endpoint. Falls back to
    COLLECTOR_ENDPOINT (the local docker collector), then tempo.monitoring:4317.
  - OTEL_TRACES_SAMPLER_ARG: ratio of new traces kept, 0..1, default 1.
  - SERVICE_VERSION: stamped on every span's resource.
*/
package tracing

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc"
	"go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc/filters"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
	"google.golang.org/grpc"
)

const (
	defaultEndpoint = "tempo.monitoring:4317"
	// short so a dead backend never holds up the batch goroutine for long
	exportTimeout   = 3 * time.Second
	shutdownTimeout = 5 * time.Second
)

func noopShutdown(context.Context) error { return nil }

// Init installs the global tracer provider and propagators. Call it once at
// startup and hand the returned shutdown to Close so buffered spans flush.
func Init(ctx context.Context, serviceName string) (shutdown func(context.Context) error, err error) {
	if commonhelpers.GetEnvString("OTEL_ENABLED", "false") != "true" {
		return noopShutdown, nil
	}

	endpoint := commonhelpers.GetEnvString("OTEL_EXPORTER_OTLP_ENDPOINT",
		commonhelpers.GetEnvString("COLLECTOR_ENDPOINT", defaultEndpoint))

	ratio, err := strconv.ParseFloat(commonhelpers.GetEnvString("OTEL_TRACES_SAMPLER_ARG", "1.0"), 64)
	if err != nil || ratio < 0 || ratio > 1 {
		return noopShutdown, fmt.Errorf("OTEL_TRACES_SAMPLER_ARG must be a number in 0..1, got %q", commonhelpers.GetEnvString("OTEL_TRACES_SAMPLER_ARG", ""))
	}

	opts := []otlptracegrpc.Option{
		otlptracegrpc.WithInsecure(),
		otlptracegrpc.WithTimeout(exportTimeout),
		// skip the DNS TXT service-config lookup, as discovery.Dial does
		otlptracegrpc.WithDialOption(grpc.WithDisableServiceConfig()),
	}
	if strings.Contains(endpoint, "://") {
		opts = append(opts, otlptracegrpc.WithEndpointURL(endpoint))
	} else {
		opts = append(opts, otlptracegrpc.WithEndpoint(endpoint))
	}

	exporter, err := otlptracegrpc.New(ctx, opts...)
	if err != nil {
		return noopShutdown, fmt.Errorf("creating trace exporter: %w", err)
	}

	res := resource.NewWithAttributes(
		semconv.SchemaURL,
		semconv.ServiceName(serviceName),
		semconv.ServiceVersion(commonhelpers.GetEnvString("SERVICE_VERSION", "dev")),
	)

	provider := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
		// follow the caller's decision so a trace is never half-sampled across hops
		sdktrace.WithSampler(sdktrace.ParentBased(sdktrace.TraceIDRatioBased(ratio))),
	)
	otel.SetTracerProvider(provider)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	slog.Info("tracing enabled", "endpoint", endpoint, "sample_ratio", ratio)
	return provider.Shutdown, nil
}

// Close flushes buffered spans, bounded so a dead backend cannot stall exit.
// Defer it after Init; deferred in main it runs after the gRPC GracefulStop.
func Close(shutdown func(context.Context) error) {
	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := shutdown(ctx); err != nil {
		slog.Error("flushing traces on shutdown", "err", err)
	}
}

// ServerHandler traces every incoming RPC except health checks, which kubelet
// probes call every few seconds and would bury real traces.
func ServerHandler() grpc.ServerOption {
	return grpc.StatsHandler(otelgrpc.NewServerHandler(
		otelgrpc.WithFilter(filters.Not(filters.HealthCheck())),
	))
}
