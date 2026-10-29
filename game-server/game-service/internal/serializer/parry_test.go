package serializer

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func parryCharges(current int) components.ResourceComponent {
	return components.ResourceComponent{Kind: components.ResourceParryCharges, Current: current, Max: 3}
}

// seatMerc puts a mercenary in the world with the parry stance given.
func seatMerc(em *ecs.EntityManager, memberID uuid.UUID, heldParryCharges int, stance components.ParryComponent) *ecs.Entity {
	merc := seatWithResource(em, memberID, "mercenary", parryCharges(heldParryCharges), components.AttackParry)
	merc.AddComponent(&stance)
	return merc
}

var parryFields = []string{"parry_open", "parry_lockout", "parries"}

// A merc's own frame carries the parry stance, the whiff lockout's seconds left
// and the run's parry count beside the parry charges, which ride the resource.
// FS-MAMHR §Requirements 27–28.
func TestFormatStateToClientState_TellsAMercTheirParryState(t *testing.T) {
	tests := []struct {
		name   string
		stance components.ParryComponent
		want   map[string]any
	}{
		{"stance open", components.ParryComponent{Open: true, OpenFor: 0.1, Parries: 4},
			map[string]any{"parry_open": true, "parry_lockout": float64(0), "parries": float64(4)}},
		{"locked out", components.ParryComponent{LockoutRemaining: 0.75, Parries: 2},
			map[string]any{"parry_open": false, "parry_lockout": 0.75, "parries": float64(2)}},
		{"neither", components.ParryComponent{},
			map[string]any{"parry_open": false, "parry_lockout": float64(0), "parries": float64(0)}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			merc := uuid.New()
			seatMerc(em, merc, 2, tt.stance)

			_, frame := wireFor(t, em, types.WorldTypeRun, merc)

			me := frame["current_player"].(map[string]any)
			for _, field := range parryFields {
				assert.Equal(t, tt.want[field], me[field], field)
			}
			assert.Equal(t, map[string]any{"kind": "parry_charges", "current": float64(2), "max": float64(3), "ability_cost": float64(0)}, me["resource"])
		})
	}
}

// Another class's frame carries no parry fields, and nobody is told a
// teammate's: other_players carry health only. FS-MAMHR §Requirements 28–29.
func TestFormatStateToClientState_ParryStateIsTheMercsAlone(t *testing.T) {
	em := ecs.NewEntityManager()
	merc, warrior := uuid.New(), uuid.New()
	seatMerc(em, merc, 3, components.ParryComponent{Open: true, Parries: 5})
	seatWithResource(em, warrior, "warrior", stamina(100, 100), components.AttackDash)

	_, warriorFrame := wireFor(t, em, types.WorldTypeRun, warrior)
	_, mercFrame := wireFor(t, em, types.WorldTypeRun, merc)

	me := warriorFrame["current_player"].(map[string]any)
	others := warriorFrame["other_players"].([]any)
	require.Len(t, others, 1)
	teammate := others[0].(map[string]any)
	assert.Equal(t, "mercenary", teammate["class"])
	for _, field := range parryFields {
		assert.NotContains(t, me, field, "a warrior has no %s", field)
		assert.NotContains(t, teammate, field, "a teammate's %s is never sent", field)
	}
	for _, field := range parryFields {
		assert.Contains(t, mercFrame["current_player"], field)
	}
}
