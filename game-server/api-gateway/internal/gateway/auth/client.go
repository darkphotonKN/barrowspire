package auth

import (
	"context"
	"fmt"
	"sync"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/auth"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"google.golang.org/grpc"
	"google.golang.org/grpc/connectivity"
)

const (
	serviceName = "auth"
)

type Client struct {
	registry discovery.Registry
	mu       sync.Mutex
	conn     *grpc.ClientConn
}

func NewClient(registry discovery.Registry) AuthClient {
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

func (c *Client) CreateMember(ctx context.Context, req *pb.CreateMemberRequest) (*pb.Member, error) {
	conn, err := c.ensureConn(ctx)

	if err != nil {
		return nil, fmt.Errorf("failed to connect to auth service: %w", err)
	}

	client := pb.NewAuthServiceClient(conn)

	member, err := client.CreateMember(ctx, req)
	return member, err
}

func (c *Client) GetMember(ctx context.Context, req *pb.GetMemberRequest) (*pb.Member, error) {
	conn, err := c.ensureConn(ctx)

	if err != nil {
		return nil, fmt.Errorf("failed to connect to auth service: %w", err)
	}

	client := pb.NewAuthServiceClient(conn)

	member, err := client.GetMember(ctx, req)
	return member, err
}

func (c *Client) LoginMember(ctx context.Context, req *pb.LoginRequest) (*pb.LoginResponse, error) {
	conn, err := c.ensureConn(ctx)

	if err != nil {
		return nil, fmt.Errorf("failed to connect to auth service: %w", err)
	}

	client := pb.NewAuthServiceClient(conn)

	response, err := client.LoginMember(ctx, req)
	return response, err
}

func (c *Client) UpdateMemberInfo(ctx context.Context, req *pb.UpdateMemberInfoRequest) (*pb.Member, error) {
	conn, err := c.ensureConn(ctx)

	if err != nil {
		return nil, fmt.Errorf("failed to connect to auth service: %w", err)
	}

	client := pb.NewAuthServiceClient(conn)

	member, err := client.UpdateMemberInfo(ctx, req)
	return member, err
}

func (c *Client) UpdateMemberPassword(ctx context.Context, req *pb.UpdatePasswordRequest) (*pb.UpdatePasswordResponse, error) {
	conn, err := c.ensureConn(ctx)

	if err != nil {
		return nil, fmt.Errorf("failed to connect to auth service: %w", err)
	}

	client := pb.NewAuthServiceClient(conn)

	response, err := client.UpdateMemberPassword(ctx, req)
	return response, err
}

func (c *Client) ValidateToken(ctx context.Context, req *pb.ValidateTokenRequest) (*pb.ValidateTokenResponse, error) {
	conn, err := c.ensureConn(ctx)

	if err != nil {
		return nil, fmt.Errorf("failed to connect to auth service: %w", err)
	}

	client := pb.NewAuthServiceClient(conn)

	response, err := client.ValidateToken(ctx, req)
	return response, err
}

func (c *Client) RequestAvatarUpload(ctx context.Context, req *pb.RequestAvatarUploadRequest) (*pb.RequestAvatarUploadResponse, error) {
	conn, err := c.ensureConn(ctx)

	if err != nil {
		return nil, fmt.Errorf("failed to connect to auth service: %w", err)
	}

	client := pb.NewUploadServiceClient(conn)

	response, err := client.RequestAvatarUpload(ctx, req)
	return response, err
}

func (c *Client) ConfirmAvatarUpload(ctx context.Context, req *pb.ConfirmAvatarUploadRequest) (*pb.ConfirmAvatarUploadResponse, error) {
	conn, err := c.ensureConn(ctx)

	if err != nil {
		return nil, fmt.Errorf("failed to connect to auth service: %w", err)
	}

	client := pb.NewUploadServiceClient(conn)

	response, err := client.ConfirmAvatarUpload(ctx, req)
	return response, err
}

func (c *Client) CheckEmailExists(ctx context.Context, req *pb.CheckEmailRequest) (*pb.CheckEmailResponse, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to auth service: %w", err)
	}

	client := pb.NewAuthServiceClient(conn)
	return client.CheckEmailExists(ctx, req)
}
