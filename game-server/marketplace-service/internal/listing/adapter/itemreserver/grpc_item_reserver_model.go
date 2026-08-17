package itemreserver

import (
	"context"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
)

type ItemReserverClient interface {
	ReserveItem(ctx context.Context, req *pb.ReserveItemRequest) (*pb.ReserveItemResponse, error)
	ListStaleReserved(ctx context.Context, req *pb.ListStaleReservedRequest) (*pb.ListStaleReservedResponse, error)
	CancelReservation(ctx context.Context, req *pb.CancelReservationRequest) (*pb.CancelReservationResponse, error)
}
