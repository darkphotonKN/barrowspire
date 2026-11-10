// Package character asks character-service, the owner of a member's characters,
// whether a character is a member's (FS-50MTX R10).
package character

import (
	"context"
	"fmt"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/character"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// ownershipCheckTimeout bounds one ownership call, so a character-service that
// accepts the connection and stalls still ends in a refusal (FS-50MTX R11).
const ownershipCheckTimeout = 3 * time.Second

// Client calls character-service over one long-lived connection.
type Client struct {
	conn *grpc.ClientConn
}

// NewClient dials character-service at addr ("host:port"). The dial is lazy:
// nothing connects until the first RPC, so this service boots with
// character-service absent and a call made while it is down fails with
// codes.Unavailable.
func NewClient(addr string) (*Client, error) {
	conn, err := discovery.Dial(addr)
	if err != nil {
		return nil, fmt.Errorf("dial character service at %s: %w", addr, err)
	}
	return &Client{conn: conn}, nil
}

// Close releases the connection.
func (c *Client) Close() error {
	return c.conn.Close()
}

// OwnsCharacter reports whether characterID is one of memberID's live
// characters. Another member's, a deleted and an unknown character all answer
// false; any other failure is an error, meaning character-service could not
// say, and that includes no answer within ownershipCheckTimeout.
// character-service runs no auth interceptor, so no token is forwarded.
func (c *Client) OwnsCharacter(ctx context.Context, memberID, characterID uuid.UUID) (bool, error) {
	ctx, cancel := context.WithTimeout(ctx, ownershipCheckTimeout)
	defer cancel()

	_, err := pb.NewCharacterServiceClient(c.conn).GetCharacter(ctx, &pb.GetCharacterRequest{
		MemberId:    memberID.String(),
		CharacterId: characterID.String(),
	})
	switch status.Code(err) {
	case codes.OK:
		return true, nil
	case codes.NotFound, codes.InvalidArgument:
		return false, nil
	default:
		return false, fmt.Errorf("get character %s: %w", characterID, err)
	}
}
