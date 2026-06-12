package auth

import (
	"context"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/auth"
)

type AuthClient interface {
	GetMember(ctx context.Context, req *pb.GetMemberRequest) (*pb.Member, error)
}
