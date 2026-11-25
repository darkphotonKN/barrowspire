package game

import (
	"errors"
	"log/slog"
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/google/uuid"
)

/**
* The Cutthroats (FS-4EC7Z §D R14-R15). Three Cutthroats stand peaceful in the
* encounter room. The first talk to any of them starts the parley: the one
* talked to greets, and CutthroatParleyDelay later the group's fate is drawn
* once from the world's spawn source. Hostile, that one says the turn line and
* on the next tick (so the line reaches the wire) every living Cutthroat is
* replaced where it stands by a `cutthroat` monster in its look, hunting the
* delver who talked. Peaceful, it gives the tip: the floor's unopened secret
* door nearest them is detected and revealed, or, with none, it says the lore.
*
* A turn replaces each NPC with a new monster entity rather than converting it
* in place: the one monster constructor (CreateMonsterEntity) stays the only
* way a monster is made, no NPC component lingers on a monster, and an entity
* id never moves between encounter_npcs and monsters on the wire.
*
* Hire is the server side of FS-X2CMM's Strike a Deal: a group not turned
* hostile becomes the hirer's allies (ally.go), cancelling a draw still due.
**/

// The hire refusals' reasons, from which the client writes its own lines.
// FS-4EC7Z §F R27.
const (
	RefusalNotWilling   = "not_willing"
	RefusalAlreadyHired = "already_hired"
)

var (
	// ErrNotWilling refuses a hire of any group but Cutthroats who have not
	// turned hostile. FS-4EC7Z §D R15.
	ErrNotWilling = errors.New("this group will not be hired")
	// ErrAlreadyHired refuses a hire of a group already allied. FS-4EC7Z §D
	// R15.
	ErrAlreadyHired = errors.New("this group is already allied")
)

// cutthroatsKind is the Cutthroats' entry in encounterKinds: three bodies,
// their parley's draw on the tick, a talk that starts the parley.
var cutthroatsKind = encounterKind{
	spots: CutthroatCount,
	half:  constants.PlayerRadius,
	lay: func(s *Session, encounter *ecs.Entity, ec *components.EncounterComponent, plan *encounterPlan) {
		s.layCutthroats(encounter, ec, plan.spots)
	},
	advance: func(s *Session, dt float64, encounter *ecs.Entity, ec *components.EncounterComponent) {
		if cc, ok := encounter.GetComponent(ecs.ComponentTypeCutthroats); ok {
			s.advanceCutthroats(dt, ec, cc.(*components.CutthroatsComponent))
		}
	},
	talk: func(s *Session, encounter *ecs.Entity, _ *components.EncounterComponent, playerID uuid.UUID, target *ecs.Entity, npc *components.EncounterNPCComponent) {
		if cc, ok := encounter.GetComponent(ecs.ComponentTypeCutthroats); ok {
			s.talkToCutthroat(cc.(*components.CutthroatsComponent), playerID, target, npc)
		}
	},
}

// layCutthroats stands the Cutthroats at spots, peaceful, each with a hired
// Cutthroat's health at the floor's monster level, in the looks by turn, their
// parley yet to start. FS-4EC7Z §D R14.
func (s *Session) layCutthroats(encounter *ecs.Entity, ec *components.EncounterComponent, spots []point) {
	health := allyHealth(components.EncounterNPCCutthroat, s.floorMonsterLevel())
	for i, at := range spots {
		npc := CreateEncounterNPCEntity(s.EntityManager, EncounterNPCConfig{
			Kind:      components.EncounterNPCCutthroat,
			Look:      CutthroatLooks[i%len(CutthroatLooks)],
			Stance:    components.StancePeaceful,
			X:         at.x,
			Y:         at.y,
			Health:    health,
			Encounter: encounter.ID,
		})
		ec.NPCs = append(ec.NPCs, npc.ID)
	}
	encounter.AddComponent(&components.CutthroatsComponent{})
}

