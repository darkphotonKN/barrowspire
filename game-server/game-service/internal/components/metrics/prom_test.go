package metrics

import (
	"go/ast"
	"go/parser"
	"go/token"
	"strconv"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Every Action constant must be a known type, or its messages are lumped
// under "other" on the dashboard.
func TestKnownActionsCoverConstants(t *testing.T) {
	file, err := parser.ParseFile(token.NewFileSet(), "../../../common/constants/game.go", nil, 0)
	require.NoError(t, err)

	found := 0
	ast.Inspect(file, func(n ast.Node) bool {
		spec, ok := n.(*ast.ValueSpec)
		if !ok {
			return true
		}
		ident, ok := spec.Type.(*ast.Ident)
		if !ok || ident.Name != "Action" {
			return true
		}
		for _, v := range spec.Values {
			lit, ok := v.(*ast.BasicLit)
			require.True(t, ok, "Action constant %s is not a string literal", spec.Names[0])
			action, err := strconv.Unquote(lit.Value)
			require.NoError(t, err)
			found++
			assert.Contains(t, knownActions, action, "add constants.%s to knownActions", spec.Names[0])
		}
		return true
	})
	require.NotZero(t, found, "no Action constants parsed; has the file moved?")
}

func TestWSType(t *testing.T) {
	cases := []struct{ action, want string }{
		{"move", "move"},
		{"queue_status", "queue_status"},
		{TypeState, TypeState},
		{TypeMalformed, TypeMalformed},
		{"", TypeOther},
		{"drop table players", TypeOther},
	}
	for _, tc := range cases {
		assert.Equal(t, tc.want, wsType(tc.action), "action %q", tc.action)
	}
}
