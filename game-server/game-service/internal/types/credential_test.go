package types

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const secret = "eyJhbGciOiJIUzI1NiJ9.member-secret"

// The player record holds the member's own bearer token, and the record is
// logged in places (a matched roster, a reconnect). The token never reaches a
// log line or a JSON body, however the record is printed.
func TestBearerToken_NeverPrints(t *testing.T) {
	player := &Player{ID: uuid.New(), Username: "Wren", Token: BearerToken(secret)}

	var text, js bytes.Buffer
	slog.New(slog.NewTextHandler(&text, nil)).Info("record", "player", player, "token", player.Token, "players", []*Player{player})
	slog.New(slog.NewJSONHandler(&js, nil)).Info("record", "player", player, "token", player.Token, "players", []*Player{player})

	body, err := json.Marshal(player)
	require.NoError(t, err)

	for name, out := range map[string]string{
		"slog text": text.String(),
		"slog json": js.String(),
		"%v":        fmt.Sprintf("%v", *player),
		"%+v":       fmt.Sprintf("%+v", *player),
		"%s":        player.Token.String(),
		"json":      string(body),
	} {
		assert.NotContains(t, out, secret, name)
	}

	assert.Equal(t, secret, string(player.Token), "the value itself is intact for the one call that sends it")
}