/**
* talkToCutthroat answers a talk to a peaceful Cutthroat by playerID: the
* first starts the parley, the one talked to greeting and the talker marked as
* the one a hostile turn hunts; while the draw is due, the greeting again;
* once it fell peaceful, the tip or the lore it gave, again (the door is
* revealed once). FS-4EC7Z §D R14.
**/
func (s *Session) talkToCutthroat(c *components.CutthroatsComponent, playerID uuid.UUID, target *ecs.Entity, npc *components.EncounterNPCComponent) {
	switch {
	case !c.Parleyed:
		c.Parleyed, c.DrawIn, c.Speaker = true, CutthroatParleyDelay, target.ID
		if body, ok := s.delverInPlayByMember(playerID); ok {
			c.Talker = body.ID
		}
		systems.Say(npc, components.LineCutthroatGreet)
		slog.Debug("Cutthroats parley", "sessionID", s.ID, "talker", playerID)
	case c.Fate == components.FatePeaceful:
		systems.Say(npc, c.Tip)
	default:
		systems.Say(npc, components.LineCutthroatGreet)
	}
}

/**
* advanceCutthroats runs the parley a tick: once due, the draw, hostile at the
* world's chance (the speaker's turn line now, the turn the next tick) or
* peaceful (the tip with a door revealed, else the lore). A hired group is
* never drawn; a group with none alive draws nothing. FS-4EC7Z §D R14-R15,
* §F R26.
**/
func (s *Session) advanceCutthroats(dt float64, ec *components.EncounterComponent, c *components.CutthroatsComponent) {
	if !c.Parleyed || c.Hired {
		return
	}
	switch c.Fate {
	case components.FateUndrawn:
		c.DrawIn -= dt
		if c.DrawIn > 0 {
			return
		}
		living := s.livingNPCs(ec)
		if len(living) == 0 {
			return
		}
		speaker := speakerOf(living, c.Speaker)
		if s.spawnRand.Float64() < s.tuning.cutthroatHostileChance {
			c.Fate = components.FateTurning
			systems.Say(speaker.npc, components.LineCutthroatTurn)
			return
		}
		c.Fate, c.Tip = components.FatePeaceful, components.LineCutthroatLore
		if s.revealNearestSecretDoor(living) {
			c.Tip = components.LineCutthroatTip
		}
		systems.Say(speaker.npc, c.Tip)
	case components.FateTurning:
		s.turnCutthroats(ec, c)
		c.Fate = components.FateHostile
	}
}

// speakerOf is the living NPC with entity id, or the first living one when it
// has fallen; living is never empty.
func speakerOf(living []encounterNPC, id uuid.UUID) encounterNPC {
	for _, n := range living {
		if n.entity.ID == id {
			return n
		}
	}
	return living[0]
}

/**
* turnCutthroats replaces every living Cutthroat with a `cutthroat` monster
* where it stands, facing as it faced, in its look, a standard one at the
* floor's monster level, as hurt as it was, hunting the talker at any
* distance (the nearest delver in play when the talker is out of it).
* FS-4EC7Z §D R14, §F R24.
**/
func (s *Session) turnCutthroats(ec *components.EncounterComponent, c *components.CutthroatsComponent) {
	level := s.floorMonsterLevel()
	talker, talkerInPlay := s.EntityManager.GetEntity(c.Talker)
	talkerInPlay = talkerInPlay && systems.InPlay(talker)
	delvers := s.huntedBodies(nil)
	living := s.livingNPCs(ec)
	for _, n := range living {
		monster := CreateMonsterEntity(s.EntityManager, MonsterConfig{
			Archetype: components.MonsterArchetypeCutthroat,
			Level:     level,
			Look:      n.npc.Look,
			X:         n.at.X,
			Y:         n.at.Y,
		})
		mc, _ := monster.GetComponent(ecs.ComponentTypeEnemy)
		m := mc.(*components.MonsterComponent)
		m.FacingX, m.FacingY = n.npc.FacingX, n.npc.FacingY
		// taken up at any distance, past the leash, as a wave's prey is
		if talkerInPlay {
			m.LastAttacker = talker.ID
		} else if prey, ok := nearestOf(delvers, point{n.at.X, n.at.Y}); ok {
			m.LastAttacker = prey
		}
		keepWounds(n.entity, monster)
		s.EntityManager.RemoveEntity(n.entity.ID)
	}
	slog.Debug("Cutthroats turn", "sessionID", s.ID, "monsters", len(living))
}

