package ledger

import "errors"

// --- Errors ---
var (
	ErrInvalidUUID           = errors.New("invalid uuid")
	ErrUnbalancedTransaction = errors.New("unbalanced transaction")
	ErrInvalidLegCount       = errors.New("invalid leg count")
	ErrInvalidLegAmount      = errors.New("invalid leg amount")
	ErrInvalidDirection      = errors.New("invalid direction")
	ErrInvalidCurrency       = errors.New("invalid currency")
	ErrInvalidReason         = errors.New("invalid reason")
)
