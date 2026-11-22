package grpccharacter

import (
	"context"
	"errors"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/darkphotonKN/barrowspire-server/common/passivetree"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/character"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// The record character-service returns becomes the character in play as is.
func TestToCharacterInPlay_TakesEverythingFromTheRecord(t *testing.T) {
	id := uuid.New()

	character, err := toCharacterInPlay(&pb.Character{
		Id: id.String(), Name: "Wren", Class: "archer", Level: 5, Experience: 640, LevelFloor: 600,
		PassiveRanks: []*pb.PassiveRank{{NodeId: "archer.t2a", Rank: 2}, {NodeId: "archer.r1", Rank: 1}},
	})

	require.NoError(t, err)
	assert.Equal(t, types.CharacterInPlay{ID: id, Name: "Wren", Class: "archer", Level: 5, Experience: 640,
		PassiveRanks: passivetree.Ranks{"archer.t2a": 2, "archer.r1": 1}}, character)
}

func TestToCharacterInPlay_RefusesARecordWithoutAnID(t *testing.T) {
	_, err := toCharacterInPlay(&pb.Character{Id: "not-a-uuid", Class: "mage"})

	assert.Error(t, err)
}

// A character holding no rank is in play with none, never nil (FS-8RZ51 R14).
func TestToCharacterInPlay_NoRanksIsEmpty(t *testing.T) {
	character, err := toCharacterInPlay(&pb.Character{Id: uuid.NewString(), Class: "mage"})

	require.NoError(t, err)
	assert.Equal(t, passivetree.Ranks{}, character.PassiveRanks)
}

// FS-8RZ51 R13, R21, §Change: Tree v2 V19: a refusal carries the rule's code,
// read back as the spend rule's own refusal; a character not the member's is
// not found; anything else is the service failing to answer.
func TestSpendError_ReadsTheRefusal(t *testing.T) {
	for _, rule := range []*passivetree.Refusal{
		passivetree.ErrUnknownNode, passivetree.ErrRankOutOfOrder, passivetree.ErrMaxRank,
		passivetree.ErrSideTaken, passivetree.ErrNotReachable, passivetree.ErrNoPoints,
	} {
		err := spendError(errcode.Refuse(rule.Code))
		assert.ErrorIs(t, err, rule, "%s", rule.Code)
	}

	// either reason not reachable crosses as the one code, read as neither
	notReachable := spendError(errcode.Refuse(errcode.PassiveTierLocked))
	assert.NotErrorIs(t, notReachable, passivetree.ErrNotLinked)
	assert.NotErrorIs(t, notReachable, passivetree.ErrLevelTooLow)
	assert.ErrorIs(t, spendError(errcode.Refuse(passivetree.ErrNotLinked.Code)), passivetree.ErrNotReachable)

	assert.ErrorIs(t, spendError(status.Error(codes.NotFound, "character")), types.ErrCharacterNotFound)

	for name, cause := range map[string]error{
		"unavailable":      status.Error(codes.Unavailable, "connection refused"),
		"deadline":         context.DeadlineExceeded,
		"another refusal":  errcode.Refuse(errcode.Code("NOT_ENOUGH_GOLD")),
		"invalid argument": status.Error(codes.InvalidArgument, "rank"),
	} {
		err := spendError(cause)
		var refused *passivetree.Refusal
		assert.False(t, errors.As(err, &refused), name)
		assert.NotErrorIs(t, err, types.ErrCharacterNotFound, name)
		assert.Error(t, err, name)
	}
}