// keepWounds gives monster the share of its health that npc had of its own.
func keepWounds(npc, monster *ecs.Entity) {
	from, _ := npc.GetComponent(ecs.ComponentTypeHealth)
	to, _ := monster.GetComponent(ecs.ComponentTypeHealth)
	was, now := from.(*components.HealthComponent), to.(*components.HealthComponent)
	if was.MaxHealth <= 0 || was.CurrentHealth >= was.MaxHealth {
		return
	}
	now.CurrentHealth = max(int(math.Round(float64(now.MaxHealth)*float64(was.CurrentHealth)/float64(was.MaxHealth))), 1)
}

/**
* revealNearestSecretDoor reveals to the party the floor's unopened secret
* door nearest any of living, measured to its cells: detected (FS-5FZ4J §F
* R38) and marked revealed for the wire; false, nothing revealed, on a floor
* with none. FS-4EC7Z §D R14, §F R28.
**/
func (s *Session) revealNearestSecretDoor(living []encounterNPC) bool {
	var nearest *components.DetectableComponent
	var door uuid.UUID
	best := math.Inf(1)
	for _, e := range s.EntityManager.GetAllEntities() {
		if !isSecretDoor(e) || barrierOpen(e) {
			continue
		}
		dc, ok := e.GetComponent(ecs.ComponentTypeDetectable)
		if !ok {
			continue
		}
		d := dc.(*components.DetectableComponent)
		for _, spot := range d.Spots {
			for _, n := range living {
				if dist := math.Hypot(spot.X-n.at.X, spot.Y-n.at.Y); dist < best {
					best, nearest, door = dist, d, e.ID
				}
			}
		}
	}
	if nearest == nil {
		slog.Debug("Cutthroats' tip is lore: no unopened secret door", "sessionID", s.ID)
		return false
	}
	nearest.Detected, nearest.Revealed = true, true
	slog.Debug("Cutthroats reveal a secret door", "sessionID", s.ID, "door", door)
	return true
}

/**
* Hire is the hire entry point (FS-4EC7Z §D R15), the server side of FS-X2CMM's
* Strike a Deal: it makes the encounter group of group, the entity id of any
* one of its NPCs (the cast's target), allies of hirer, a member id, each
* saying its acknowledgement, for the rest of the floor. A draw still due is
* cancelled. Refused, nothing changed: ErrEntityNotFound for no entity,
* ErrAlreadyHired for a group already allied (hired Cutthroats or freed
* Captives), ErrNotWilling for anything but living Cutthroats who have not
* turned hostile, ErrTooManyAllies past the party's cap (§C R10). It checks
* neither reach nor the page: the cast that calls it does. Call it on the
* tick, as every world change is made (a queued intent).
**/
func (s *Session) Hire(group, hirer uuid.UUID) error {
	target, ok := s.EntityManager.GetEntity(group)
	if !ok {
		return ErrEntityNotFound
	}
	nc, isNPC := target.GetComponent(ecs.ComponentTypeEncounterNPC)
	if !isNPC {
		return ErrNotWilling
	}
	encounter, ok := s.EntityManager.GetEntity(nc.(*components.EncounterNPCComponent).Encounter)
	if !ok {
		return ErrNotWilling
	}
	ec, _ := encounter.GetComponent(ecs.ComponentTypeEncounter)
	living := s.livingNPCs(ec.(*components.EncounterComponent))
	for _, n := range living {
		if n.npc.Stance == components.StanceAlly {
			return ErrAlreadyHired
		}
	}
	cc, isCutthroats := encounter.GetComponent(ecs.ComponentTypeCutthroats)
	if !isCutthroats || len(living) == 0 {
		return ErrNotWilling
	}
	cutthroats := cc.(*components.CutthroatsComponent)
	if cutthroats.Fate == components.FateTurning || cutthroats.Fate == components.FateHostile {
		return ErrNotWilling
	}

	bodies := make([]*ecs.Entity, len(living))
	for i, n := range living {
		bodies[i] = n.entity
	}
	if err := s.makeAllies(bodies, hirer); err != nil {
		return err
	}
	cutthroats.Hired = true
	for _, n := range living {
		systems.Say(n.npc, components.LineAllyAck)
	}
	slog.Info("Cutthroats hired", "sessionID", s.ID, "hirer", hirer, "allies", len(bodies))
	return nil
}
