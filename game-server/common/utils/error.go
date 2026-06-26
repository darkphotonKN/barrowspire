package commonhelpers

/*
Commonly shared error helpers utilities.
*/

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/lib/pq"
)

// WrapDBErr is the repo boundary translation point: it converts infrastructure
// errors (sql.ErrNoRows, duplicate keys, constraint violations, transient
// failures) into domain sentinels via analyzeDBErr, and wraps anything else
// with the repo name + operation for context. It never logs and never decides
// transport status.
//
// repoName - where the error occured, e.g. "users repo"
// op       - the operation that was attempted, e.g. "create user"
// err      - the error returned by the database call
func WrapDBErr(repoName string, op string, err error) error {
	if err == nil {
		return nil
	}

	// matches a sentinel error
	if sentinel := analyzeDBErr(err); sentinel != nil {
		// return only the sentinel
		return sentinel
	}

	// return with context wrapped
	return fmt.Errorf("error occured in %s during %s: %w", repoName, op, err)
}

/**
* Analyzes which type of custom error an error is and returns the
* appropriate sentinel error. If the error is an unexpected type then return
* nil and let WrapDBErr wrap it with context.
**/
func analyzeDBErr(err error) error {
	if err == nil {
		return nil
	}
	// match custom error types
	if IsDuplicateError(err) {
		return commonconstants.ErrDuplicateResource
	}
	if IsConstraintViolation(err) {
		return commonconstants.ErrConstraintViolation
	}
	if IsTransientError(err) {
		return commonconstants.ErrTransient
	}
	if errors.Is(err, sql.ErrNoRows) {
		return commonconstants.ErrNotFound
	}

	// unexpected errors
	return nil
}

/**
* Helper function to determine if an error is a "duplicate item" error,
* using the postgres unique_violation error code (23505).
**/
func IsDuplicateError(err error) bool {
	if err == nil {
		return false
	}

	var pqErr *pq.Error
	if errors.As(err, &pqErr) {
		return pqErr.Code == "23505"
	}

	return false
}

/**
* Helper function to determine if an error is from an attempt to insert without
* following column constraints, using postgres integrity-constraint error codes:
* 23514 check_violation, 23503 foreign_key_violation, 23502 not_null_violation.
* (23505 unique_violation is handled separately by IsDuplicateError.)
**/
func IsConstraintViolation(err error) bool {
	if err == nil {
		return false
	}

	var pqErr *pq.Error
	if errors.As(err, &pqErr) {
		switch pqErr.Code {
		case "23514", "23503", "23502":
			return true
		}
	}

	return false
}

/**
* Helper that determines if an error is considered a transient error, meaning we
* could retry consuming the event message and running the subsequent processes.
* Covers context cancellation/deadline, sql/driver connection errors, and the
* postgres serialization/deadlock/connection error codes.
**/
func IsTransientError(err error) bool {
	if err == nil {
		return false
	}

	// context errors
	contextErrors := errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled)

	// sql and sql driver errors
	sqlErrors := errors.Is(err, sql.ErrConnDone) || errors.Is(err, driver.ErrBadConn)

	// postgres specific errors
	isPgTransientErr := false
	var pqErr *pq.Error
	if errors.As(err, &pqErr) {
		switch pqErr.Code {
		// serialization_failure, deadlock_detected, cannot_connect_now, and the
		// connection exception class (08xxx)
		case "40001", "40P01", "57P03", "08000", "08003", "08006", "08001", "08004":
			isPgTransientErr = true
		}
	}

	return contextErrors || sqlErrors || isPgTransientErr
}
