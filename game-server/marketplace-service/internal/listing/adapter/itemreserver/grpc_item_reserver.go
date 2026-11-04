package itemreserver

import (
	"context"
	"fmt"
	"time"

	// "github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
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
		switch status.Code(err) {
		case codes.Unavailable, codes.DeadlineExceeded:
			return nil, fmt.Errorf("reserve item %s: %w: %w", itemID, commonconstants.ErrTransient, err)
		default:
			return nil, err
		}
	}

	return item, nil
}

// The three reconciler calls go out without a token: the worker runs on a
// background ticker with no request, and so no member, behind it. items-service
// lets them through for that reason (publicMethods in common/auth).

// ListStaleReserved asks for the reservations older than olderThan. The age is
// sent rather than a cutoff, so items-service measures it on the clock that
// stamped the reservation.
func (i *GrpcItemReserver) ListStaleReserved(ctx context.Context, olderThan time.Duration) (*pb.ListStaleReservedResponse, error) {
	return i.client.ListStaleReserved(ctx, &pb.ListStaleReservedRequest{
		OlderThan: durationpb.New(olderThan),
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
