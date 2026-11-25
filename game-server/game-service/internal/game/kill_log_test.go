package game

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-77AB6 §Requirements 29, FS-4EC7Z §C R11: the kill log's line says
// whether an ally made the kill, credited to its hirer.
func TestKillLog_SaysWhetherAnAllyMadeTheKill(t *testing.T) {
	for _, byAlly := range []bool{true, false} {
		var out bytes.Buffer
		log := NewKillLog(slog.New(slog.NewJSONHandler(&out, nil)))
		log.ConsumeKill(systems.KillRecord{MonsterEntityID: uuid.New(), KillerMemberID: uuid.New(), ByAlly: byAlly})

		var line map[string]any
		require.NoError(t, json.Unmarshal(out.Bytes(), &line))
		assert.Equal(t, byAlly, line["by_ally"])
	}
}
