package game

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-7P736 §A R1–R12, Acceptance Criteria (game-service), Edge States.
// I-7P736-1.

// rollTicks is the ticks a whole roll takes at the game's rate: 12.
var rollTicks = int(math.Round(constants.RollDuration * float64(constants.GameFrameRate)))

// rollOnTick queues the delver's roll as the message loop does and runs the
// tick that applies it.
func rollOnTick(s *Session, playerID uuid.UUID, dirX, dirY float64) {
	s.queueIntent(func() { s.roll(playerID, dirX, dirY) })
	tick(s)
}

// rollRun is a run with one seated warrior at (500, 500) and nothing in the
// way.
func rollRun(t *testing.T, class string) (*Session, uuid.UUID, *ecs.Entity) {
	t.Helper()
	s := coopRun(t)
	playerID, delver := seatedDelver(t, s, class, 500, 500)
	return s, playerID, delver
}

// A roll in a run carries the delver 200 px along the normalised heading over
// 12 ticks, whatever their walk: walking input held through it is ignored and
// applies again on the tick after it ends. FS-7P736 §A R1–R3, R8; AC 1, 7.
func TestRun_Roll_CarriesTheDelver200pxOver12Ticks(t *testing.T) {
	s, playerID, delver := rollRun(t, "warrior")
	require.NoError(t, s.handleMove(playerID, 0, 1))

	rollOnTick(s, playerID, 2, 0)
	ticks(s, rollTicks-1)

	at := transformOf(t, delver)
	assert.InDelta(t, 700.0, at.X, 1e-6, "200 px along the heading")
	assert.Equal(t, 500.0, at.Y, "the held walk never steers it")

	tick(s)
	assert.False(t, systems.Rolling(delver), "over after 12 ticks")
	assert.Greater(t, transformOf(t, delver).Y, 500.0, "the held walk applies again")
}

// Refused with nothing changed: in the hub or a field, out of play, inside
// the cooldown, during a dash, a zero heading. A refusal is never answered.
// FS-7P736 §A R1, R6; AC 6.
func TestRoll_Refusals_ChangeNothingAndAnswerNothing(t *testing.T) {
	worlds := map[string]WorldBounds{"hub": HubBounds(), "field": FieldBounds(GentleMeadows())}
	for name, bounds := range worlds {
		t.Run("in the "+name, func(t *testing.T) {
			s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, bounds)
			sender := &recordingSender{}
			s.sender = sender
			playerID, delver := placeDelver(t, s, "warrior", 500, 500)

			rollOnTick(s, playerID, 1, 0)

			assert.False(t, systems.Rolling(delver))
			_, waiting := systems.RollCooldown(delver)
			assert.False(t, waiting, "no cooldown")
			assert.Equal(t, 500.0, transformOf(t, delver).X)
			assert.Empty(t, sender.to(playerID), "nothing sent back")
		})
	}

	refusals := map[string]func(t *testing.T, s *Session, playerID uuid.UUID, delver *ecs.Entity){
		"out of play": func(t *testing.T, _ *Session, _ uuid.UUID, delver *ecs.Entity) { kill(t, delver) },
		"inside the cooldown": func(_ *testing.T, s *Session, playerID uuid.UUID, _ *ecs.Entity) {
			rollOnTick(s, playerID, 0, 1)
			ticks(s, rollTicks+5)
		},
		"during a dash": func(t *testing.T, s *Session, playerID uuid.UUID, delver *ecs.Entity) {
			require.NoError(t, s.handleCastSkill(playerID, "dash", 500, 900))
			tick(s)
			require.True(t, delver.HasComponent(ecs.ComponentTypeDash))
		},
	}
	for name, setup := range refusals {
		t.Run(name, func(t *testing.T) {
			s, playerID, delver := rollRun(t, "warrior")
			sender := &recordingSender{}
			s.sender = sender
			setup(t, s, playerID, delver)
			before := *transformOf(t, delver)
			cooldownBefore, _ := systems.RollCooldown(delver)
			var remainingBefore float64
			if cooldownBefore != nil {
				remainingBefore = cooldownBefore.Remaining
			}

			s.queueIntent(func() { s.roll(playerID, 1, 0) })
			s.applyIntents()

			assert.False(t, systems.Rolling(delver), "no roll")
			cooldownAfter, _ := systems.RollCooldown(delver)
			if cooldownBefore == nil {
				assert.Nil(t, cooldownAfter, "no cooldown started")
			} else {
				assert.Equal(t, remainingBefore, cooldownAfter.Remaining, "the cooldown runs on, not restarted")
			}
			assert.Equal(t, before, *transformOf(t, delver))
			assert.Empty(t, sender.to(playerID), "nothing sent back")
		})
	}

	t.Run("a zero heading", func(t *testing.T) {
		s, playerID, delver := rollRun(t, "warrior")
		rollOnTick(s, playerID, 0, 0)
		assert.False(t, systems.Rolling(delver))
		_, waiting := systems.RollCooldown(delver)
		assert.False(t, waiting)
	})
}

