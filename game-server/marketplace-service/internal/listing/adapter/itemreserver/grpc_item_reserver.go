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
func (i *GrpcItemReserver) ReserveItem(ctx context.Context, itemID uuid.UUID, startPrice int, endsAt time.Time) (*pb.ReserveItemResponse, error) {
	req := &pb.ReserveItemRequest{
		ItemId:     itemID.String(),
		StartPrice: int64(startPrice),
		EndsAt:     timestamppb.New(endsAt),
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

func (i *GrpcItemReserver) ListStaleReserved(ctx context.Context, reservedBefore time.Time) (*pb.ListStaleReservedResponse, error) {

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
	req := &pb.ListStaleReservedRequest{
		ReservedBefore: timestamppb.New(reservedBefore),
	}
	itemIds, err := i.client.ListStaleReserved(outCtx, req)
	if err != nil {
		return nil, err
	}

	return itemIds, nil
}

func (i *GrpcItemReserver) CancelReservation(ctx context.Context, itemID uuid.UUID) (*pb.CancelReservationResponse, error) {

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

	req := &pb.CancelReservationRequest{
		ItemId: itemID.String(),
	}
	items, err := i.client.CancelReservation(outCtx, req)
	if err != nil {
		return nil, err
	}

	return items, nil
}
