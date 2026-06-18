package example

import (
	"context"
	"fmt"
	"sync"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/example"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"google.golang.org/grpc"
	"google.golang.org/grpc/connectivity"
)

/*
client.go implements the ExampleClient interface, providing methods to interact with
the example-service through gRPC. It uses Consul service discovery to locate the service
and establishes a connection dynamically at runtime.

This gateway serves as a client-side adapter between the API Gateway's REST endpoints and
the example-service's gRPC methods, handling the protocol translation and service location.
It's part of the Gateway pattern that isolates the API Gateway from the implementation
details of the backend microservices.

Each method follows a consistent pattern:
1. Establish connection to the service via service discovery
2. Create a gRPC client
3. Make the gRPC call
4. Return the result or error

Usage:
    registry := consul.NewRegistry(...)
    exampleGateway := gateway.NewExampleGateway(registry)
    example, err := exampleGateway.GetExample(ctx, &pb.GetExampleRequest{Id: "123"})

Note: Remove after copy pasting this as scaffolding.
*/

const (
	serviceName = "examples"
)

type Client struct {
	registry discovery.Registry
	mu       sync.Mutex
	conn     *grpc.ClientConn
}

func NewClient(registry discovery.Registry) ExampleClient {
	return &Client{
		registry: registry,
	}
}

// ensureConn lazily dials the service once and caches the connection for
// reuse across calls (gRPC multiplexes over it). Opening a fresh conn per RPC
// serialized badly and churned connections; see common/discovery/grpc.go.
func (c *Client) ensureConn(ctx context.Context) (*grpc.ClientConn, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn != nil && c.conn.GetState() != connectivity.Shutdown {
		return c.conn, nil
	}
	conn, err := discovery.ServiceConnection(ctx, serviceName, c.registry)
	if err != nil {
		return nil, err
	}
	c.conn = conn
	return conn, nil
}

func (c *Client) CreateExample(ctx context.Context, req *pb.CreateExampleRequest) (*pb.Example, error) {
	// connection instance created through service discovery first
	// searches for the service registered as "orders"
	conn, err := c.ensureConn(ctx)

	if err != nil {
		return nil, fmt.Errorf("failed to connect to example service: %w", err)
	}

	client := pb.NewExampleServiceClient(conn)

	// create client to interface with through service discovery connection
	exampleItem, err := client.CreateExample(ctx, req)

	fmt.Printf("Creating example %+v through gateway after service discovery\n", exampleItem)
	if err != nil {
		return nil, fmt.Errorf("failed to create example: %w", err)
	}
	return exampleItem, nil
}

func (c *Client) GetExample(ctx context.Context, req *pb.GetExampleRequest) (*pb.Example, error) {
	// discovery
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to example service: %w", err)
	}

	// create client to interface with through service discovery connection
	client := pb.NewExampleServiceClient(conn)
	order, err := client.GetExample(ctx, &pb.GetExampleRequest{
		Id: req.Id,
	})

	fmt.Printf("Creating order %+v through gateway after service discovery\n", order)
	if err != nil {
		return nil, fmt.Errorf("failed to get example: %w", err)
	}
	return order, nil
}
