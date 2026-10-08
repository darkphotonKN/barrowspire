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

	// queue
	ErrPlayerAlreadyInQueue = errors.New("player already in queue")
)
