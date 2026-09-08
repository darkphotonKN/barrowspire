package types

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A client can put anything on the socket. ParsePayload runs inside the session's
// message loop, which has no recover(), so a panic here takes the whole process
// down — every concurrent world with it.
func TestParsePayload_MalformedPayload_ErrorsWithoutPanicking(t *testing.T) {
	tests := []struct {
		name    string
		action  constants.Action
		payload map[string]interface{}
	}{
		{"move, empty payload", constants.ActionMove, map[string]interface{}{}},
		{"move, no player_id", constants.ActionMove, map[string]interface{}{"vx": 1.0, "vy": 2.0}},
		{"move, no velocity", constants.ActionMove, map[string]interface{}{"player_id": "p1"}},
		{"move, velocity as string", constants.ActionMove, map[string]interface{}{
			"player_id": "p1", "vx": "1", "vy": "2",
		}},
		{"interact, empty payload", constants.ActionInteract, map[string]interface{}{}},
		{"interact, no entity_id", constants.ActionInteract, map[string]interface{}{"player_id": "p1"}},
		{"attack, empty payload", constants.ActionAttack, map[string]interface{}{}},
		{"attack, no enemy_entity_id", constants.ActionAttack, map[string]interface{}{"player_id": "p1"}},
		{"equip, empty payload", constants.ActionEquip, map[string]interface{}{}},
		{"equip, no item_entity_id", constants.ActionEquip, map[string]interface{}{"player_id": "p1"}},
		{"unequip, empty payload", constants.ActionUnequip, map[string]interface{}{}},
		{"cast_skill, empty payload", constants.ActionCastSkill, map[string]interface{}{}},
		{"cast_skill, no player_id", constants.ActionCastSkill, map[string]interface{}{"skill_id": "s1"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := &Message{Action: string(tt.action), Payload: tt.payload}

			assert.NotPanics(t, func() {
				_, err := m.ParsePayload()
				assert.Error(t, err, "malformed payload must be rejected, not accepted")
			})
		})
	}
}

// The hardening must not over-reject: every action a client legitimately sends
// still parses, and carries the sender through.
func TestParsePayload_ValidPayload_Parses(t *testing.T) {
	const playerID = "5f9d1a3e-0000-4000-8000-000000000001"

	tests := []struct {
		name    string
		action  constants.Action
		payload map[string]interface{}
		assert  func(t *testing.T, parsed interface{})
	}{
		{
			name:    "move",
			action:  constants.ActionMove,
			payload: map[string]interface{}{"player_id": playerID, "vx": 1.5, "vy": -2.5},
			assert: func(t *testing.T, parsed interface{}) {
				p := parsed.(PlayerSessionMovePayload)
				assert.Equal(t, playerID, p.PlayerID)
				assert.Equal(t, 1.5, p.Vx)
				assert.Equal(t, -2.5, p.Vy)
			},
		},
		{
			name:    "interact",
			action:  constants.ActionInteract,
			payload: map[string]interface{}{"player_id": playerID, "entity_id": "door-1"},
			assert: func(t *testing.T, parsed interface{}) {
				p := parsed.(PlayerSessionInteractPayload)
				assert.Equal(t, playerID, p.PlayerID)
				assert.Equal(t, "door-1", p.EntityID)
			},
		},
		{
			name:    "attack",
			action:  constants.ActionAttack,
			payload: map[string]interface{}{"player_id": playerID, "enemy_entity_id": "wight-1"},
			assert: func(t *testing.T, parsed interface{}) {
				p := parsed.(PlayerSectionAttackPayload)
				assert.Equal(t, "wight-1", p.EnemyEntityID)
			},
		},
		{
			name:    "equip",
			action:  constants.ActionEquip,
			payload: map[string]interface{}{"player_id": playerID, "item_entity_id": "blade-1"},
			assert: func(t *testing.T, parsed interface{}) {
				p := parsed.(PlayerEquipPayload)
				assert.Equal(t, "blade-1", p.ItemEntityID)
			},
		},
		{
			name:    "unequip",
			action:  constants.ActionUnequip,
			payload: map[string]interface{}{"player_id": playerID, "item_entity_id": "blade-1"},
			assert: func(t *testing.T, parsed interface{}) {
				p := parsed.(PlayerEquipPayload)
				assert.Equal(t, "blade-1", p.ItemEntityID)
			},
		},
		{
			// Skill fields stay optional, as they were before this change.
			name:    "cast_skill with only a player",
			action:  constants.ActionCastSkill,
			payload: map[string]interface{}{"player_id": playerID},
			assert: func(t *testing.T, parsed interface{}) {
				p := parsed.(PlayerCastSkillPayload)
				assert.Equal(t, playerID, p.PlayerID)
				assert.Empty(t, p.SkillID)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := &Message{Action: string(tt.action), Payload: tt.payload}

			parsed, err := m.ParsePayload()

			require.NoError(t, err)
			tt.assert(t, parsed)
		})
	}
}

// A payload that still carries session_id — an old client, or a crafted one —
// parses fine and the field is simply ignored. It is not part of the contract.
func TestParsePayload_IgnoresSessionIDIfSent(t *testing.T) {
	m := &Message{
		Action: string(constants.ActionMove),
		Payload: map[string]interface{}{
			"player_id":  "5f9d1a3e-0000-4000-8000-000000000001",
			"session_id": "not-even-a-uuid",
			"vx":         0.0,
			"vy":         0.0,
		},
	}

	parsed, err := m.ParsePayload()

	require.NoError(t, err)
	assert.IsType(t, PlayerSessionMovePayload{}, parsed)
}
