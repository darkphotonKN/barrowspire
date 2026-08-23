package wallet

import (
	"context"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/wallet"
)

type WalletClient interface {
	CreateAccount(ctx context.Context, req *pb.CreateAccountRequest) (*pb.CreateAccountResponse, error)
	GetAccount(ctx context.Context, req *pb.GetAccountRequest) (*pb.GetAccountResponse, error)
	Deposit(ctx context.Context, req *pb.DepositRequest) (*pb.DepositResponse, error)
	Withdraw(ctx context.Context, req *pb.WithdrawRequest) (*pb.WithdrawResponse, error)
}
