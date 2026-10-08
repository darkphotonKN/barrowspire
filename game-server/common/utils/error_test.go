package commonhelpers

import (
	"errors"
	"testing"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/lib/pq"
	"github.com/stretchr/testify/assert"
)

// A row lock that times out is contention, not a fault: the database is healthy and
// somebody else simply got there first. It needs its own sentinel so callers can tell
// it apart from ErrTransient, because the two want opposite handling — a transient
// failure is worth retrying, a lock timeout is what a caller chose a row lock to
// avoid retrying.
func TestWrapDBErr_LockTimeout_IsItsOwnSentinel(t *testing.T) {
	// 55P03 lock_not_available, what SET LOCAL lock_timeout raises
	err := WrapDBErr("listing", "Modify", &pq.Error{Code: "55P03"})

	assert.ErrorIs(t, err, commonconstants.ErrLockUnavailable)
	assert.NotErrorIs(t, err, commonconstants.ErrTransient,
		"a lock timeout must not be retried as though the database had blipped")
}

// The codes that DO mean the database or connection is in trouble stay transient, so
// adding the lock-timeout case must not have swallowed them.
func TestWrapDBErr_TransientCodesAreUnaffected(t *testing.T) {
	for _, code := range []pq.ErrorCode{"40001", "40P01", "57P03", "08006"} {
		err := WrapDBErr("listing", "Modify", &pq.Error{Code: code})

		assert.ErrorIs(t, err, commonconstants.ErrTransient, "code %s", code)
		assert.NotErrorIs(t, err, commonconstants.ErrLockUnavailable, "code %s", code)
	}
}

// An error nobody recognises must keep its cause rather than being flattened into a
// sentinel that says something untrue about it.
func TestWrapDBErr_UnknownError_KeepsItsCause(t *testing.T) {
	cause := errors.New("something nobody classified")

	err := WrapDBErr("listing", "Modify", cause)

	assert.ErrorIs(t, err, cause)
	assert.NotErrorIs(t, err, commonconstants.ErrLockUnavailable)
	assert.NotErrorIs(t, err, commonconstants.ErrTransient)
}
