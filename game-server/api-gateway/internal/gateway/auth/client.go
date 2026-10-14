package auth

import (
	"context"
	"fmt"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/auth"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"google.golang.org/grpc"
)

// Client calls auth-service over one long-lived connection.
type Client struct {
	conn *grpc.ClientConn
}

// NewClient dials auth-service at addr ("host:port"). The dial is lazy: nothing
// connects until the first RPC, so this service boots with auth-service absent
// and a call made while it is down fails with codes.Unavailable.
func NewClient(addr string) (*Client, error) {
	conn, err := discovery.Dial(addr)
	if err != nil {
		return nil, fmt.Errorf("dial auth service at %s: %w", addr, err)
	}
	return &Client{conn: conn}, nil
}

// Close releases the connection.
func (c *Client) Close() error {
	return c.conn.Close()
}

func (c *Client) CreateMember(ctx context.Context, req *pb.CreateMemberRequest) (*pb.Member, error) {
	client := pb.NewAuthServiceClient(c.conn)

	member, err := client.CreateMember(ctx, req)
	return member, err
}

func (c *Client) GetMember(ctx context.Context, req *pb.GetMemberRequest) (*pb.Member, error) {
	client := pb.NewAuthServiceClient(c.conn)

	member, err := client.GetMember(ctx, req)
	return member, err
}

func (c *Client) LoginMember(ctx context.Context, req *pb.LoginRequest) (*pb.LoginResponse, error) {
	client := pb.NewAuthServiceClient(c.conn)

	response, err := client.LoginMember(ctx, req)
	return response, err
}

func (c *Client) UpdateMemberInfo(ctx context.Context, req *pb.UpdateMemberInfoRequest) (*pb.Member, error) {
	client := pb.NewAuthServiceClient(c.conn)

	member, err := client.UpdateMemberInfo(ctx, req)
	return member, err
}

func (c *Client) UpdateMemberPassword(ctx context.Context, req *pb.UpdatePasswordRequest) (*pb.UpdatePasswordResponse, error) {
	client := pb.NewAuthServiceClient(c.conn)

	response, err := client.UpdateMemberPassword(ctx, req)
	return response, err
}

func (c *Client) ValidateToken(ctx context.Context, req *pb.ValidateTokenRequest) (*pb.ValidateTokenResponse, error) {
	client := pb.NewAuthServiceClient(c.conn)

	response, err := client.ValidateToken(ctx, req)
	return response, err
}

func (c *Client) RequestAvatarUpload(ctx context.Context, req *pb.RequestAvatarUploadRequest) (*pb.RequestAvatarUploadResponse, error) {
	client := pb.NewUploadServiceClient(c.conn)

	response, err := client.RequestAvatarUpload(ctx, req)
	return response, err
}

func (c *Client) ConfirmAvatarUpload(ctx context.Context, req *pb.ConfirmAvatarUploadRequest) (*pb.ConfirmAvatarUploadResponse, error) {
	client := pb.NewUploadServiceClient(c.conn)

	response, err := client.ConfirmAvatarUpload(ctx, req)
	return response, err
}
