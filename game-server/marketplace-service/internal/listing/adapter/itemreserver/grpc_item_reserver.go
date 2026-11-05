package itemreserver

import (
	"context"
	"fmt"
	"time"

	// "github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/durationpb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type GrpcItemReserver struct {
	client ItemReserverClient
}

func NewItemReserver(client ItemReserverClient) *GrpcItemReserver {
	return &GrpcItemReserver{
		client: client,
	}
}

// ReserveItem carries the listing terms along with the item: items-service
// echoes them on the ItemReserved event, which is what the listing is born from.
func (i *GrpcItemReserver) ReserveItem(ctx context.Context, itemID uuid.UUID, startPrice int, buyoutPrice *int, endsAt time.Time) (*pb.ReserveItemResponse, error) {
	req := &pb.ReserveItemRequest{
		ItemId:     itemID.String(),
		StartPrice: int64(startPrice),
		EndsAt:     timestamppb.New(endsAt),
	}
	// left unset rather than 0 when there is none, so the event says "no buyout"
	if buyoutPrice != nil {
		v := int64(*buyoutPrice)
		req.BuyoutPrice = &v
	}

	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing metadata")
	}
	vals := md.Get("authorization")
	if len(vals) == 0 {
		return nil, status.Error(codes.Unauthenticated, "missing authorization")
	}
	outCtx := metadata.AppendToOutgoingContext(
		ctx,
		"authorization", vals[0],
	)

	item, err := i.client.ReserveItem(outCtx, req)
	if err != nil {
		return nil, reserveError(itemID, err)
	}

	return item, nil
}

// reserveError translates items-service's answer into what the listing error
// mapping reads (FS-HBXZN R7–R9). items owns the rules, so a refusal it answers
// (ITEM_WORN, ITEM_NOT_AVAILABLE) is passed on as the same refusal and never
// restated here; not found stays not found; unreachable is transient. Anything
// else is wrapped with the item id and maps to Internal.
func reserveError(itemID uuid.UUID, err error) error {
	st := status.Convert(err)
	if reason, ok := errcode.RefusalReason(st); ok {
		return fmt.Errorf("reserve item %s: %w", itemID, errcode.Refuse(reason))
	}
	switch st.Code() {
	case codes.NotFound:
		return fmt.Errorf("reserve item %s: %w", itemID, commonconstants.ErrNotFound)
	case codes.Unavailable, codes.DeadlineExceeded:
		return fmt.Errorf("reserve item %s: %w: %w", itemID, commonconstants.ErrTransient, err)
	default:
		return fmt.Errorf("reserve item %s: %w", itemID, err)
	}
}

// The reconciler and backstop calls go out without a token: the worker runs on a
// background ticker with no request, and so no member, behind it. items-service
// lets them through for that reason (publicMethods in common/auth).

// ListStaleReserved reads one page of the reservations older than olderThan,
// after the keyset position after ("" for the first page) (FS-9BJCP Req 1). The
// age is sent rather than a cutoff, so items-service measures it on the clock
// that stamped the reservation.
func (i *GrpcItemReserver) ListStaleReserved(ctx context.Context, olderThan time.Duration, after string, limit int) (*pb.ListStaleReservedResponse, error) {
	return i.client.ListStaleReserved(ctx, &pb.ListStaleReservedRequest{
		OlderThan: durationpb.New(olderThan),
		After:     after,
		Limit:     int32(limit),
	})
}

// CancelReservation releases the reservation for listingID only.
func (i *GrpcItemReserver) CancelReservation(ctx context.Context, itemID, listingID uuid.UUID) (*pb.CancelReservationResponse, error) {
	return i.client.CancelReservation(ctx, &pb.CancelReservationRequest{
		ItemId:    itemID.String(),
		ListingId: listingID.String(),
	})
}

// ConfirmReservation marks the reservation for listingID as matched by its listing.
func (i *GrpcItemReserver) ConfirmReservation(ctx context.Context, itemID, listingID uuid.UUID) (*pb.ConfirmReservationResponse, error) {
	return i.client.ConfirmReservation(ctx, &pb.ConfirmReservationRequest{
		ItemId:    itemID.String(),
		ListingId: listingID.String(),
	})
}

// ReleaseConfirmedReservation hands the item back to its seller when it was
// confirmed for listingID and that listing will never exist (FS-04ZB6 Req 4).
// It goes out without a token, like the reconciler calls: the item.reserved
// consumer has no member behind it either.
func (i *GrpcItemReserver) ReleaseConfirmedReservation(ctx context.Context, itemID, listingID uuid.UUID) (*pb.ReleaseConfirmedReservationResponse, error) {
	return i.client.ReleaseConfirmedReservation(ctx, &pb.ReleaseConfirmedReservationRequest{
		ItemId:    itemID.String(),
		ListingId: listingID.String(),
	})
}

// ListConfirmedReservations reads one page of the reservations confirmed longer
// than olderThan ago, after the keyset position after ("" for the first page),
// for the confirmed-without-listing backstop (FS-04ZB6 Req 5, 12). Like the stale
// list it sends an age, so items measures it on the clock that stamped the
// confirmation, and it goes out without a token.
func (i *GrpcItemReserver) ListConfirmedReservations(ctx context.Context, olderThan time.Duration, after string, limit int) (*pb.ListConfirmedReservationsResponse, error) {
	return i.client.ListConfirmedReservations(ctx, &pb.ListConfirmedReservationsRequest{
		OlderThan: durationpb.New(olderThan),
		After:     after,
		Limit:     int32(limit),
	})
}
