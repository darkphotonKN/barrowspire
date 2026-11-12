package types

import (
	"encoding/json"
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Owner, 2026-11-12: the client must not be able to send anything that moves a
// character faster than its move speed. A frame is decoded by json.Unmarshal
// into a Message (gameserver/handler.go) and a refused frame never reaches the
// hub, so a number JSON cannot carry never reaches a handler: NaN, ±Inf, and a
// literal past float64's range.
func TestHostileFrame_NumbersJSONCannotCarryNeverDecode(t *testing.T) {
	frames := map[string]string{
		"move, vx NaN":               `{"action":"move","payload":{"player_id":"p","vx":NaN,"vy":0}}`,
		"move, vx Infinity":          `{"action":"move","payload":{"player_id":"p","vx":Infinity,"vy":0}}`,
		"move, vy -Infinity":         `{"action":"move","payload":{"player_id":"p","vx":0,"vy":-Infinity}}`,
		"move, vx 1e400":             `{"action":"move","payload":{"player_id":"p","vx":1e400,"vy":0}}`,
		"move, vy -1e400":            `{"action":"move","payload":{"player_id":"p","vx":0,"vy":-1e400}}`,
		"move, vx \"NaN\" as text":   `{"action":"move","payload":{"player_id":"p","vx":"NaN","vy":0}}`,
		"cast_skill, target_x NaN":   `{"action":"cast_skill","payload":{"player_id":"p","skill_id":"dash","target_x":NaN,"target_y":0}}`,
		"cast_skill, target_y 1e400": `{"action":"cast_skill","payload":{"player_id":"p","skill_id":"dash","target_x":0,"target_y":1e400}}`,
	}
	for name, frame := range frames {
		t.Run(name, func(t *testing.T) {
			var msg Message
			err := json.Unmarshal([]byte(frame), &msg)
			if err == nil {
				// text decodes, but the parse step refuses it as a number
				_, err = msg.ParsePayload()
			}
			assert.Error(t, err)
		})
	}

	t.Run("1e300 and -0 decode, so the handlers meet them", func(t *testing.T) {
		var msg Message
		require.NoError(t, json.Unmarshal([]byte(`{"action":"move","payload":{"player_id":"p","vx":1e300,"vy":-0}}`), &msg))
		parsed, err := msg.ParsePayload()
		require.NoError(t, err)
		move := parsed.(PlayerSessionMovePayload)
		assert.Equal(t, 1e300, move.Vx)
		assert.True(t, math.Signbit(move.Vy), "-0 arrives as -0")
	})
}

// No action carries a position, a speed, a distance, a duration or a time the
// server reads: whatever else a client puts in a move or a cast_skill is
// dropped at the parse step, and what is left is the direction (move) or the
// skill and its aim (cast_skill).
func TestHostileFrame_OnlyTheDirectionOrTheAimSurvivesTheParse(t *testing.T) {
	extras := `"speed":1e6,"move_speed":1e6,"direction":{"vx":1,"vy":1,"speed":1e6},"x":5000,"y":5000,` +
		`"position":{"x":5000,"y":5000},"distance":1e6,"duration":1e6,"dt":1e6,"delta_time":1e6,"timestamp":1e18,"cooldown":0`

	var move Message
	require.NoError(t, json.Unmarshal([]byte(`{"action":"move","payload":{"player_id":"p","vx":1,"vy":0,`+extras+`}}`), &move))
	parsed, err := move.ParsePayload()
	require.NoError(t, err)
	assert.Equal(t, PlayerSessionMovePayload{PlayerSessionPayload: PlayerSessionPayload{PlayerID: "p"}, Vx: 1, Vy: 0}, parsed)

	var cast Message
	require.NoError(t, json.Unmarshal([]byte(`{"action":"cast_skill","payload":{"player_id":"p","skill_id":"dash","target_x":10,"target_y":20,`+extras+`}}`), &cast))
	parsed, err = cast.ParsePayload()
	require.NoError(t, err)
	assert.Equal(t, PlayerCastSkillPayload{PlayerSessionPayload: PlayerSessionPayload{PlayerID: "p"}, SkillID: "dash", TargetX: 10, TargetY: 20}, parsed)
}
