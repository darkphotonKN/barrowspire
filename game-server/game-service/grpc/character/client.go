// Package grpccharacter reads characters from character-service, the owner of
// a member's characters and their level and experience (FS-BDA7X).
package grpccharacter

import (
	"context"
	"fmt"
	"sync"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/character"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/connectivity"
	"google.golang.org/grpc/status"
)

// serviceName is character-service's Consul registration.
const serviceName = "character"

// Client reads characters over gRPC. It dials once and reuses the connection.
type Client struct {
	registry discovery.Registry
	mu       sync.Mutex
	conn     *grpc.ClientConn
}

func NewClient(registry discovery.Registry) *Client {
	return &Client{registry: registry}
}

// GetCharacter reads one of the member's characters as the character in play.
// Another member's, a deleted, and an unknown character are all
// types.ErrCharacterNotFound; any other failure means the service could not
// answer.
func (c *Client) GetCharacter(ctx context.Context, memberID, characterID uuid.UUID) (types.CharacterInPlay, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return types.CharacterInPlay{}, fmt.Errorf("connect to character service: %w", err)
	}

	character, err := pb.NewCharacterServiceClient(conn).GetCharacter(ctx, &pb.GetCharacterRequest{
		MemberId:    memberID.String(),
		CharacterId: characterID.String(),
	})
	if err != nil {
		switch status.Code(err) {
		case codes.NotFound, codes.InvalidArgument:
			return types.CharacterInPlay{}, fmt.Errorf("get character %s: %w", characterID, types.ErrCharacterNotFound)
		default:
			return types.CharacterInPlay{}, fmt.Errorf("get character %s: %w", characterID, err)
		}
	}

	return toCharacterInPlay(character)
}

func toCharacterInPlay(character *pb.Character) (types.CharacterInPlay, error) {
	id, err := uuid.Parse(character.GetId())
	if err != nil {
		return types.CharacterInPlay{}, fmt.Errorf("character service returned id %q: %w", character.GetId(), err)
	}

	return types.CharacterInPlay{
		ID:         id,
		Name:       character.GetName(),
		Class:      character.GetClass(),
		Level:      int(character.GetLevel()),
		Experience: character.GetExperience(),
	}, nil
}

// ensureConn dials the service once and caches the connection; gRPC
// multiplexes calls over it.
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
