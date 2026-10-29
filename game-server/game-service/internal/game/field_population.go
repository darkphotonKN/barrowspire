package game

import (
	"log/slog"
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

/**
* fieldPopulation is a field channel's monsters: one per spawn point, each
* point refilled its place's delay after its monster dies (FS-X2F2H
* §Requirements 26–27). It is fed by the place alone (its spawn points, creature
* table, band and factor), so every field, the Meadows and FS-3QHQZ's Forest
* alike, populates through it.
*
* Built and filled as the channel is built, then touched by the world's tick
* alone.
**/
type fieldPopulation struct {
	em     *ecs.EntityManager
	place  FieldPlace
	rng    populationRand
	spawns []fieldSpawn
}

// fieldSpawn is one spawn point: where it stands, the living monster it holds
// (uuid.Nil once that one has died), and how long until it rolls the next.
type fieldSpawn struct {
	at       FieldPoint
	monster  uuid.UUID
	refillIn float64 // s
}

func newFieldPopulation(em *ecs.EntityManager, place FieldPlace, points []FieldPoint, rng populationRand) *fieldPopulation {
	spawns := make([]fieldSpawn, len(points))
	for i, at := range points {
		spawns[i] = fieldSpawn{at: at}
	}
	return &fieldPopulation{em: em, place: place, rng: rng, spawns: spawns}
}

// fill stands a freshly rolled monster on every spawn point: the field at boot,
// before anyone can be in it. R26.
func (p *fieldPopulation) fill() {
	for i := range p.spawns {
		p.refill(&p.spawns[i])
	}
}

/**
* update is the spawn points' share of a tick. A point whose monster died this
* tick starts its delay; a point whose delay has run out rolls a new monster,
* unless a player in play stands within MonsterDelverExclusion of it, in which
* case it waits and tries again each FieldRespawnRetry (R27, D26). A point never
* holds two: it rolls only once its last monster is dead, and a corpse clears
* (MonsterCorpseLifetime) long before the delay runs out.
**/
func (p *fieldPopulation) update(deltaTime float64, entities []*ecs.Entity) {
	var players []point
	measured := false

	for i := range p.spawns {
		spawn := &p.spawns[i]

		if spawn.monster != uuid.Nil {
			if p.alive(spawn.monster) {
				continue
			}
			spawn.monster = uuid.Nil
			spawn.refillIn = p.respawnDelay()
			continue
		}

		spawn.refillIn -= deltaTime
		if spawn.refillIn > 0 {
			continue
		}

		if !measured {
			players = inPlayPositions(entities)
			measured = true
		}
		if withinAny(spawn.at, players, MonsterDelverExclusion) {
			spawn.refillIn = FieldRespawnRetry
			continue
		}

		p.refill(spawn)
	}
}

/**
* refill stands a freshly rolled monster on the point. A creature with no stat
* sheet is never spawned as a sheetless monster: the point stays empty and
* tries again after the delay, loudly.
**/
func (p *fieldPopulation) refill(spawn *fieldSpawn) {
	monster := rollFieldMonster(p.rng, p.place)
	if _, known := monsterSheets[monster.Archetype]; !known {
		slog.Error("Field spawn point left empty: no sheet for its creature",
			"field", p.place.ID, "archetype", monster.Archetype, "x", spawn.at.X, "y", spawn.at.Y)
		spawn.refillIn = p.respawnDelay()
		return
	}

	monster.X, monster.Y = spawn.at.X, spawn.at.Y
	spawn.monster = CreateMonsterEntity(p.em, monster).ID
}

// respawnDelay is the place's delay, or the field default where it names none.
func (p *fieldPopulation) respawnDelay() float64 {
	if p.place.RespawnDelay > 0 {
		return p.place.RespawnDelay
	}
	return FieldRespawnDelay
}

// alive is whether the monster is still standing: in the world and not lying dead.
func (p *fieldPopulation) alive(id uuid.UUID) bool {
	entity, ok := p.em.GetEntity(id)
	if !ok {
		return false
	}
	mc, ok := entity.GetComponent(ecs.ComponentTypeEnemy)
	return ok && mc.(*components.MonsterComponent).Action != components.MonsterActionDead
}

// withinAny is whether any of the points stands closer than r to at.
func withinAny(at FieldPoint, points []point, r float64) bool {
	for _, p := range points {
		if math.Hypot(at.X-p.x, at.Y-p.y) < r {
			return true
		}
	}
	return false
}

// refillSpawnPoints runs a field channel's spawn points on its tick; the hub and
// a run have none.
func (s *Session) refillSpawnPoints(deltaTime float64, entities []*ecs.Entity) {
	s.mu.RLock()
	population := s.fieldPopulation
	s.mu.RUnlock()

	if population != nil {
		population.update(deltaTime, entities)
	}
}

/**
* rollFieldMonster rolls what a field's spawn point holds next (FS-X2F2H
* §Requirements 28): the archetype from the place's creature table, the level
* uniform in its band, and an elite at the Spire's floor-1 chance, read live.
* Who is in the field does not matter: a field is not party-scaled. The place's
* stat factor rides along to the one place it is applied (monsterStats.scaled).
*
* Draws, in order: the creature, the level, the elite roll, the prefix.
**/
func rollFieldMonster(rng populationRand, place FieldPlace) MonsterConfig {
	archetype := pickCreature(rng, place.Creatures)

	monster := MonsterConfig{
		Archetype:  archetype,
		Level:      place.MinLevel + rng.IntN(max(place.MaxLevel-place.MinLevel+1, 1)),
		StatFactor: place.StatFactor,
	}

	if rng.Float64() < eliteChance(1) {
		prefixes := place.ElitePrefixes
		if len(prefixes) == 0 {
			prefixes = FieldElitePrefixes
		}
		monster.Elite = true
		monster.Name = prefixes[rng.IntN(len(prefixes))] + " " + monsterSheets[archetype].Name
	}

	return monster
}

// pickCreature draws one archetype from a creature table by weight; a row with
// no weight counts as 1. One draw, even for a table of one.
func pickCreature(rng populationRand, table []FieldCreature) components.MonsterArchetype {
	if len(table) == 0 {
		return ""
	}

	weight := func(c FieldCreature) float64 {
		if c.Weight <= 0 {
			return 1
		}
		return c.Weight
	}

	total := 0.0
	for _, creature := range table {
		total += weight(creature)
	}

	x := rng.Float64() * total
	for _, creature := range table {
		if x < weight(creature) {
			return creature.Archetype
		}
		x -= weight(creature)
	}
	return table[len(table)-1].Archetype
}
