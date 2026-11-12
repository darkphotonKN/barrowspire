package game

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Owner, 2026-11-12: the client must not be able to send anything that moves a
// character faster than its move speed; only skills may send special values,
// and those only the direction or target the skill already takes.
//
// What a client can send that reaches a body (types.Message.ParsePayload, the
// hub's gameActions): move {vx, vy}, and cast_skill {skill_id, target_x,
// target_y}. interact, attack, equip and unequip carry ids only. No action
// carries a position, a speed, a duration or a time the server reads: the
// parse step drops every other field (internal/types/hostile_payload_test.go),
// and JSON cannot carry NaN or ±Inf at all.

// perTickSlack absorbs float drift in a step's length.
const perTickSlack = 1e-9

// tickSeconds is one tick of the world's fixed step.
const tickSeconds = 1.0 / float64(constants.GameFrameRate)

// sends queues what a hostile client sends during one tick, as the session's
// message loop queues it.
type sends func(s *Session, playerID uuid.UUID)

func moveSends(n int, vx, vy func(i int) float64) sends {
	return func(s *Session, playerID uuid.UUID) {
		for i := range n {
			x, y := vx(i), vy(i)
			s.queueIntent(func() { _ = s.handleMove(playerID, x, y) })
		}
	}
}

func always(v float64) func(int) float64 { return func(int) float64 { return v } }

// alternate is +v on even sends and -v on odd ones.
func alternate(v float64) func(int) float64 {
	return func(i int) float64 {
		if i%2 == 0 {
			return v
		}
		return -v
	}
}

func castSends(n int, skillID string, targetX, targetY float64) sends {
	return func(s *Session, playerID uuid.UUID) {
		for range n {
			s.queueIntent(func() { _ = s.handleCastSkill(playerID, skillID, targetX, targetY) })
		}
	}
}

// castOnce sends on the first tick only.
func castOnce(send sends) sends {
	sent := false
	return func(s *Session, playerID uuid.UUID) {
		if !sent {
			sent = true
			send(s, playerID)
		}
	}
}

func both(a, b sends) sends {
	return func(s *Session, playerID uuid.UUID) { a(s, playerID); b(s, playerID) }
}

// loneDelver is a warrior alone in the open, a second's walk or a few charges
// short of every edge, in a bare world of the bounds given.
func loneDelver(t *testing.T, bounds WorldBounds) (*Session, uuid.UUID, *ecs.Entity) {
	t.Helper()
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, bounds)
	playerID, delver := placeDelver(t, s, "warrior", 900, 900)
	return s, playerID, delver
}

func chargeOf(e *ecs.Entity) *components.DashComponent {
	dc, ok := e.GetComponent(ecs.ComponentTypeDash)
	if !ok {
		return nil
	}
	return dc.(*components.DashComponent)
}

// Plain movement, in every world: whatever the client sends, as often as it
// sends it, a body covers no more world distance in a tick than its own
// server-side speed allows, and that speed is the server's (DefaultSpeed, no
// gear worn here).
func TestHostileMove_NeverOutrunsTheBodysSpeed(t *testing.T) {
	inputs := []struct {
		name string
		send sends
	}{
		{"(3, 4)", moveSends(1, always(3), always(4))},
		{"(1e300, 1e300)", moveSends(1, always(1e300), always(1e300))},
		{"(-1e300, 1e300)", moveSends(1, always(-1e300), always(1e300))},
		{"(1.7e308, 1.7e308), whose length overflows", moveSends(1, always(1.7e308), always(1.7e308))},
		{"(1.7e308, 0)", moveSends(1, always(1.7e308), always(0))},
		{"(-0, 1)", moveSends(1, always(math.Copysign(0, -1)), always(1))},
		{"(1, 1) sent 100 times a tick", moveSends(100, always(1), always(1))},
		{"(±1, ±1) alternating, 100 times a tick", moveSends(100, alternate(1), alternate(1))},
		{"(1e300, 0) sent 100 times a tick", moveSends(100, always(1e300), always(0))},
	}
	worlds := map[string]WorldBounds{
		"a run":   RunBounds(),
		"the hub": HubBounds(),
		"a field": FieldBounds(GentleMeadows()),
	}

	for worldName, bounds := range worlds {
		for _, in := range inputs {
			t.Run(worldName+"/"+in.name, func(t *testing.T) {
				s, playerID, delver := loneDelver(t, bounds)
				for n := range constants.GameFrameRate {
					from := *transformOf(t, delver)
					allowed := velocityOf(delver).Speed * tickSeconds
					in.send(s, playerID)
					tick(s) // the queued sends land first, as the loop runs them

					to := *transformOf(t, delver)
					require.False(t, math.IsNaN(to.X) || math.IsNaN(to.Y) || math.IsInf(to.X, 0) || math.IsInf(to.Y, 0), "tick %d: the body stays somewhere", n)
					covered := math.Hypot(to.X-from.X, to.Y-from.Y)
					require.LessOrEqual(t, covered, allowed+perTickSlack, "tick %d: world px covered", n)
					require.Equal(t, constants.DefaultSpeed, velocityOf(delver).Speed, "tick %d: the speed is the server's", n)
				}
			})
		}
	}
}

