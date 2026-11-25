package game

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/google/uuid"
)

/**
* A trap's hit (FS-5FZ4J §D R26): a dart wall, a spike plate, a fire jet, or a
* wrong lever's dart volley (§C R16). It is a hit, landed through the combat's
* one damage path on the tick it fires: armour and the delver's mitigation
* apply as to a monster's hit, it breaks a timed interact and it can kill.
* No monster is credited (§D R31).
**/

// trapHit is a trap's hit from source at a floor's monster level: a standard
// fodder monster's base hit at that level, times the kind's factor. No crit,
// no member, not a monster's, so nothing reflects, sidesteps or parries it.
func trapHit(source uuid.UUID, level int, factor float64) components.AttackSnapshot {
	return components.AttackSnapshot{
		AttackerEntityID: source,
		DamageType:       components.DamagePhysical,
		Power:            float64(monsterSheets[standardFodder].statsAt(level).Damage) * factor,
		Coefficient:      1,
	}
}

// hitByTrap queues a trap's hit from source on target, at the floor's monster
// level, for this tick's combat. A hardened warrior takes none: no damage, and
// so no break of a timed interact (FS-X2CMM §J R53).
func (s *Session) hitByTrap(source uuid.UUID, target *ecs.Entity, factor float64) {
	if systems.Hardened(target) {
		return
	}
	s.trapHits = append(s.trapHits, systems.Impact{
		Attack:         trapHit(source, s.floorMonsterLevel(), factor),
		TargetEntityID: target.ID,
	})
}

// takeTrapHits hands this tick's trap hits to the combat, once.
func (s *Session) takeTrapHits() []systems.Impact {
	hits := s.trapHits
	s.trapHits = nil
	return hits
}

// floorMonsterLevel is the current floor's monster level, no spread: the
// party's level as population takes it, plus the floor's offset (FS-C8VM7 §A
// R1).
func (s *Session) floorMonsterLevel() int {
	depth := firstFloor
	if floor, ok := systems.CurrentFloor(s.EntityManager.GetAllEntities()); ok {
		depth = floor.Depth
	}
	return monsterLevel(s.floorPartyLevel(depth), depth, 0)
}
