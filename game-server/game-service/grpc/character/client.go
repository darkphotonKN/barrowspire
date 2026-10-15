// Package grpccharacter reads characters from character-service, the owner of
// a member's characters and their level and experience (FS-BDA7X).
package grpccharacter

import (
	"context"
	"fmt"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/character"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Client reads characters over gRPC. It dials once and reuses the connection.
type Client struct {
	conn *grpc.ClientConn
}

// NewClient dials character-service at addr ("host:port"). The dial is lazy:
// nothing connects until the first RPC, so game-service boots with
// character-service absent.
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

// GetCharacter reads one of the member's characters as the character in play.
// Another member's, a deleted, and an unknown character are all
// types.ErrCharacterNotFound; any other failure means the service could not
// answer.
func (c *Client) GetCharacter(ctx context.Context, memberID, characterID uuid.UUID) (types.CharacterInPlay, error) {
	character, err := pb.NewCharacterServiceClient(c.conn).GetCharacter(ctx, &pb.GetCharacterRequest{
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
