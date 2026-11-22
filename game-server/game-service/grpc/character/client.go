// Package grpccharacter reads characters from character-service, the owner of
// a member's characters, their level and experience (FS-BDA7X) and their
// passive tree ranks (FS-8RZ51), and spends a passive point there.
package grpccharacter

import (
	"context"
	"fmt"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/character"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Client reads characters, and spends their passive points, over gRPC. It dials once and reuses the connection.
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
		ID:           id,
		Name:         character.GetName(),
		Class:        character.GetClass(),
		Level:        int(character.GetLevel()),
		Experience:   character.GetExperience(),
		PassiveRanks: ranksOf(character.GetPassiveRanks()),
	}, nil
}

// ranksOf is the held ranks the service sent, by node id; never nil.
func ranksOf(held []*pb.PassiveRank) passivetree.Ranks {
	ranks := make(passivetree.Ranks, len(held))
	for _, r := range held {
		ranks[r.GetNodeId()] = int(r.GetRank())
	}
	return ranks
}

/**
* SpendPassivePoint takes the character to rank of nodeID (FS-8RZ51 R12–R13)
* and answers every rank it holds after: on a new rank and on one already held
* alike (R10). A refusal is the spend rule's own (*passivetree.Refusal, match
* with errors.Is); another member's, a deleted and an unknown character are
* types.ErrCharacterNotFound; anything else means the service could not answer.
**/
func (c *Client) SpendPassivePoint(ctx context.Context, memberID, characterID uuid.UUID, nodeID string, rank int) (passivetree.Ranks, error) {
	res, err := pb.NewCharacterServiceClient(c.conn).SpendPassivePoint(ctx, &pb.SpendPassivePointRequest{
		MemberId:    memberID.String(),
		CharacterId: characterID.String(),
		NodeId:      nodeID,
		Rank:        int32(rank),
	})
	if err != nil {
		return nil, fmt.Errorf("spend %s rank %d for character %s: %w", nodeID, rank, characterID, spendError(err))
	}
	return ranksOf(res.GetPassiveRanks()), nil
}

// spendRefusals is the spend rule's refusals by the code they cross gRPC with
// (FS-8RZ51 §Change: Tree v2 V19). PASSIVE_TIER_LOCKED reads as not reachable
// yet, which of its two reasons the code does not say.
var spendRefusals = func() map[errcode.Code]*passivetree.Refusal {
	byCode := map[errcode.Code]*passivetree.Refusal{}
	for _, rule := range []*passivetree.Refusal{
		passivetree.ErrUnknownNode, passivetree.ErrRankOutOfOrder, passivetree.ErrMaxRank,
		passivetree.ErrSideTaken, passivetree.ErrNotReachable, passivetree.ErrNoPoints,
	} {
		byCode[rule.Code] = rule
	}
	return byCode
}()

// spendError reads what a failed spend means: the rule's refusal by its
// ErrorInfo code, not found, or the service failing to answer.
func spendError(err error) error {
	st, ok := status.FromError(err)
	if !ok {
		return err
	}
	if code, refused := errcode.RefusalReason(st); refused {
		if rule, known := spendRefusals[code]; known {
			return rule
		}
	}
	if st.Code() == codes.NotFound {
		return types.ErrCharacterNotFound
	}
	return err
}
