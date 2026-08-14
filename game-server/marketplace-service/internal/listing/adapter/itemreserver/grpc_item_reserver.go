package itemreserver

import (
	"context"
	"log/slog"
	"time"

	// "github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
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

func (i *GrpcItemReserver) ReserveItem(ctx context.Context, itemID uuid.UUID) (*pb.ReserveItemResponse, error) {
	req := &pb.ReserveItemRequest{
		ItemId: itemID.String(),
	}

	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing metadata")
	}
	vals := md.Get("authorization")
	if len(vals) == 0 {
		return nil, status.Error(codes.Unauthenticated, "missing authorization")
	}
	slog.Info("vals[0]", "vals[0]", vals[0])
	outCtx := metadata.AppendToOutgoingContext(
		ctx,
		"authorization", vals[0],
	)

	item, err := i.client.ReserveItem(outCtx, req)
	if err != nil {
		return nil, err
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
	slog.Info("vals[0]", "vals[0]", vals[0])
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
	slog.Info("vals[0]", "vals[0]", vals[0])
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
