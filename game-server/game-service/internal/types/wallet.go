package types

import "errors"

// What a wallet debit's failure means to the run (FS-9JV5K §B R9-R10). The
// wallet client returns these, wrapped, for the codes wallet-service answers
// with; anything else is a plain error, a failure after the debit may have
// committed, which the run reads as an outcome unknown.
var (
	// ErrNotEnoughGold is a debit refused because the member's available
	// gold, gold held in bids excluded, is below the amount
	ErrNotEnoughGold = errors.New("not enough available gold")
	// ErrNoWallet is a debit for a member with no wallet account
	ErrNoWallet = errors.New("no wallet account")
	// ErrWalletTransient is a debit that may land if made again with the same
	// key: the wallet was unavailable, the call ran out of time, or it was
	// aborted on a write conflict
	ErrWalletTransient = errors.New("wallet unavailable, try again")
	// ErrWalletRefused is a debit the wallet turned away before touching any
	// balance: the call was unauthenticated or malformed. Nothing was taken
	ErrWalletRefused = errors.New("wallet refused the call, nothing taken")
)
