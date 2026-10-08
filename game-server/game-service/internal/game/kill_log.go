package game

import (
	"log/slog"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
)

// KillLog is the v1 kill consumer: one structured log line per kill record.
// FS-77AB6 §Requirements 29.
type KillLog struct {
	logger *slog.Logger
}

func NewKillLog(logger *slog.Logger) *KillLog {
	return &KillLog{logger: logger}
}

func (k *KillLog) ConsumeKill(record systems.KillRecord) {
	k.logger.Info("monster killed",
		"monster_entity_id", record.MonsterEntityID,
		"archetype", record.Archetype,
		"level", record.Level,
		"elite", record.Elite,
		"boss", record.Boss,
		"killer_member_id", record.KillerMemberID,
		"x", record.X,
		"y", record.Y,
		"floor", record.Floor,
	)
}
