package usecase

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// insertCapturingRepo records the listing handed to Insert and answers insertErr.
type insertCapturingRepo struct {
	listing.Repository
	inserted  *listing.Listing
	inserts   int
	insertErr error
	// gotDeadline is the deadline Insert ran under; zero when it had none
	gotDeadline time.Time
}

func (r *insertCapturingRepo) Insert(ctx context.Context, l *listing.Listing) error {
	r.inserts++
	r.gotDeadline, _ = ctx.Deadline()
	if r.insertErr != nil {
		return r.insertErr
	}
	r.inserted = l
	return nil
}

// fakeReservation stands in for items: what confirm and release answer, and
// which reservation each was asked about.
type fakeReservation struct {
	confirmed  bool
	confirmErr error
	released   bool
	releaseErr error

	confirms   int
	releases   int
	gotConfirm [2]uuid.UUID
	gotRelease [2]uuid.UUID
}

func (f *fakeReservation) ConfirmReservation(ctx context.Context, itemID, listingID uuid.UUID) (*pb.ConfirmReservationResponse, error) {
	f.confirms++
	f.gotConfirm = [2]uuid.UUID{itemID, listingID}
	if f.confirmErr != nil {
		return nil, f.confirmErr
	}
	return &pb.ConfirmReservationResponse{Confirmed: f.confirmed}, nil
}

func (f *fakeReservation) ReleaseConfirmedReservation(ctx context.Context, itemID, listingID uuid.UUID) (*pb.ReleaseConfirmedReservationResponse, error) {
	f.releases++
	f.gotRelease = [2]uuid.UUID{itemID, listingID}
	if f.releaseErr != nil {
		return nil, f.releaseErr
	}
	return &pb.ReleaseConfirmedReservationResponse{Released: f.released}, nil
}

func validCreateCommand() *CreateListingCommand {
	now := time.Now()
	return &CreateListingCommand{
		ListingID:  uuid.New(),
		SellerID:   uuid.New(),
		ItemID:     uuid.New(),
		StartPrice: 100,
		Now:        now,
		EndsAt:     now.Add(time.Hour),
	}
}

// The listing written is the one the reservation named (FS-NXP1W Req 24a), and
// it is born ACTIVE once items confirms the reservation (FS-04ZB6 Req 7).
func TestCreateListingUC_InsertsListingWithCommandID(t *testing.T) {
	repo := &insertCapturingRepo{}
	items := &fakeReservation{confirmed: true}
	cmd := validCreateCommand()

	require.NoError(t, NewCreateListingUC(repo, items).Handle(context.Background(), cmd))

	require.NotNil(t, repo.inserted)
	assert.Equal(t, cmd.ListingID, repo.inserted.Snapshot().ID)
	assert.Equal(t, listing.StatusActive, repo.inserted.Snapshot().Status)
	assert.Equal(t, [2]uuid.UUID{cmd.ItemID, cmd.ListingID}, items.gotConfirm, "confirm names the item and its listing")
	assert.Zero(t, items.releases)
}

// The buyout price on the reservation event is the one the listing is born
// with (FS-9XKS6 Req 7).
func TestCreateListingUC_BirthsListingWithBuyoutPrice(t *testing.T) {
	repo := &insertCapturingRepo{}
	buyout := 400
	cmd := validCreateCommand()
	cmd.BuyoutPrice = &buyout

	err := NewCreateListingUC(repo, &fakeReservation{confirmed: true}).Handle(context.Background(), cmd)

	require.NoError(t, err)
	require.NotNil(t, repo.inserted.Snapshot().BuyoutPrice)
	assert.Equal(t, 400, *repo.inserted.Snapshot().BuyoutPrice)
}

// Terms the listing refuses are refused before items is asked anything: the
// reservation stays waiting, and the reconciler cancels it (ADR-0050 rule 1).
func TestCreateListingUC_RefusedTermsNeverConfirm(t *testing.T) {
	repo := &insertCapturingRepo{}
	items := &fakeReservation{confirmed: true}
	cmd := validCreateCommand()
	cmd.StartPrice = 0

	err := NewCreateListingUC(repo, items).Handle(context.Background(), cmd)

	require.ErrorIs(t, err, listing.ErrInvalidStartPrice)
	assert.Zero(t, items.confirms, "confirm must not be called for refused terms")
	assert.Zero(t, repo.inserts)
}

// The item is no longer reserved for this listing (cancelled, relisted, or past
// LISTED): the event is dropped, nothing is written (FS-04ZB6 Req 7.2).
func TestCreateListingUC_UnconfirmedReservationInsertsNothing(t *testing.T) {
	repo := &insertCapturingRepo{}
	items := &fakeReservation{confirmed: false}

	err := NewCreateListingUC(repo, items).Handle(context.Background(), validCreateCommand())

	require.NoError(t, err)
	assert.Zero(t, repo.inserts)
	assert.Zero(t, items.releases)
}

// A confirm that never got an answer decided nothing: no insert, and the
// failure is transient so the event is redelivered.
func TestCreateListingUC_ConfirmTransportFailureIsTransient(t *testing.T) {
	repo := &insertCapturingRepo{}
	items := &fakeReservation{confirmErr: errors.New("rpc error: code = Unavailable")}

	err := NewCreateListingUC(repo, items).Handle(context.Background(), validCreateCommand())

	require.ErrorIs(t, err, commonconstants.ErrTransient)
	assert.Zero(t, repo.inserts)
	assert.Zero(t, items.releases)
}

