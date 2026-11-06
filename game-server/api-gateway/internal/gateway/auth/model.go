package auth

import (
	"context"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/auth"
)

type AuthClient interface {
	CreateMember(ctx context.Context, req *pb.CreateMemberRequest) (*pb.Member, error)
	GetMember(ctx context.Context, req *pb.GetMemberRequest) (*pb.Member, error)
	LoginMember(ctx context.Context, req *pb.LoginRequest) (*pb.LoginResponse, error)
	UpdateMemberInfo(ctx context.Context, req *pb.UpdateMemberInfoRequest) (*pb.Member, error)
	UpdateMemberPassword(ctx context.Context, req *pb.UpdatePasswordRequest) (*pb.UpdatePasswordResponse, error)
	ValidateToken(ctx context.Context, req *pb.ValidateTokenRequest) (*pb.ValidateTokenResponse, error)
	VerifyEmail(ctx context.Context, req *pb.VerifyEmailRequest) (*pb.LoginResponse, error)
	ResendVerification(ctx context.Context, req *pb.ResendVerificationRequest) (*pb.ResendVerificationResponse, error)
	ChangeUnverifiedEmail(ctx context.Context, req *pb.ChangeUnverifiedEmailRequest) (*pb.Member, error)
	RefreshAccessToken(ctx context.Context, req *pb.RefreshAccessTokenRequest) (*pb.RefreshAccessTokenResponse, error)
}
