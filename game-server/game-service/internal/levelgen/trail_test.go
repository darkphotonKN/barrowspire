package levelgen

import "testing"

// popNode removes only the newest node: truncating the node list at an older
// id would drop every node added after it. Asked for an older one, it refuses
// and changes nothing.
func TestPopNode_OlderThanTheNewest_ChangesNothing(t *testing.T) {
	b := newBuilder(ForestParams, 1)
	first := b.addNode(1, 1, -1)
	b.claim(b.block(1, 1), first)
	second := b.addNode(2, 1, first)
	b.claim(b.block(2, 1), second)

	if b.popNode(first) {
		t.Fatal("popped a node that is not the newest")
	}
	if len(b.nodes) != 2 || b.lattice[1*b.nx+1] != first || b.lattice[1*b.nx+2] != second {
		t.Fatalf("a refused pop changed the builder: %d nodes", len(b.nodes))
	}

	if !b.popNode(second) {
		t.Fatal("refused to pop the newest node")
	}
	if len(b.nodes) != 1 || b.lattice[1*b.nx+2] != -1 {
		t.Fatalf("the newest node was not removed: %d nodes", len(b.nodes))
	}
	for i, o := range b.owner {
		if o == second {
			t.Fatalf("cell %d is still carved by the popped node", i)
		}
	}
}
