package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/stretchr/testify/assert"
)

func TestRawDamage_PowerCoefficientAndStatScaling(t *testing.T) {
	tests := []struct {
		name        string
		power       float64
		coefficient float64
		scalingStat int
		want        float64
	}{
		{"class attack only, no stat", 12, 1.0, 0, 12},
		{"class attack scaled by strength 8", 12, 1.0, 8, 16.8},
		{"class attack plus weapon attack_power", 12 + 8, 1.0, 8, 28},
		{"coefficient multiplies", 10, 1.4, 8, 19.6},
		{"stat of 20 doubles", 10, 1.0, 20, 20},
		{"no power deals nothing raw", 0, 1.0, 8, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.InDelta(t, tt.want, RawDamage(tt.power, tt.coefficient, tt.scalingStat), 1e-9)
		})
	}
}

func TestCritChance_BasePlusWeaponRateCapped(t *testing.T) {
	tests := []struct {
		name       string
		weaponRate float64
		want       float64
	}{
		{"no weapon crits at the base 5%", 0, 0.05},
		{"weapon critical_rate adds to the base", 0.10, 0.15},
		{"exactly at the cap", 0.45, 0.50},
		{"capped at 50%", 0.80, 0.50},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.InDelta(t, tt.want, CritChance(tt.weaponRate), 1e-9)
		})
	}
}

func TestResolveDamage_MitigationCritAndFloor(t *testing.T) {
	physical := func(power float64) components.AttackSnapshot {
		return components.AttackSnapshot{DamageType: components.DamagePhysical, Power: power, Coefficient: 1, CritChance: 0.05}
	}
	magic := func(power float64) components.AttackSnapshot {
		return components.AttackSnapshot{DamageType: components.DamageMagic, Power: power, Coefficient: 1, CritChance: 0.05}
	}
	const noCrit = 0.99

	tests := []struct {
		name     string
		attack   components.AttackSnapshot
		target   Mitigation
		roll     float64
		want     int
		wantCrit bool
	}{
		{"no armor takes it all", physical(40), Mitigation{}, noCrit, 40, false},
		{"defense mitigates physical", physical(40), Mitigation{Defense: 50}, noCrit, 20, false},
		{"magic resistance does not mitigate physical", physical(40), Mitigation{MagicResistance: 50}, noCrit, 40, false},
		{"magic resistance mitigates magic", magic(40), Mitigation{MagicResistance: 50}, noCrit, 20, false},
		{"defense does not mitigate magic", magic(40), Mitigation{Defense: 50}, noCrit, 40, false},
		{"rounds to nearest", physical(25), Mitigation{Defense: 10}, noCrit, 21, false}, // 20.83
		{"never below 1", physical(0.2), Mitigation{Defense: 500}, noCrit, 1, false},
		{"zero power still deals 1", physical(0), Mitigation{}, noCrit, 1, false},
		{"roll under crit chance crits for 1.5x", physical(40), Mitigation{}, 0.01, 60, true},
		{"roll at crit chance does not crit", physical(40), Mitigation{}, 0.05, 40, false},
		{
			"weapon crit rate raises the chance",
			components.AttackSnapshot{DamageType: components.DamagePhysical, Power: 40, Coefficient: 1, CritChance: CritChance(0.2)},
			Mitigation{}, 0.2, 60, true,
		},
		{"crit then mitigate", physical(40), Mitigation{Defense: 50}, 0.0, 30, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, crit := ResolveDamage(tt.attack, tt.target, tt.roll)
			assert.Equal(t, tt.want, got)
			assert.Equal(t, tt.wantCrit, crit)
		})
	}
}