// A redelivery after the listing landed confirms again (idempotent) and meets
// the listing's own primary key: a replay, so success, and the item is kept.
func TestCreateListingUC_ReplayIsSuccess(t *testing.T) {
	repo := &insertCapturingRepo{insertErr: fmt.Errorf("listing insert: %w", listing.ErrListingAlreadyExists)}
	items := &fakeReservation{confirmed: true}

	err := NewCreateListingUC(repo, items).Handle(context.Background(), validCreateCommand())

	require.NoError(t, err)
	assert.Zero(t, items.releases, "a replay must never release the item")
}

// After a successful confirm, an insert that was definitely refused releases the
// confirmed item, and the failure stays a refusal so the event is dead-lettered
// (FS-04ZB6 Req 9, 10).
func TestCreateListingUC_DefiniteInsertRefusalReleases(t *testing.T) {
	tests := []struct {
		name     string
		insert   error
		released bool
	}{
		{"another listing holds the item (idx_one_active_listing_per_item)", commonconstants.ErrDuplicateResource, true},
		{"schema constraint", commonconstants.ErrConstraintViolation, true},
		{"release matches nothing", commonconstants.ErrDuplicateResource, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &insertCapturingRepo{insertErr: tt.insert}
			items := &fakeReservation{confirmed: true, released: tt.released}
			cmd := validCreateCommand()

			err := NewCreateListingUC(repo, items).Handle(context.Background(), cmd)

			require.ErrorIs(t, err, tt.insert, "the refusal stays readable, so the event is dead-lettered")
			assert.NotErrorIs(t, err, commonconstants.ErrTransient)
			assert.NotErrorIs(t, err, listing.ErrListingAlreadyExists)
			assert.Equal(t, 1, items.releases)
			assert.Equal(t, [2]uuid.UUID{cmd.ItemID, cmd.ListingID}, items.gotRelease)
		})
	}
}

// An insert whose outcome is unknown may have landed: releasing could free an
// item under a live listing, so it is never released, only retried (ADR-0050
// rule 4).
func TestCreateListingUC_UnknownInsertOutcomeNeverReleases(t *testing.T) {
	for _, insertErr := range []error{
		fmt.Errorf("insert: %w", commonconstants.ErrTransient),
		errors.New("driver: bad connection during COMMIT"),
		context.DeadlineExceeded,
	} {
		repo := &insertCapturingRepo{insertErr: insertErr}
		items := &fakeReservation{confirmed: true, released: true}

		err := NewCreateListingUC(repo, items).Handle(context.Background(), validCreateCommand())

		require.Error(t, err)
		assert.ErrorIs(t, err, insertErr)
		assert.Zero(t, items.releases, "unknown outcome %v must not release", insertErr)
	}
}

// The insert runs under its own deadline, so a hung database cannot stretch the
// gap between confirm and insert toward the backstop's 10-minute grace. A
// timeout is an unknown outcome like any other: requeued, never released (the
// unknown-outcome test above holds context.DeadlineExceeded).
func TestCreateListingUC_InsertRunsUnderADeadline(t *testing.T) {
	repo := &insertCapturingRepo{}
	before := time.Now()

	require.NoError(t, NewCreateListingUC(repo, &fakeReservation{confirmed: true}).Handle(context.Background(), validCreateCommand()))

	require.False(t, repo.gotDeadline.IsZero(), "Insert must run under a deadline")
	assert.False(t, repo.gotDeadline.After(before.Add(listingInsertTimeout).Add(time.Second)))
	assert.Less(t, listingInsertTimeout, confirmedReservationGrace, "the insert gives up long before the backstop's grace")
}

// A release that never got an answer decided nothing either: the failure is
// transient, and must not read as the insert's refusal, or the event would be
// dead-lettered with the item still LISTED.
func TestCreateListingUC_ReleaseTransportFailureIsTransient(t *testing.T) {
	repo := &insertCapturingRepo{insertErr: commonconstants.ErrDuplicateResource}
	items := &fakeReservation{confirmed: true, releaseErr: errors.New("rpc error: code = Unavailable")}

	err := NewCreateListingUC(repo, items).Handle(context.Background(), validCreateCommand())

	require.ErrorIs(t, err, commonconstants.ErrTransient)
	assert.NotErrorIs(t, err, commonconstants.ErrDuplicateResource)
	assert.Equal(t, 1, items.releases)
}

// The duration bound is checked when the seller lists, not here: ItemReserved
// may be consumed minutes later, and a valid one-hour listing must still be born
// when its end is now under the minimum (FS-XEDFF Req 2).
func TestCreateListingUC_LateEventStillCreatesTheListing(t *testing.T) {
	repo := &insertCapturingRepo{}
	now := time.Now()

	err := NewCreateListingUC(repo, &fakeReservation{confirmed: true}).Handle(context.Background(), &CreateListingCommand{
		ListingID:  uuid.New(),
		SellerID:   uuid.New(),
		ItemID:     uuid.New(),
		StartPrice: 100,
		Now:        now,
		EndsAt:     now.Add(30 * time.Minute),
	})

	require.NoError(t, err)
	require.NotNil(t, repo.inserted)
}
