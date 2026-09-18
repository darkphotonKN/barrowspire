package itemsactivity

import "github.com/google/uuid"

// TransferItemActivityName is step 4: the item moves from the seller to the buyer.
//
// Past the pivot, so it only rolls forward (ADR-0017). The buyer has already paid;
// an item that cannot be transferred escalates and parks until it can be.
const TransferItemActivityName = "TransferItem"

// TransferItemInput names the buyer by member, which is what the workflow already
// holds from FreezeListingOutput.WinnerMemberID. Wallet account IDs never reach
// this step.
type TransferItemInput struct {
	ItemID        uuid.UUID `json:"item_id"`
	BuyerMemberID uuid.UUID `json:"buyer_member_id"`
}
