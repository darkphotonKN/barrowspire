package grpc

import (
	"context"
	"fmt"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/wallet"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

const (
	serviceName = "wallet"
)

type Client struct {
	registry discovery.Registry
}

func NewClient(registry discovery.Registry) *Client {
	return &Client{
		registry: registry,
	}
}

// PlaceHold reserves the caller's gold against bidID. wallet resolves whose
// account to hold from the token, not from memberID, so the caller's
// authorization header is forwarded as-is.
func (c *Client) PlaceHold(ctx context.Context, memberID, bidID uuid.UUID, gold int) error {
	outCtx, err := forwardAuthorization(ctx)
	if err != nil {
		return fmt.Errorf("wallet place hold for bid %v: %w", bidID, err)
	}

	conn, err := discovery.ServiceConnection(outCtx, serviceName, c.registry)
	if err != nil {
		return fmt.Errorf("wallet place hold for bid %v: connect: %w: %w", bidID, commonconstants.ErrTransient, err)
	}
	defer conn.Close()

	_, err = pb.NewWalletServiceClient(conn).PlaceHold(outCtx, &pb.PlaceHoldRequest{
		BidId: bidID.String(),
		Gold:  int64(gold),
	})
	if err != nil {
		switch status.Code(err) {
		case codes.FailedPrecondition:
			return fmt.Errorf("wallet place hold for bid %v: %w: %w", bidID, commonconstants.ErrInsufficientGold, err)
		case codes.Unavailable, codes.DeadlineExceeded:
			return fmt.Errorf("wallet place hold for bid %v: %w: %w", bidID, commonconstants.ErrTransient, err)
		default:
			return fmt.Errorf("wallet place hold for bid %v: %w", bidID, err)
		}
	}

	return nil
}

// forwardAuthorization copies the inbound request's authorization header onto
// the outgoing context. Only works while a caller's request is in flight: a
// call with no inbound request behind it (a worker, a consumer) has no token
// to forward.
func forwardAuthorization(ctx context.Context) (context.Context, error) {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing metadata")
	}

	vals := md.Get("authorization")
	if len(vals) == 0 {
		return nil, status.Error(codes.Unauthenticated, "missing authorization")
	}

	return metadata.AppendToOutgoingContext(ctx, "authorization", vals[0]), nil
}
