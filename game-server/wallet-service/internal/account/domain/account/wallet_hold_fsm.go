package account

import "time"

// Finite State Machine is the white list legal move transitions for wallet_holds.
var validHoldTransitions = map[WalletHoldStatus]map[WalletHoldStatus]struct{}{
	StatusReserved: {StatusCommitted: {}, StatusReleased: {}},
}

// reports if a state transition is allowed
func canTransition(from, to WalletHoldStatus) bool {
	// check its even a valid start
	validMap, ok := validHoldTransitions[from]
	if !ok {
		return false
	}
	_, ok = validMap[to]
	return ok
}

// makes the transition by checking the FSM guard
func (h *WalletHold) transitionTo(to WalletHoldStatus, now time.Time) error {
	if !canTransition(h.status, to) {
		return ErrInvalidHoldTransition
	}

	h.status = to
	h.updatedAt = now
	return nil
}