// The 3 s cooldown: a roll inside it is refused, the first after it rolls.
// It costs no class resource. FS-7P736 §A R1, R7; AC 6.
func TestRun_Roll_ThreeSecondCooldownAndFree(t *testing.T) {
	s, playerID, delver := rollRun(t, "warrior")
	stamina := currentResource(delver)

	rollOnTick(s, playerID, 1, 0)
	assert.Equal(t, stamina, currentResource(delver), "free")

	cooldownTicks := int(math.Round(constants.RollCooldown * float64(constants.GameFrameRate)))
	ticks(s, cooldownTicks-2)
	rollOnTick(s, playerID, -1, 0)
	assert.False(t, systems.Rolling(delver), "refused a tick short of 3 s")

	rollOnTick(s, playerID, -1, 0)
	assert.True(t, systems.Rolling(delver), "rolls at 3 s")
}

// An attack, an ability, a page cast and an interact sent while rolling are
// dropped as they arrive, never kept for after; sent once the roll is over
// they act. FS-7P736 §A R8; AC 7.
func TestRun_Roll_ActionsWhileRollingAreDropped(t *testing.T) {
	// each acts toward (700, 500), where the roll from (500, 500) ends
	tests := []struct {
		name  string
		class string
		setup func(s *Session) (act func(playerID uuid.UUID), acted func(delver *ecs.Entity) bool)
	}{
		{"an attack", "warrior", func(s *Session) (func(uuid.UUID), func(*ecs.Entity) bool) {
			target := unarmoredTarget(s, 730, 500)
			return func(playerID uuid.UUID) {
					_ = s.handleAttack(playerID, target.ID)
				}, func(*ecs.Entity) bool {
					return currentHealth(target) < 1000
				}
		}},
		{"an ability", "warrior", func(s *Session) (func(uuid.UUID), func(*ecs.Entity) bool) {
			return func(playerID uuid.UUID) {
					_ = s.castSkill(playerID, types.PlayerCastSkillPayload{SkillID: "dash", TargetX: 700, TargetY: 900})
				}, func(delver *ecs.Entity) bool {
					return delver.HasComponent(ecs.ComponentTypeDash)
				}
		}},
		// an instant page: a move would break nothing of it
		{"a page cast", "archer", func(s *Session) (func(uuid.UUID), func(*ecs.Entity) bool) {
			return func(playerID uuid.UUID) {
					_ = castPageSkill(s, playerID, string(components.PageTrackersEye))
				}, func(delver *ecs.Entity) bool {
					bc, _ := delver.GetComponent(ecs.ComponentTypeBook)
					_, cooling := bc.(*components.BookComponent).Cooldowns[components.PageTrackersEye]
					return cooling
				}
		}},
		{"an interact", "warrior", func(s *Session) (func(uuid.UUID), func(*ecs.Entity) bool) {
			loot := s.AddItem(types.ItemConfig{TemplateID: uuid.New(), ItemType: types.ItemTypeRing, Name: "Tin Ring"})
			CreateDropPileEntity(s.EntityManager, 700, 500, []uuid.UUID{loot})
			return func(playerID uuid.UUID) {
					_ = s.handleInteract(playerID, loot)
				}, func(delver *ecs.Entity) bool {
					lc, _ := delver.GetComponent(ecs.ComponentTypeItemIDList)
					for _, id := range lc.(*components.ItemIDListComponent).ItemIDs {
						if id == loot {
							return true
						}
					}
					return false
				}
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := coopRun(t)
			playerID, delver := placeDelverAt(t, s, tt.class, 5, 500, 500)
			tick(s)
			act, acted := tt.setup(s)

			rollOnTick(s, playerID, 1, 0)
			ticks(s, rollTicks-2)
			require.True(t, systems.Rolling(delver), "on the roll's last tick")
			s.queueIntent(func() { act(playerID) })
			tick(s)
			require.InDelta(t, 700.0, transformOf(t, delver).X, 1e-6)
			ticks(s, 3)
			assert.False(t, acted(delver), "dropped, and not kept for after")

			s.queueIntent(func() { act(playerID) })
			tick(s)
			assert.True(t, acted(delver), "sent after the roll, it acts")
		})
	}
}

