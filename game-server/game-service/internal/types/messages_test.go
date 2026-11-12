package types

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A client can put anything on the socket. ParsePayload runs inside the session's
// message loop, which has no recover(), so a panic here takes the whole process
// down, and every concurrent world with it.
func TestParsePayload_MalformedPayload_ErrorsWithoutPanicking(t *testing.T) {
	tests := []struct {
		name    string
		action  constants.Action
		payload map[string]interface{}
	}{
		{"move, empty payload", constants.ActionMove, map[string]interface{}{}},
		{"move, no velocity", constants.ActionMove, map[string]interface{}{"vx": 1.0}},
		{"move, velocity as string", constants.ActionMove, map[string]interface{}{"vx": "1", "vy": "2"}},
		{"interact, empty payload", constants.ActionInteract, map[string]interface{}{}},
		{"interact, entity_id as number", constants.ActionInteract, map[string]interface{}{"entity_id": 7.0}},
		{"attack, empty payload", constants.ActionAttack, map[string]interface{}{}},
		{"attack, enemy_entity_id as number", constants.ActionAttack, map[string]interface{}{"enemy_entity_id": 7.0}},
		{"equip, empty payload", constants.ActionEquip, map[string]interface{}{}},
		{"equip, item_entity_id as number", constants.ActionEquip, map[string]interface{}{"item_entity_id": 7.0}},
		{"unequip, empty payload", constants.ActionUnequip, map[string]interface{}{}},
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
// still parses. No payload names its sender: who acts is the connection's
// player, which the message hub hands the world beside the message (FS-29KSH
// §Change: The acting player is the connection's, R38; ADR-0079).
func TestParsePayload_ValidPayload_Parses(t *testing.T) {
	tests := []struct {
		name    string
		action  constants.Action
		payload map[string]interface{}
		assert  func(t *testing.T, parsed interface{})
	}{
		{
			name:    "move",
			action:  constants.ActionMove,
			payload: map[string]interface{}{"vx": 1.5, "vy": -2.5},
			assert: func(t *testing.T, parsed interface{}) {
				p := parsed.(PlayerSessionMovePayload)
				assert.Equal(t, 1.5, p.Vx)
				assert.Equal(t, -2.5, p.Vy)
			},
		},
		{
			name:    "interact",
			action:  constants.ActionInteract,
			payload: map[string]interface{}{"entity_id": "door-1"},
			assert: func(t *testing.T, parsed interface{}) {
				p := parsed.(PlayerSessionInteractPayload)
				assert.Equal(t, "door-1", p.EntityID)
			},
		},
		{
			name:    "attack",
			action:  constants.ActionAttack,
			payload: map[string]interface{}{"enemy_entity_id": "wight-1"},
			assert: func(t *testing.T, parsed interface{}) {
				p := parsed.(PlayerSectionAttackPayload)
				assert.Equal(t, "wight-1", p.EnemyEntityID)
			},
		},
		{
			name:    "equip",
			action:  constants.ActionEquip,
			payload: map[string]interface{}{"item_entity_id": "blade-1"},
			assert: func(t *testing.T, parsed interface{}) {
				p := parsed.(PlayerEquipPayload)
				assert.Equal(t, "blade-1", p.ItemEntityID)
			},
		},
		{
			name:    "unequip",
			action:  constants.ActionUnequip,
			payload: map[string]interface{}{"item_entity_id": "blade-1"},
			assert: func(t *testing.T, parsed interface{}) {
				p := parsed.(PlayerEquipPayload)
				assert.Equal(t, "blade-1", p.ItemEntityID)
			},
		},
		{
			// Skill fields stay optional, as they were before this change.
			name:    "cast_skill with no fields",
			action:  constants.ActionCastSkill,
			payload: map[string]interface{}{},
			assert: func(t *testing.T, parsed interface{}) {
				p := parsed.(PlayerCastSkillPayload)
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

// A payload that still carries session_id (an old client, or a crafted one)
// parses fine and the field is simply ignored. It is not part of the contract.
func TestParsePayload_IgnoresSessionIDIfSent(t *testing.T) {
	m := &Message{
		Action: string(constants.ActionMove),
		Payload: map[string]interface{}{
			"session_id": "not-even-a-uuid",
			"vx":         0.0,
			"vy":         0.0,
		},
	}

	parsed, err := m.ParsePayload()

	require.NoError(t, err)
	assert.IsType(t, PlayerSessionMovePayload{}, parsed)
}

// A payload that still carries player_id (an older client, or one naming
// somebody else) parses exactly as one without it: the field is not read and
// the parsed payload has nowhere to hold it. FS-29KSH §Change: The acting
// player is the connection's, R38.
func TestParsePayload_IgnoresPlayerIDIfSent(t *testing.T) {
	tests := []struct {
		action constants.Action
		fields map[string]interface{}
		want   interface{}
	}{
		{constants.ActionMove, map[string]interface{}{"vx": 1.0, "vy": 0.0}, PlayerSessionMovePayload{Vx: 1.0, Vy: 0.0}},
		{constants.ActionInteract, map[string]interface{}{"entity_id": "door-1"}, PlayerSessionInteractPayload{EntityID: "door-1"}},
		{constants.ActionAttack, map[string]interface{}{"enemy_entity_id": "wight-1"}, PlayerSectionAttackPayload{EnemyEntityID: "wight-1"}},
		{constants.ActionEquip, map[string]interface{}{"item_entity_id": "blade-1"}, PlayerEquipPayload{ItemEntityID: "blade-1"}},
		{constants.ActionUnequip, map[string]interface{}{"item_entity_id": "blade-1"}, PlayerEquipPayload{ItemEntityID: "blade-1"}},
		{constants.ActionCastSkill, map[string]interface{}{"skill_id": "dash"}, PlayerCastSkillPayload{SkillID: "dash"}},
	}

	for _, tt := range tests {
		for _, playerID := range []interface{}{"5f9d1a3e-0000-4000-8000-000000000001", "not-a-uuid", 42.0} {
			payload := map[string]interface{}{"player_id": playerID}
			for key, value := range tt.fields {
				payload[key] = value
			}
			m := &Message{Action: string(tt.action), Payload: payload}

			parsed, err := m.ParsePayload()

			require.NoError(t, err, "%s with player_id %v", tt.action, playerID)
			assert.Equal(t, tt.want, parsed, "%s with player_id %v", tt.action, playerID)
		}
	}
}
