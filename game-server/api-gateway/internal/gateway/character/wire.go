package character

import (
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/character"
)

// CharacterCreate is the create-character request: writable fields only
// (FS-BDA7X §API surface). No member field — identity is the token's.
//
// Both fields are required (no omitempty). Their VALIDITY — the class set, the
// 1–32 name rule, uniqueness — is character-service's to decide (ADR-0001
// §6–§8), so neither carries a constraint here; the edge checks shape only.
type CharacterCreate struct {
	Name  string `json:"name" doc:"Character name. Validity (1-32 characters after trimming, unique) is decided by character-service."`
	Class string `json:"class" doc:"warrior, mage or archer (decided by character-service)."`
}

// Character is one of the signed-in member's characters. No member / owner
// field: a character is only ever served to its owner.
//
// No omitempty except nextLevelAt: level 1 and 0 experience are real values
// and must stay on the wire; nextLevelAt is ABSENT at the cap by contract.
type Character struct {
	ID          string    `json:"id" format:"uuid" doc:"Character id."`
	Name        string    `json:"name" doc:"Character name."`
	Class       string    `json:"class" doc:"warrior, mage or archer."`
	Level       int32     `json:"level" minimum:"1" maximum:"20" doc:"Current level."`
	Experience  int64     `json:"experience" minimum:"0" doc:"Total experience, monotonic."`
	LevelFloor  int64     `json:"levelFloor" minimum:"0" doc:"Total experience at which the current level began."`
	NextLevelAt *int64    `json:"nextLevelAt,omitempty" doc:"Total experience for the next level; absent at the level cap."`
	CreatedAt   time.Time `json:"createdAt" doc:"Creation time."`
}

// CharacterList is the signed-in member's live characters, oldest first.
type CharacterList struct {
	// No omitempty, and never nil: a member with no characters gets [].
	Characters []Character `json:"characters" nullable:"false" doc:"Live characters, oldest first. Empty for a member with none."`
}

func characterFromProto(c *pb.Character) Character {
	return Character{
		ID:          c.GetId(),
		Name:        c.GetName(),
		Class:       c.GetClass(),
		Level:       c.GetLevel(),
		Experience:  c.GetExperience(),
		LevelFloor:  c.GetLevelFloor(),
		NextLevelAt: c.NextLevelAt,
		CreatedAt:   c.GetCreatedAt().AsTime(),
	}
}

func characterListFromProto(res *pb.ListCharactersResponse) CharacterList {
	list := CharacterList{Characters: make([]Character, 0, len(res.GetCharacters()))}
	for _, c := range res.GetCharacters() {
		list.Characters = append(list.Characters, characterFromProto(c))
	}
	return list
}
