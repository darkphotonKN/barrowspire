package discovery

import (
	"context"
	"errors"
	"math/rand"

	"go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// ServiceConnection looks up a healthy instance of serviceName in the registry
// and returns a fresh gRPC client connection to it.
//
// NOTE: callers should NOT call this per RPC. The ClientConn returned is
// long-lived; gRPC handles reconnection internally. Open once in your gateway
// client constructor, keep it for the lifetime of the gateway. Opening a new
// conn per request serializes badly under concurrent load.
func ServiceConnection(ctx context.Context, serviceName string, registry Registry) (*grpc.ClientConn, error) {
	addrs, err := registry.Discover(ctx, serviceName)
	if err != nil {
		return nil, err
	}
	if len(addrs) == 0 {
		return nil, errors.New("no healthy instances of service: " + serviceName)
	}

	return grpc.NewClient(
		addrs[rand.Intn(len(addrs))],
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithStatsHandler(otelgrpc.NewClientHandler()),
		// Consul is the discovery mechanism; nothing publishes gRPC service
		// config over DNS. Without this the dns resolver looks up the TXT
		// record _grpc_config.<host> and, on upstream DNS that drops the query,
		// blocks every new connection for ~20 s (5 s x 2 attempts x 2 servers).
		grpc.WithDisableServiceConfig(),
	)
}
