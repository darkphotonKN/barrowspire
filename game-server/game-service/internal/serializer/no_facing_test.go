package serializer

import (
	"reflect"
	"strings"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/stretchr/testify/assert"
)

// FS-JS7C8 §E R47: no player entry carries a facing, current_player and
// other_players alike, since both are a PublicPlayerState: every client derives
// a figure's facing from the motion it draws. I-JS7C8-10.
func TestPublicPlayerState_CarriesNoFacing(t *testing.T) {
	entry := reflect.TypeOf(types.PublicPlayerState{})
	for i := 0; i < entry.NumField(); i++ {
		field := entry.Field(i)
		name := strings.Split(field.Tag.Get("json"), ",")[0]
		assert.NotEqual(t, "facing", name, "field %s", field.Name)
		assert.NotEqual(t, "Facing", field.Name)
	}
}
