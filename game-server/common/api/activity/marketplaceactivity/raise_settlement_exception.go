package marketplaceactivity

import "github.com/google/uuid"

// RaiseSettlementExceptionActivityName records the durable, human-facing reason a
// settlement parked or rolled back, and publishes settlement.failed through
// marketplace's outbox (ADR-0018).
//
// It runs on the marketplace queue with unlimited retry: it is the step that
// reports every other step's exhaustion, so it has nothing to escalate to.
const RaiseSettlementExceptionActivityName = "RaiseSettlementException"

type RaiseSettlementExceptionInput struct {
	ListingID  uuid.UUID `json:"listing_id"`
	WorkflowID string    `json:"workflow_id"`
	// Step is the activity that exhausted its retries, named as the workflow
	// schedules it. It spans services, so it is a plain name and not one of this
	// package's constants.
	Step   string `json:"step"`
	Reason string `json:"reason"`
}

type RaiseSettlementExceptionOutput struct {
	ExceptionID uuid.UUID `json:"exception_id"`
}