// Skills: a dash may carry a body faster and further than a walk, but only as
// the server's own row defines it. The client picks the aim and nothing else:
// a hostile aim starts a charge of the same speed and distance as an ordinary
// one, no tick carries the body further than that speed, no charge further
// than that distance, and a dash spammed every tick starts no charge inside
// the last one's cooldown. A skill that moves no body moves it no faster than
// its walk. Run and field only: the hub refuses every cast.
func TestHostileSkill_MovesOnlyAsTheServersSkillAllows(t *testing.T) {
	// the server's dash, as an ordinary aim 100 px east starts it
	reference := func(t *testing.T, bounds WorldBounds) components.DashComponent {
		s, playerID, delver := loneDelver(t, bounds)
		castSends(1, "dash", 1000, 900)(s, playerID)
		tick(s)
		charge := chargeOf(delver)
		require.NotNil(t, charge, "an ordinary dash starts a charge")
		return *charge
	}

	// charges is how many charges the sends must start in the second: one cast
	// starts one, a dash sent every tick starts more than one but never one
	// inside the last's cooldown (asserted on every start), a skill that is no
	// dash none
	// a fresh table per world: castOnce remembers it has sent
	type hostileCast struct {
		name    string
		send    sends
		charges int
		atLeast bool
	}
	inputsFor := func() []hostileCast {
		return []hostileCast{
			{"dash at (1e300, 1e300)", castOnce(castSends(1, "dash", 1e300, 1e300)), 1, false},
			{"dash at (-1.7e308, 1.7e308)", castOnce(castSends(1, "dash", -1.7e308, 1.7e308)), 1, false},
			{"dash at its own feet", castOnce(castSends(1, "dash", 900, 900)), 1, false},
			{"dash at (-0, -0)", castOnce(castSends(1, "dash", math.Copysign(0, -1), math.Copysign(0, -1))), 1, false},
			{"sprint (the dash's alias) at (1e300, 0)", castOnce(castSends(1, "sprint", 1e300, 0)), 1, false},
			{"dash sent 100 times in one tick", castOnce(castSends(100, "dash", 1000, 900)), 1, false},
			{"dash sent 100 times every tick", castSends(100, "dash", 1000, 900), 2, true},
			{"dash 100 times every tick, (1e300, 1e300) held", both(castSends(100, "dash", 1000, 900), moveSends(1, always(1e300), always(1e300))), 2, true},
			{"slash at (1e300, 1e300), (1, 1) held", both(castSends(100, "slash", 1e300, 1e300), moveSends(1, always(1), always(1))), 0, false},
			{"fireball at (1e300, 1e300), (1, 1) held", both(castSends(100, "fireball", 1e300, 1e300), moveSends(1, always(1), always(1))), 0, false},
			{"parry 100 times a tick, (3, 4) held", both(castSends(100, "parry", 0, 0), moveSends(1, always(3), always(4))), 0, false},
		}
	}
	worlds := map[string]WorldBounds{
		"a run":   RunBounds(),
		"a field": FieldBounds(GentleMeadows()),
	}

	for worldName, bounds := range worlds {
		def := reference(t, bounds)
		for _, in := range inputsFor() {
			t.Run(worldName+"/"+in.name, func(t *testing.T) {
				s, playerID, delver := loneDelver(t, bounds)
				var flying *components.DashComponent
				var flown float64
				lastStart, cooldown := math.Inf(-1), 0.0
				started := 0

				for n := range constants.GameFrameRate {
					from := *transformOf(t, delver)
					// movement runs before combat: what is in flight now is what carries the body this tick
					allowed := velocityOf(delver).Speed * tickSeconds
					if charge := chargeOf(delver); charge != nil {
						allowed = charge.Speed * tickSeconds
					}
					in.send(s, playerID)
					tick(s) // the queued sends land first, as the loop runs them

					to := *transformOf(t, delver)
					covered := math.Hypot(to.X-from.X, to.Y-from.Y)
					require.False(t, math.IsNaN(covered) || math.IsInf(covered, 0), "tick %d: the body stays somewhere", n)
					require.LessOrEqual(t, covered, allowed+perTickSlack, "tick %d: world px covered", n)
					require.LessOrEqual(t, allowed, def.Speed*tickSeconds+perTickSlack, "tick %d: no faster than the server's dash", n)

					if flying != nil {
						flown += covered
						require.LessOrEqual(t, flown, def.Remaining+perTickSlack, "tick %d: a charge runs no further than the dash's distance", n)
					}
					charge := chargeOf(delver)
					if charge != nil && charge != flying {
						now := float64(n) * tickSeconds
						require.GreaterOrEqual(t, now-lastStart, cooldown-perTickSlack, "tick %d: a charge starts inside the last one's cooldown", n)
						assert.Equal(t, def.Speed, charge.Speed, "tick %d: the charge's speed is the server's", n)
						assert.Equal(t, def.Remaining, charge.Remaining, "tick %d: the charge's distance is the server's", n)
						cc, ok := delver.GetComponent(ecs.ComponentTypeCooldown)
						require.True(t, ok)
						cooldown = cc.(*components.CooldownComponent).Remaining[components.AttackDash]
						require.Positive(t, cooldown, "a dash starts its cooldown")
						flying, flown, lastStart = charge, 0, now
						started++
					}
					if charge == nil {
						flying = nil
					}
				}
				if in.atLeast {
					assert.GreaterOrEqual(t, started, in.charges, "charges started")
				} else {
					assert.Equal(t, in.charges, started, "charges started")
				}
			})
		}
	}
}
