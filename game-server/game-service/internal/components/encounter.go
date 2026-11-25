package components

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

// EncounterKind is what group of humans a floor's encounter is. FS-4EC7Z §A R1.
type EncounterKind string

const (
	EncounterLostPilgrims EncounterKind = "lost_pilgrims"
	EncounterCaptives     EncounterKind = "captives"
	EncounterCutthroats   EncounterKind = "cutthroats"
)

// EncounterNPCKind is what one encounter NPC is, the wire's kind. FS-4EC7Z §F
// R22.
type EncounterNPCKind string

const (
	EncounterNPCPilgrim   EncounterNPCKind = "pilgrim"
	EncounterNPCCaptive   EncounterNPCKind = "captive"
	EncounterNPCCutthroat EncounterNPCKind = "cutthroat"
)

// EncounterStance is whose side an encounter NPC stands on. FS-4EC7Z §A R3.
type EncounterStance string

const (
	// StancePeaceful stands where it is and never attacks
	StancePeaceful EncounterStance = "peaceful"
	// StanceCaged is a captive inside its cage: no monster hunts it (§D R13)
	StanceCaged EncounterStance = "caged"
	// StanceAlly follows its hirer and fights for the party (§C R9)
	StanceAlly EncounterStance = "ally"
)

// EncounterAction is what an encounter NPC is doing, the wire's action.
// FS-4EC7Z §F R22.
type EncounterAction string

const (
	EncounterActionIdle   EncounterAction = "idle"
	EncounterActionMove   EncounterAction = "move"
	EncounterActionAttack EncounterAction = "attack"
	EncounterActionCower  EncounterAction = "cower"
	EncounterActionDead   EncounterAction = "dead"
)

// EncounterLine is a line key an encounter NPC says; the client writes the
// copy. FS-4EC7Z §F R26.
type EncounterLine string

const (
	LinePilgrimPlea    EncounterLine = "pilgrim_plea"
	LinePilgrimThanks  EncounterLine = "pilgrim_thanks"
	LineCaptivePlea    EncounterLine = "captive_plea"
	LineCaptiveFreed   EncounterLine = "captive_freed"
	LineCutthroatGreet EncounterLine = "cutthroat_greet"
	LineCutthroatTurn  EncounterLine = "cutthroat_turn"
	LineCutthroatTip   EncounterLine = "cutthroat_tip"
	LineAllyAck        EncounterLine = "ally_ack"
)

/*
EncounterComponent is a floor's one encounter (FS-4EC7Z §A R1-R2): a floor
entity, gone with the floor, naming its kind, its room and its NPCs. What a
kind does with them rides beside it as a component of that kind's own (the
pilgrims' PilgrimWaveComponent), so a new kind adds a component and leaves
this one as it is.
*/
type EncounterComponent struct {
	Kind EncounterKind
	// Room is the encounter room, an index into the floor's rooms
	Room int
	// NPCs are the encounter's NPCs by entity id, in the order they stood
	NPCs []uuid.UUID
}

func (e *EncounterComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeEncounter
}

/*
EncounterNPCComponent is one humanoid of an encounter (FS-4EC7Z §A R3): it sits
beside a Health, a Transform and a Velocity, and is neither a monster nor a
delver. Delvers never damage it; monsters hunt it unless it is caged.

Line is the last line it said and LineAt when, in its Age (the seconds it has
stood, counted by the encounter's tick): a talk or an encounter's moment sets
them, and the client shows a line once per LineAt (§F R22, R26). HirerID is the
member id of an ally's hirer, uuid.Nil for any other stance (§C R9).
CorpseRemaining is how long a dead one lies before it is removed.
*/
type EncounterNPCComponent struct {
	Kind   EncounterNPCKind
	Look   string
	Stance EncounterStance
	Action EncounterAction
	// FacingX, FacingY is the direction it faces; never zero
	FacingX, FacingY float64
	// Encounter is its encounter's entity id
	Encounter uuid.UUID

	Line   EncounterLine
	LineAt float64
	Age    float64

	HirerID         uuid.UUID
	CorpseRemaining float64
}

func (n *EncounterNPCComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeEncounterNPC
}

/*
PilgrimWaveComponent is the Lost Pilgrims' plea and wave (FS-4EC7Z §B R7-R8),
beside their EncounterComponent. Pleaded is set by the first delver within
reach or the first talk, the wave due WaveIn seconds later; Wave is the wave's
monsters once it has come, by entity id; Done once the wave has ended, with a
chest or without, or never came.
*/
type PilgrimWaveComponent struct {
	Pleaded bool
	WaveIn  float64
	Came    bool
	Wave    []uuid.UUID
	Done    bool
}

func (p *PilgrimWaveComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypePilgrimWave
}
