package passivetree

// The eight specialization ids (FS-E1ZDG §A R1). The display names are the
// client's.
const (
	Guardian     = "guardian"
	Berserker    = "berserker"
	Spellwarden  = "spellwarden"
	Pyromancer   = "pyromancer"
	Hunter       = "hunter"
	ShadowRanger = "shadow_ranger"
	Duelist      = "duelist"
	Sellsword    = "sellsword"
)

// specializations is each class's spec ids in the order SpecializationNodes
// gives its specialization nodes: t6a's, then t6b's.
var specializations = map[string][2]string{
	"warrior":   {Guardian, Berserker},
	"mage":      {Spellwarden, Pyromancer},
	"archer":    {Hunter, ShadowRanger},
	"mercenary": {Duelist, Sellsword},
}

// SpecializationOf is the specialization a character of class holding held
// is: the one its held specialization node grants (FS-E1ZDG §B R4, R7).
// False before the pick, and for ranks naming no specialization node of class
// (an unknown node, or another class's, R10), never an error. The one table character-service and
// game-service both read.
func SpecializationOf(class string, held Ranks) (string, bool) {
	nodes, ok := SpecializationNodes(class)
	if !ok {
		return "", false
	}
	for i, node := range nodes {
		if held[node.ID] > 0 {
			return specializations[class][i], true
		}
	}
	return "", false
}
