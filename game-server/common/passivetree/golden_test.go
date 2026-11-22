package passivetree

import (
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var updateTreeGolden = flag.Bool("update", false, "rewrite the passive tree golden the client is held to")

// treeGoldenPath is the definition as the client reads it (FS-8RZ51 R6): its
// structure and numbers, never its names. A deliberate change to the tree is
// `go test ./passivetree -run TestTree_MatchesTheGolden -update`, then the
// client's presentation copy until vitest is green again.
var treeGoldenPath = filepath.Join("..", "..", "..", "game-client", "src", "data", "passiveTree.golden.json")

type treeGolden struct {
	Nodes []Node `json:"nodes"`
	// PrimaryAttributes is each class's attributes a Might node raises
	// (FS-8RZ51 §Change: Tree v2 V14).
	PrimaryAttributes map[string][]Attribute `json:"primaryAttributes"`
}

// treeFromDefinition is the golden's shape filled from the definition: every
// class in order, each class's nodes in definition order (V1).
func treeFromDefinition() treeGolden {
	golden := treeGolden{Nodes: []Node{}, PrimaryAttributes: map[string][]Attribute{}}
	for _, class := range classes {
		golden.Nodes = append(golden.Nodes, Nodes(class)...)
		golden.PrimaryAttributes[class] = PrimaryAttributes(class)
	}
	return golden
}

// A value changed here without -update goes red here; one rewritten with
// -update goes red in the client until its copy follows.
func TestTree_MatchesTheGolden(t *testing.T) {
	got, err := json.MarshalIndent(treeFromDefinition(), "", "  ")
	require.NoError(t, err)
	got = append(got, '\n')

	if *updateTreeGolden {
		require.NoError(t, os.WriteFile(treeGoldenPath, got, 0o644))
	}

	want, err := os.ReadFile(treeGoldenPath)
	require.NoError(t, err, "read the passive tree golden (run with -update to write it)")
	assert.JSONEq(t, string(want), string(got), "the passive tree differs from %s: run with -update if intended, then bring the client in line", treeGoldenPath)
}
