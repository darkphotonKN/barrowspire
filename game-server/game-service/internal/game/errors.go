package game

import "errors"

var (
	// Core game
	ErrOutOfRange                  = errors.New("target out of range")
	ErrEntityNotFound              = errors.New("entity not found")
	ErrComponentNotFound           = errors.New("component not found")
	ErrComponentCouldNotBeAsserted = errors.New("component assertion failed")
	ErrUnknownSkill                = errors.New("unknown skill")
	// ErrDelverOutOfPlay refuses a gameplay action from a delver who has died or
	// escaped. FS-77AB6 §Requirements 17.
	ErrDelverOutOfPlay = errors.New("delver is out of play")
	// ErrBelowRequiredLevel refuses equipping an item whose required level is
	// above the wearer's. FS-BDA7X §Requirements 32.
	ErrBelowRequiredLevel = errors.New("below the item's required level")
	// ErrCharacterSwitchMidRun refuses seating a member as another character in
	// a run they are already in: a run keeps the character it was entered with.
	// FS-BDA7X §Requirements 7.
	ErrCharacterSwitchMidRun = errors.New("cannot switch character mid-run")
	// ErrStillInPlay refuses an early leave by a delver who is still in the
	// delve: only a resolved one may go. FS-QPDKN §Requirements 14.
	ErrStillInPlay = errors.New("delver is still in play")
	// ErrEscapedWaits refuses an early leave by an escaped delver: their plunder
	// is settled with the run, so they wait for its end. FS-QPDKN §Out of Scope.
	ErrEscapedWaits = errors.New("an escaped delver waits for the run's end")
	// ErrAlreadyResolved refuses a chosen death by a delver already out of the
	// delve: dead, escaped or left behind. FS-9K8EZ §Requirements 12.
	ErrAlreadyResolved = errors.New("delver is already out of the delve")
	// ErrNotInThisWorld refuses acting on a member who has no body here.
	ErrNotInThisWorld = errors.New("member has no body in this world")
	// ErrItemNotCarried refuses equipping an item that is not in the delver's
	// own satchel: one lying in a pile or carried by someone else.
	ErrItemNotCarried = errors.New("item is not carried by the delver")
	// ErrItemNotWorn refuses unequipping an item the delver is not wearing.
	ErrItemNotWorn = errors.New("item is not worn by the delver")
	// ErrItemNotInContainer refuses picking up an item no container holds: one
	// a delver carries or wears, or one lying nowhere.
	ErrItemNotInContainer = errors.New("item lies in no container")
	// ErrContainerClosed refuses picking up an item from a closed container.
	ErrContainerClosed = errors.New("container is closed")
	// ErrItemNotEquippable refuses equipping an item no slot takes.
	ErrItemNotEquippable = errors.New("item fits no equipment slot")

	// Floors
	ErrNoFloors = errors.New("this world has no floors")
	ErrTopFloor = errors.New("already on the top floor")
	// ErrPartyNotGathered refuses a climb while a living, non-escaped delver is
	// still away from the stairs. FS-F6F88 §Requirements 18.
	ErrPartyNotGathered = errors.New("party not gathered at the stairs")

	// Handoff seating
	// ErrNoSeat refuses seating a handoff arrival the run holds no seat for:
	// one it never expected, one already seated, or one whose seat was
	// released at the seat deadline. FS-K2HKP §Requirements 22-24.
	ErrNoSeat = errors.New("no seat for this player")
	// ErrCharacterNotSeatable refuses seating a handoff arrival whose
	// character has no class, or one no class config matches.
	ErrCharacterNotSeatable = errors.New("character cannot be seated")

	// Field visits (FS-X2F2H §B)
	// ErrNotAField refuses seating a visitor in a world that is not a field.
	ErrNotAField = errors.New("this world is not a field")
	// ErrAlreadyHere refuses seating a member who already has a body here.
	ErrAlreadyHere = errors.New("member already has a body in this world")
	// ErrNoLoadout refuses seating a visitor whose loadout was not read: a bare
	// body would clear the stored loadout when its visit settles (D27).
	ErrNoLoadout = errors.New("no loadout to seat the visitor with")
	// ErrNotAtGate refuses walking out of a field away from its entrance.
	ErrNotAtGate = errors.New("not at the entrance gate")
	// ErrFallen refuses walking out of a field while dead.
	ErrFallen = errors.New("fallen")

	// queue
	ErrPlayerAlreadyInQueue = errors.New("player already in queue")
)
