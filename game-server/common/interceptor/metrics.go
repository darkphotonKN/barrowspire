package interceptor

import (
	"sync"

	grpcprom "github.com/grpc-ecosystem/go-grpc-middleware/providers/prometheus"
	"github.com/prometheus/client_golang/prometheus"
	"google.golang.org/grpc"
)

// one set per process: registering a second one on the default registry panics
var serverMetrics = sync.OnceValue(func() *grpcprom.ServerMetrics {
	m := grpcprom.NewServerMetrics(grpcprom.WithServerHandlingTimeHistogram())
	prometheus.MustRegister(m)
	return m
})

// Metrics records grpc_server_handled_total and grpc_server_handling_seconds
// per method and code on the default registry, so the existing /metrics
// endpoints serve them. Chain it first, so it sees the code Recovery and
// Status settle on, not the raw handler error.
func Metrics() grpc.UnaryServerInterceptor {
	return serverMetrics().UnaryServerInterceptor()
}
