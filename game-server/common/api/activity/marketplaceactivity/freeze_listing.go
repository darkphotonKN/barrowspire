// Package marketplaceactivity is marketplace-service's half of the settlement
// activity contract (ADR-0019): the activity names the workflow schedules and the
// payloads it passes, for the steps marketplace itself owns and executes.
//
// Changes are additive only. Never remove a field, retype one, or change a JSON
// tag: Temporal replays live histories against these definitions.
//
// Several inputs here are a listing ID and nothing else. They stay separate types
// rather than one shared one: additive-only means each activity has to be able to
// grow a field without dragging the others' wire shape along with it.
package marketplaceactivity

import "github.com/google/uuid"

// FreezeListingActivityName is step 0a: the listing moves ACTIVE -> PENDING_SETTLEMENT
// and its winning bid is selected, in one transaction.
const FreezeListingActivityName = "FreezeListing"

// Outcome values for FreezeListingOutput.
const (
	// OutcomeHasWinner means a WINNING bid was selected and settlement proceeds.
	OutcomeHasWinner = "HAS_WINNER"
	// OutcomeNoBids means the auction ended with no bids. The workflow
	// short-circuits: the listing expires and the item goes back to its seller.
	OutcomeNoBids = "NO_BIDS"
)

type FreezeListingInput struct {
	ListingID uuid.UUID `json:"listing_id"`
}

// FreezeListingOutput carries everything the rest of the saga needs about the
// listing, so no later step has to read marketplace's tables to find it.
//
// On OutcomeNoBids the winner fields and Amount are unset: there is no winner to
// describe, and no step that would read them runs.
type FreezeListingOutput struct {
	Outcome        string    `json:"outcome"`
	ListingID      uuid.UUID `json:"listing_id"`
	ItemID         uuid.UUID `json:"item_id"`
	SellerID       uuid.UUID `json:"seller_id"`
	WinnerBidID    uuid.UUID `json:"winner_bid_id"`
	WinnerMemberID uuid.UUID `json:"winner_member_id"`
	Amount         int64     `json:"amount"`
}
