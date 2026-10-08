package grpccharacter

import (
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/character"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The record character-service returns becomes the character in play as is.
func TestToCharacterInPlay_TakesEverythingFromTheRecord(t *testing.T) {
	id := uuid.New()

	character, err := toCharacterInPlay(&pb.Character{
		Id: id.String(), Name: "Wren", Class: "archer", Level: 5, Experience: 640, LevelFloor: 600,
	})

	require.NoError(t, err)
	assert.Equal(t, types.CharacterInPlay{ID: id, Name: "Wren", Class: "archer", Level: 5, Experience: 640}, character)
}

func TestToCharacterInPlay_RefusesARecordWithoutAnID(t *testing.T) {
	_, err := toCharacterInPlay(&pb.Character{Id: "not-a-uuid", Class: "mage"})

	assert.Error(t, err)
}
