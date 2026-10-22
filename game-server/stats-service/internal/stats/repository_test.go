package stats

import (
	"errors"
	"testing"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/lib/pq"
)

// A foreign-key violation keeps its SQLSTATE through the repo boundary, so the
// consumer can tell a reference that is not there yet from a malformed event,
// while still reading as a constraint violation to every other caller.
func TestWrapDBErr_ForeignKeyViolationKeepsSQLState(t *testing.T) {
	got := wrapDBErr("create match history", &pq.Error{Code: "23503"})

	if !errors.Is(got, commonconstants.ErrConstraintViolation) {
		t.Fatalf("%v is not a constraint violation", got)
	}
	var pqErr *pq.Error
	if !errors.As(got, &pqErr) || pqErr.Code != "23503" {
		t.Fatalf("%v lost its SQLSTATE 23503", got)
	}
	if o := classify(got); o.disposition != retryBounded {
		t.Fatalf("classified as %v, want %v", o.disposition, retryBounded)
	}
}

// Every other constraint violation is still only the sentinel, and rejected.
func TestWrapDBErr_OtherConstraintViolationIsRejected(t *testing.T) {
	got := wrapDBErr("create match history", &pq.Error{Code: "23502"})

	if !errors.Is(got, commonconstants.ErrConstraintViolation) {
		t.Fatalf("%v is not a constraint violation", got)
	}
	if o := classify(got); o.disposition != reject {
		t.Fatalf("classified as %v, want %v", o.disposition, reject)
	}
}
