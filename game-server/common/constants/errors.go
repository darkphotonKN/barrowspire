package commonconstants

import "errors"

/**
* All custom error types in the application, allowing for consistent
* reference to the same types of errors.
**/
var (
	ErrNotFound            = errors.New("resource not found")
	ErrInvalidInput        = errors.New("invalid input")
	ErrDuplicateResource   = errors.New("resource already exists")
	ErrConstraintViolation = errors.New("input does not follow column constraints")
	ErrForbidden           = errors.New("you do not have permission to access this resource")
	ErrUnauthorized        = errors.New("incorrect credentials entered during when attempting to authenticate")
	ErrTransient           = errors.New("transient error")
	// ErrLockUnavailable is a row lock that was not acquired inside the
	// transaction's lock_timeout. Contention, not a fault: the database is healthy
	// and another writer simply holds the row. Deliberately NOT ErrTransient — a
	// caller that took a row lock did so to avoid retrying contention, so this must
	// not feed a retry loop.
	ErrLockUnavailable      = errors.New("row lock not acquired in time")
	ErrInsufficientGold     = errors.New("insufficient available gold")
	ErrUUIDCouldNotBeParsed = errors.New("uuid could not be parsed")

	// game
	ErrGameDoesntExist = errors.New("game does not exist")

	// outbox
	ErrOutboxItemNotFound = errors.New("outbox item not found")

	// inbox (consumer-side idempotency)
	ErrAlreadyProcessed = errors.New("event already processed")
)
