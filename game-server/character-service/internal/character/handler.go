package character

import (
	"context"
	"errors"
	"fmt"
	"maps"
	"slices"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/character"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/common/progression"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Handler is the gRPC surface. It parses ids, calls the service and maps the
// result; domain errors pass through as sentinels and become gRPC codes in the
// common Status interceptor.
type Handler struct {
	service Service
	pb.UnimplementedCharacterServiceServer
}

type Service interface {
	CreateCharacter(ctx context.Context, in CharacterCreate) (*Character, error)
	ListCharacters(ctx context.Context, memberID uuid.UUID) ([]*Character, error)
	GetCharacter(ctx context.Context, memberID, id uuid.UUID) (*Character, error)
	DeleteCharacter(ctx context.Context, memberID, id uuid.UUID) error
	SpendPassivePoint(ctx context.Context, spend PassiveSpend) (*PassiveSpendResult, error)
}

func NewHandler(service Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) CreateCharacter(ctx context.Context, req *pb.CreateCharacterRequest) (*pb.Character, error) {
	memberID, err := parseID("member_id", req.GetMemberId())
	if err != nil {
		return nil, err
	}
	created, err := h.service.CreateCharacter(ctx, CharacterCreate{
		MemberID: memberID,
		Name:     req.GetName(),
		Class:    req.GetClass(),
	})
	if err != nil {
		return nil, err
	}
	return toProto(created), nil
}

func (h *Handler) ListCharacters(ctx context.Context, req *pb.ListCharactersRequest) (*pb.ListCharactersResponse, error) {
	memberID, err := parseID("member_id", req.GetMemberId())
	if err != nil {
		return nil, err
	}
	characters, err := h.service.ListCharacters(ctx, memberID)
	if err != nil {
		return nil, err
	}
	out := make([]*pb.Character, 0, len(characters))
	for _, c := range characters {
		out = append(out, toProto(c))
	}
	return &pb.ListCharactersResponse{Characters: out}, nil
}

func (h *Handler) GetCharacter(ctx context.Context, req *pb.GetCharacterRequest) (*pb.Character, error) {
	memberID, id, err := parseScoped(req.GetMemberId(), req.GetCharacterId())
	if err != nil {
		return nil, err
	}
	character, err := h.service.GetCharacter(ctx, memberID, id)
	if err != nil {
		return nil, err
	}
	return toProto(character), nil
}

func (h *Handler) DeleteCharacter(ctx context.Context, req *pb.DeleteCharacterRequest) (*emptypb.Empty, error) {
	memberID, id, err := parseScoped(req.GetMemberId(), req.GetCharacterId())
	if err != nil {
		return nil, err
	}
	if err := h.service.DeleteCharacter(ctx, memberID, id); err != nil {
		return nil, err
	}
	return &emptypb.Empty{}, nil
}

func (h *Handler) SpendPassivePoint(ctx context.Context, req *pb.SpendPassivePointRequest) (*pb.SpendPassivePointResponse, error) {
	memberID, id, err := parseScoped(req.GetMemberId(), req.GetCharacterId())
	if err != nil {
		return nil, err
	}
	spent, err := h.service.SpendPassivePoint(ctx, PassiveSpend{
		MemberID:    memberID,
		CharacterID: id,
		NodeID:      req.GetNodeId(),
		Rank:        int(req.GetRank()),
	})
	// a refusal crosses as its code alone: gRPC would put a wrapped chain's
	// whole text on the wire as the message
	var refusal *errcode.Refusal
	if errors.As(err, &refusal) {
		return nil, refusal.GRPCStatus().Err()
	}
	if err != nil {
		return nil, err
	}
	return &pb.SpendPassivePointResponse{Applied: spent.Applied, PassiveRanks: ranksToProto(spent.Ranks)}, nil
}

func parseScoped(memberID, characterID string) (uuid.UUID, uuid.UUID, error) {
	member, err := parseID("member_id", memberID)
	if err != nil {
		return uuid.Nil, uuid.Nil, err
	}
	id, err := parseID("character_id", characterID)
	if err != nil {
		return uuid.Nil, uuid.Nil, err
	}
	return member, id, nil
}

func parseID(field, raw string) (uuid.UUID, error) {
	id, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, fmt.Errorf("parse %s: %w", field, commonconstants.ErrUUIDCouldNotBeParsed)
	}
	return id, nil
}

// toProto fills the level floor and next-level threshold from the shared
// experience table; next_level_at stays unset at the cap, and specialization
// before the pick.
func toProto(c *Character) *pb.Character {
	out := &pb.Character{
		Id:           c.ID.String(),
		Name:         c.Name,
		Class:        c.ClassID,
		Level:        c.Level,
		Experience:   c.Exp,
		LevelFloor:   progression.LevelFloor(c.Level),
		CreatedAt:    timestamppb.New(c.CreatedAt),
		PassiveRanks: ranksToProto(c.PassiveRanks),
	}
	if next, ok := progression.NextLevelAt(c.Level); ok {
		out.NextLevelAt = &next
	}
	if c.Specialization != "" {
		out.Specialization = &c.Specialization
	}
	return out
}

// ranksToProto lists the nodes held at rank 1 or more, by node id, so the
// wire order is stable.
func ranksToProto(ranks passivetree.Ranks) []*pb.PassiveRank {
	out := make([]*pb.PassiveRank, 0, len(ranks))
	for _, node := range slices.Sorted(maps.Keys(ranks)) {
		if rank := ranks[node]; rank > 0 {
			out = append(out, &pb.PassiveRank{NodeId: node, Rank: int32(rank)})
		}
	}
	return out
}
