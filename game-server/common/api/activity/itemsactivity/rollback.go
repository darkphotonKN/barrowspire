package itemsactivity

import "github.com/google/uuid"

// UnfreezeItemActivityName is items' share of the pre-pivot rollback (Req 12):
// the item returns to AVAILABLE for its seller. Idempotent and retried without a
// cap, so a rollback never stops halfway.
//
// It is also how the zero-bids short-circuit ends (Req 8): no winner was found,
// so the item goes back exactly as a rollback would put it.
//
// The FS names this step by what it does, not by an activity name. The name is
// this package's; rename it here while nothing schedules it yet.
const UnfreezeItemActivityName = "UnfreezeItem"

// UnfreezeItemInput carries SellerID for the same reason FreezeItemInput does: the
// write is conditional on the item still belonging to the seller it was frozen for.
//
// ListingID scopes the write to this settlement's listing (FS-NXP1W §Req 24a): a
// release retried after the seller relisted the item must leave the new listing's
// item alone, and status alone cannot tell the two apart.
type UnfreezeItemInput struct {
	ItemID    uuid.UUID `json:"item_id"`
	SellerID  uuid.UUID `json:"seller_id"`
	ListingID uuid.UUID `json:"listing_id"`
}
