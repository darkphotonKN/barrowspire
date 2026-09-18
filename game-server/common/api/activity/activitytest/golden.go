// Package activitytest holds the golden-JSON guard ADR-0019 puts in place of a
// schema tool. An activity payload's serialized shape is pinned to a committed
// fixture, so renaming a field or retyping one fails a test rather than a
// workflow that is already past its pivot.
package activitytest

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// Golden pins v's wire shape to testdata/name, in both directions.
//
// Encoding catches a renamed tag or a retyped field on the way out. Decoding the
// fixture back catches the failure that actually costs money: Temporal replays
// histories recorded months ago against today's struct definitions, so a payload
// written under the old shape still has to land intact in the new one.
func Golden[T any](t *testing.T, name string, v T) {
	t.Helper()

	path := filepath.Join("testdata", name)
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read fixture: %s", err)
	}

	got, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		t.Fatalf("marshal %T: %s", v, err)
	}
	got = append(got, '\n')

	if !bytes.Equal(got, want) {
		t.Errorf("%T no longer serializes to %s\n--- got ---\n%s--- want ---\n%s", v, path, got, want)
	}

	var back T
	if err := json.Unmarshal(want, &back); err != nil {
		t.Fatalf("%s no longer decodes into %T: %s", path, v, err)
	}
	if !reflect.DeepEqual(back, v) {
		t.Errorf("%s decoded into %T lost data\n got: %+v\nwant: %+v", path, v, back, v)
	}
}