// A floor change mid-roll ends it; its cooldown carries to the new floor.
// FS-7P736 §A R11; AC 9.
func TestRun_Roll_AFloorChangeEndsItTheCooldownCarries(t *testing.T) {
	s, ids := dungeonRun(t, 7, 1, 0)
	delver := delverEntity(t, s, ids[0])

	rollOnTick(s, ids[0], 1, 0)
	require.True(t, systems.Rolling(delver))
	cooldown, _ := systems.RollCooldown(delver)
	left := cooldown.Remaining

	require.NoError(t, s.regenerateFloor())

	assert.False(t, systems.Rolling(delver), "the roll ended with the floor")
	carried, waiting := systems.RollCooldown(delver)
	require.True(t, waiting, "the cooldown carries")
	assert.Equal(t, left, carried.Remaining)
}

// rollOnto stands the delver 2.5 cells short of cell along an axis whose
// cells up to it are walkable, and rolls them onto its centre, the roll's
// ticks run. FS-7P736 §A R9.
func rollOnto(t *testing.T, s *Session, playerID uuid.UUID, cell components.Cell) {
	t.Helper()
	delver := delverEntity(t, s, playerID)
	size := s.dungeon.layout.CellSize
	require.InDelta(t, constants.RollDistance, 2.5*size, 1e-9, "the roll is 2.5 cells")
	for _, d := range [][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
		clear := true
		for k := 1; k <= 3; k++ {
			if !s.navGrid.Walkable(cell.X-k*d[0], cell.Y-k*d[1]) {
				clear = false
			}
		}
		if !clear {
			continue
		}
		centre := s.dungeon.cellCentre(cell)
		at := transformOf(t, delver)
		at.X, at.Y = centre.x-2.5*size*float64(d[0]), centre.y-2.5*size*float64(d[1])
		rollOnTick(s, playerID, float64(d[0]), float64(d[1]))
		ticks(s, rollTicks-1)
		at = transformOf(t, delver)
		require.InDelta(t, centre.x, at.X, 1e-6, "rolled onto the cell")
		require.InDelta(t, centre.y, at.Y, 1e-6, "rolled onto the cell")
		return
	}
	require.FailNow(t, "no clear run-up to the cell", "%v", cell)
}

// A roll onto a trap springs it, and its hit spares the roller; a tripwire
// wakes its ambush. FS-7P736 §A R5, R9; AC 4.
func TestRun_Roll_OntoATrapSpringsIt(t *testing.T) {
	t.Run("a spike plate", func(t *testing.T) {
		s, ids := trapsRun(t, 7, 1)
		trap := firstTrapAs(t, s, components.TrapSpikePlate)
		delver := delverEntity(t, s, ids[0])
		health := currentHealth(delver)

		rollOnto(t, s, ids[0], trapOf(trap).Cell)

		assert.False(t, trapOf(trap).Armed, "sprung")
		assert.Equal(t, health, currentHealth(delver), "its hit spares the roller")
	})

	t.Run("a tripwire", func(t *testing.T) {
		s, ids := trapsRun(t, 7, 1)
		trap := firstTrapAs(t, s, components.TrapTripwire)
		before := monstersInWorld(s.EntityManager)

		rollOnto(t, s, ids[0], trapOf(trap).Cell)

		assert.GreaterOrEqual(t, len(newMonsters(s, before)), AmbushSizeMin, "the ambush wakes")
		assert.True(t, trapOf(trap).Spent)
	})
}

// A roll onto a plate weighs it, as walking there would. FS-7P736 §A R9; AC 4.
func TestRun_Roll_OntoAPlateWeighsIt(t *testing.T) {
	s, player, _ := platesRun(t, 7)
	plates := piecesOfKind(s, components.SealPiecePlate)

	rollOnto(t, s, player, pieceOf(plates[0]).Cell)

	assert.True(t, pieceOf(plates[0]).Active, "held")
}

// The roll is on the wire from its first tick, on the roller's current_player
// and on every other recipient's other_players entry, with the roller's own
// cooldown; the roll is gone the tick after its last. FS-7P736 §A R12; AC 8.
func TestRun_Roll_OnTheWire(t *testing.T) {
	s, playerID, _ := rollRun(t, "warrior")
	watcher, _ := seatedDelver(t, s, "archer", 900, 900)

	rollOnTick(s, playerID, 0, -1)

	me := frameOf(t, s, types.WorldTypeRun, playerID)["current_player"].(map[string]any)
	assert.Equal(t, map[string]any{"dir_x": 0.0, "dir_y": -1.0}, me["roll"])
	assert.Equal(t, 3.0, me["roll_cooldown"].(map[string]any)["total"])
	others := frameOf(t, s, types.WorldTypeRun, watcher)["other_players"].([]any)
	require.Len(t, others, 1)
	assert.Equal(t, map[string]any{"dir_x": 0.0, "dir_y": -1.0}, others[0].(map[string]any)["roll"])

	ticks(s, rollTicks)
	me = frameOf(t, s, types.WorldTypeRun, playerID)["current_player"].(map[string]any)
	assert.NotContains(t, me, "roll")
	assert.Contains(t, me, "roll_cooldown")
}
