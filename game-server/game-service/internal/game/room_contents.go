package game

import (
	"math/rand/v2"
	"slices"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
)

/**
* Room contents (FS-KE075 §Change: Room variety R77-R81): what each room of a
* dungeon floor holds, given once the floor's seals, respites and encounter
* are planned. A role room keeps its role and a claimed decision room its own
* draw's piece; every other room is ordinary and rolls quiet, monsters or a
* decision, a trap or a chest or sack. The population, the containers and the
* traps each read it.
**/

// roomContent is what a room of a dungeon floor holds.
type roomContent int

const (
	// contentRole: the start, stairs, switch, escape door, treasure, respite
	// and hidden rooms, each holding what its role puts there
	contentRole roomContent = iota
	// contentClaimed: a room a seal's piece, the encounter or the cage key
	// stands in, holding that and nothing rolled
	contentClaimed
	// contentQuiet: dressing and light only
	contentQuiet
	// contentMonsters: one or two rolled monsters, or a hall's pack
	contentMonsters
	// contentTrap: a trap at least, when the floor's count allows
	contentTrap
	// contentContainer: one chest or sack
	contentContainer
)

// The ordinary room's roll (R77): quiet, monsters, else a decision, which is a
// trap or else a chest or sack.
const (
	RoomQuietShare    = 0.30
	RoomMonstersShare = 0.40
	DecisionTrapShare = 0.40
	// the roll's own stream, apart from the session's spawn source, so the
	// rolls after it draw as they did
	roomContentsStream = 0x524f4f4d
)

/**
* planRoomContents gives every room of d its contents on a stream of the
* layout's seed and depth (R77). Role and claimed rooms first; each other room
* then rolls in room order.
**/
func (s *Session) planRoomContents(d *dungeonFloor, depth int) {
	rng := rand.New(rand.NewPCG(d.layout.Seed^roomContentsStream, uint64(depth)))
	d.contents = make([]roomContent, len(d.layout.Rooms))
	for room := range d.layout.Rooms {
		switch {
		case d.isRoleRoom(room):
			d.contents[room] = contentRole
		case d.isClaimed(room):
			d.contents[room] = contentClaimed
		default:
			d.contents[room] = rollRoomContent(rng)
		}
	}
}

// rollRoomContent is one ordinary room's roll (R77).
func rollRoomContent(rng *rand.Rand) roomContent {
	switch roll := rng.Float64(); {
	case roll < RoomQuietShare:
		return contentQuiet
	case roll < RoomQuietShare+RoomMonstersShare:
		return contentMonsters
	case rng.Float64() < DecisionTrapShare:
		return contentTrap
	default:
		return contentContainer
	}
}

// isRoleRoom is whether room holds a role: the start, stairs, switch, escape
// door, a treasure room, a respite's or a hidden room.
func (d *dungeonFloor) isRoleRoom(room int) bool {
	roles := d.layout.Roles
	switch {
	case room == roles.Start, room == roles.Stairs, slices.Contains(roles.Treasure, room):
		return true
	case roles.HasEscapeDoor() && (room == roles.Switch || room == roles.EscapeDoor):
		return true
	case d.isRespite(room):
		return true
	}
	return slices.ContainsFunc(d.layout.Hidden, func(h levelgen.BarredRoom) bool { return h.Room == room })
}

// isClaimed is whether a seal's piece, the encounter or a cage key lying on
// the ground was planned in room.
func (d *dungeonFloor) isClaimed(room int) bool {
	if e := d.encounter; e != nil {
		if e.room == room || (!e.key.onElite && e.key.at != (point{}) && d.roomAt(e.key.at.x, e.key.at.y) == room) {
			return true
		}
	}
	for _, plan := range d.seals {
		for _, piece := range plan.pieces {
			if d.roomAt(piece.at.x, piece.at.y) == room {
				return true
			}
		}
	}
	return false
}

// content is what room holds, as planRoomContents gave it.
func (d *dungeonFloor) content(room int) roomContent { return d.contents[room] }

// roomsHolding is the rooms whose contents are c, in room order.
func (d *dungeonFloor) roomsHolding(c roomContent) []int {
	var rooms []int
	for room := range d.layout.Rooms {
		if d.content(room) == c {
			rooms = append(rooms, room)
		}
	}
	return rooms
}

// quietRegions is the region ids of the rooms that rolled quiet, for the floor
// map (R84); none when no room did.
func (d *dungeonFloor) quietRegions() []int {
	var out []int
	for _, room := range d.roomsHolding(contentQuiet) {
		out = append(out, d.roomRegion(room))
	}
	return out
}
