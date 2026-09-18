package marketplaceactivity_test

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/activitytest"
	"github.com/darkphotonKN/barrowspire-server/common/api/activity/marketplaceactivity"
	"github.com/google/uuid"
)

func TestFreezeListingOutput_MatchesGolden(t *testing.T) {
	activitytest.Golden(t, "freeze_listing_output.json", marketplaceactivity.FreezeListingOutput{
		Outcome:        marketplaceactivity.OutcomeHasWinner,
		ListingID:      uuid.MustParse("11111111-1111-4111-8111-111111111111"),
		ItemID:         uuid.MustParse("22222222-2222-4222-8222-222222222222"),
		SellerID:       uuid.MustParse("33333333-3333-4333-8333-333333333333"),
		WinnerBidID:    uuid.MustParse("44444444-4444-4444-8444-444444444444"),
		WinnerMemberID: uuid.MustParse("55555555-5555-4555-8555-555555555555"),
		Amount:         250,
	})
}

func TestFreezeListingInput_MatchesGolden(t *testing.T) {
	activitytest.Golden(t, "freeze_listing_input.json", marketplaceactivity.FreezeListingInput{
		ListingID: uuid.MustParse("11111111-1111-4111-8111-111111111111"),
	})
}

func TestSetWinningBidInput_MatchesGolden(t *testing.T) {
	activitytest.Golden(t, "set_winning_bid_input.json", marketplaceactivity.SetWinningBidInput{
		ListingID:   uuid.MustParse("11111111-1111-4111-8111-111111111111"),
		WinnerBidID: uuid.MustParse("44444444-4444-4444-8444-444444444444"),
	})
}

func TestMarkSoldInput_MatchesGolden(t *testing.T) {
	activitytest.Golden(t, "mark_sold_input.json", marketplaceactivity.MarkSoldInput{
		ListingID: uuid.MustParse("11111111-1111-4111-8111-111111111111"),
	})
}

func TestRaiseSettlementExceptionInput_MatchesGolden(t *testing.T) {
	activitytest.Golden(t, "raise_settlement_exception_input.json", marketplaceactivity.RaiseSettlementExceptionInput{
		ListingID:  uuid.MustParse("11111111-1111-4111-8111-111111111111"),
		WorkflowID: "settlement-11111111-1111-4111-8111-111111111111",
		Step:       "CommitHold", // any step, including another service's
		Reason:     "wallet-service unavailable for 30m",
	})
}

func TestRaiseSettlementExceptionOutput_MatchesGolden(t *testing.T) {
	activitytest.Golden(t, "raise_settlement_exception_output.json", marketplaceactivity.RaiseSettlementExceptionOutput{
		ExceptionID: uuid.MustParse("77777777-7777-4777-8777-777777777777"),
	})
}

func TestMarkSettlementFailedInput_MatchesGolden(t *testing.T) {
	activitytest.Golden(t, "mark_settlement_failed_input.json", marketplaceactivity.MarkSettlementFailedInput{
		ListingID: uuid.MustParse("11111111-1111-4111-8111-111111111111"),
	})
}

func TestLoseAllBidsInput_MatchesGolden(t *testing.T) {
	activitytest.Golden(t, "lose_all_bids_input.json", marketplaceactivity.LoseAllBidsInput{
		ListingID: uuid.MustParse("11111111-1111-4111-8111-111111111111"),
	})
}
