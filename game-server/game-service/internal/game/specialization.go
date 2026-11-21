package game

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

// gainedSpecialization is the pick's one-off changes to the body that has just
// become spec (FS-E1ZDG §B R8), run once from RaisePassiveRanks under the
// world's lock: the Berserker's max HP clamp (§D R17) and the Sellsword's
// parry-charge max (§J R34) hook here. None yet.
func gainedSpecialization(entity *ecs.Entity, spec string) {}
