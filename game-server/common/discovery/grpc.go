package discovery

import (
	"go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// Dial returns a long-lived gRPC client connection to addr ("host:port").
//
// The address comes from configuration, not a registry: "localhost:7126" when
// running natively, a compose service name or a Kubernetes Service DNS name
// ("items:7126") when containerized. The same binary runs in all three with
// only the env var changed.
//
// Dial does not connect. The first RPC does, so a service boots fine with its
// downstream absent, and a call made while the downstream is down fails with
// codes.Unavailable. The dns resolver re-resolves the name when the
// connection breaks, so a downstream that restarts on a new IP is picked up.
//
// Dial once per downstream and keep the conn for the process lifetime; gRPC
// multiplexes every call over it and reconnects on its own. Opening a conn per
// RPC serializes badly under concurrent load.
func Dial(addr string) (*grpc.ClientConn, error) {
	return grpc.NewClient("dns:///"+addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithStatsHandler(otelgrpc.NewClientHandler()),
		// Nothing publishes gRPC service config over DNS. Without this the dns
		// resolver looks up the TXT record _grpc_config.<host> and, on upstream
		// DNS that drops the query, blocks every new connection for ~20 s
		// (5 s x 2 attempts x 2 servers).
		grpc.WithDisableServiceConfig(),
	)
}
