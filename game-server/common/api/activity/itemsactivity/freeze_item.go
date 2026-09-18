// Package itemsactivity is items-service's half of the settlement activity
// contract (ADR-0019): the activity names the workflow schedules and the payloads
// it passes, for the steps items itself owns and executes.
//
// Changes are additive only. Never remove a field, retype one, or change a JSON
// tag: Temporal replays live histories against these definitions.
package itemsactivity

import "github.com/google/uuid"

// FreezeItemActivityName is step 0b: the item moves LISTED -> PENDING_SETTLEMENT,
// conditional on both its status and its owner still being the seller.
//
// items-service has its own PENDING_SETTLEMENT, distinct from the listing status
// of the same name that step 0a sets.
const FreezeItemActivityName = "FreezeItem"

// FreezeItemInput carries SellerID so the write can be conditional on ownership.
// An item that changed hands since the listing was made is a semantic
// impossibility, not something to retry.
type FreezeItemInput struct {
	ItemID   uuid.UUID `json:"item_id"`
	SellerID uuid.UUID `json:"seller_id"`
}
