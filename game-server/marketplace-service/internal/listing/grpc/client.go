package grpc

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/wallet"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"github.com/google/uuid"
	grpclib "google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Client calls wallet-service over one long-lived connection.
type Client struct {
	conn *grpclib.ClientConn
}

// NewClient dials wallet-service at addr ("host:port"). The dial is lazy:
// nothing connects until the first RPC, so marketplace boots with wallet absent
// and a call made while it is down fails with codes.Unavailable, which every
// method below already classifies as ErrTransient.
func NewClient(addr string) (*Client, error) {
	conn, err := discovery.Dial(addr)
	if err != nil {
		return nil, fmt.Errorf("dial wallet service at %s: %w", addr, err)
	}
	return &Client{conn: conn}, nil
}

// Close releases the connection.
func (c *Client) Close() error {
	return c.conn.Close()
}

// PlaceHold reserves the caller's gold against bidID. wallet resolves whose
// account to hold from the token, not from memberID, so the caller's
// authorization header is forwarded as-is.
func (c *Client) PlaceHold(ctx context.Context, memberID, bidID uuid.UUID, gold int, expiresAt time.Time) error {
	outCtx, err := forwardAuthorization(ctx)
	if err != nil {
		return fmt.Errorf("wallet place hold for bid %v: %w", bidID, err)
	}

	_, err = pb.NewWalletServiceClient(c.conn).PlaceHold(outCtx, &pb.PlaceHoldRequest{
		BidId:     bidID.String(),
		Gold:      int64(gold),
		ExpiresAt: timestamppb.New(expiresAt),
	})
	if err != nil {
		switch status.Code(err) {
		case codes.FailedPrecondition:
			return fmt.Errorf("wallet place hold for bid %v: %w: %w", bidID, commonconstants.ErrInsufficientGold, err)
		// the bid ID already has a hold that is not a live replay of this one
		// (released, committed, or another amount): nothing backs this bid
		case codes.AlreadyExists:
			return fmt.Errorf("wallet place hold for bid %v: %w: %w", bidID, commonconstants.ErrDuplicateResource, err)
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

// ReleaseHold gives back the gold reserved for a bid that was never recorded.
//
// No authorization forwarding, unlike PlaceHold. This is marketplace compensating
// for its own failed write, not a member acting on their account — and by the time
// it runs the caller's request may already be unwinding, so depending on a token
// still being in context would make cleanup fail exactly when it is needed.
func (c *Client) ReleaseHold(ctx context.Context, bidID uuid.UUID) error {
	if _, err := pb.NewWalletServiceClient(c.conn).ReleaseHold(ctx, &pb.ReleaseHoldRequest{
		BidId: bidID.String(),
	}); err != nil {
		switch status.Code(err) {
		case codes.Unavailable, codes.DeadlineExceeded:
			return fmt.Errorf("wallet release hold for bid %v: %w: %w", bidID, commonconstants.ErrTransient, err)
		default:
			return fmt.Errorf("wallet release hold for bid %v: %w", bidID, err)
		}
	}

	return nil
}

// ListStaleReservedHolds asks wallet which reservations have outlived the write that
// should have followed them. wallet reports; this service decides which were never
// claimed, because only it can tell.
func (c *Client) ListStaleReservedHolds(ctx context.Context, createdBefore time.Time) ([]uuid.UUID, error) {
	res, err := pb.NewWalletServiceClient(c.conn).ListStaleReservedHolds(ctx, &pb.ListStaleReservedHoldsRequest{
		ReservedBefore: timestamppb.New(createdBefore),
	})
	if err != nil {
		switch status.Code(err) {
		case codes.Unavailable, codes.DeadlineExceeded:
			return nil, fmt.Errorf("wallet list stale reserved holds: %w: %w", commonconstants.ErrTransient, err)
		default:
			return nil, fmt.Errorf("wallet list stale reserved holds: %w", err)
		}
	}

	bidIDs := make([]uuid.UUID, 0, len(res.BidIds))
	for _, raw := range res.BidIds {
		bidID, err := uuid.Parse(raw)
		if err != nil {
			// one unparseable id must not sink the batch; it would also be an id this
			// service never minted, so there is nothing here to reconcile
			slog.ErrorContext(ctx, "wallet returned an unparseable bid id", "bid_id", raw, "err", err)
			continue
		}
		bidIDs = append(bidIDs, bidID)
	}

	return bidIDs, nil
}
