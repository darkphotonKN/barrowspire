package itemsactivity_test

import (
	"encoding/json"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/activitytest"
	"github.com/darkphotonKN/barrowspire-server/common/api/activity/itemsactivity"
	"github.com/google/uuid"
)

func TestFreezeItemInput_MatchesGolden(t *testing.T) {
	activitytest.Golden(t, "freeze_item_input.json", itemsactivity.FreezeItemInput{
		ItemID:    uuid.MustParse("22222222-2222-4222-8222-222222222222"),
		SellerID:  uuid.MustParse("33333333-3333-4333-8333-333333333333"),
		ListingID: uuid.MustParse("44444444-4444-4444-8444-444444444444"),
	})
}

// A 0b recorded before ListingID existed still has to decode: it replays with the
// zero listing, which items treats as unscoped rather than as a mismatch.
func TestFreezeItemInput_PayloadWithoutListingIDDecodesAsUnscoped(t *testing.T) {
	var in itemsactivity.FreezeItemInput
	err := json.Unmarshal([]byte(`{"item_id":"22222222-2222-4222-8222-222222222222","seller_id":"33333333-3333-4333-8333-333333333333"}`), &in)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if in.ListingID != uuid.Nil {
		t.Errorf("ListingID = %v, want uuid.Nil", in.ListingID)
	}
}

func TestTransferItemInput_MatchesGolden(t *testing.T) {
	activitytest.Golden(t, "transfer_item_input.json", itemsactivity.TransferItemInput{
		ItemID:        uuid.MustParse("22222222-2222-4222-8222-222222222222"),
		BuyerMemberID: uuid.MustParse("55555555-5555-4555-8555-555555555555"),
		ListingID:     uuid.MustParse("11111111-1111-4111-8111-111111111111"),
	})
}

func TestUnfreezeItemInput_MatchesGolden(t *testing.T) {
	activitytest.Golden(t, "unfreeze_item_input.json", itemsactivity.UnfreezeItemInput{
		ItemID:    uuid.MustParse("22222222-2222-4222-8222-222222222222"),
		SellerID:  uuid.MustParse("33333333-3333-4333-8333-333333333333"),
		ListingID: uuid.MustParse("44444444-4444-4444-8444-444444444444"),
	})
}
