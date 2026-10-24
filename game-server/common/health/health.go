package health

import (
	"context"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
)

func Register(ctx context.Context, grpcServer *grpc.Server, pingFn func(ctx context.Context) error) *health.Server {
	// new health struct is a map holding serviceName:status
	hs := health.NewServer()
	// regsiter this service name on the map
	healthpb.RegisterHealthServer(grpcServer, hs)
	hs.SetServingStatus("", healthpb.HealthCheckResponse_SERVING)
	// start by saying its NOT serving, for readiness check
	hs.SetServingStatus("readiness", healthpb.HealthCheckResponse_NOT_SERVING)

	// make our checks every 3 seconds for what we consider "service is ready"
	// default is the DB
	go func() {
		t := time.NewTicker(3 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return

			case <-t.C:
				// check DB every 3 seconds
				cancelCtx, cancel := context.WithTimeout(ctx, time.Second)
				err := pingFn(cancelCtx)
				cancel()
				status := healthpb.HealthCheckResponse_SERVING
				if err != nil {
					status = healthpb.HealthCheckResponse_NOT_SERVING
				}
				// update the service map for if we are ready or not based on db status
				hs.SetServingStatus("readiness", status)
			}
		}

	}()

	return hs
}
