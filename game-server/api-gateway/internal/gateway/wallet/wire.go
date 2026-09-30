package wallet

import pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/wallet"

// WalletAccount is the signed-in member's gold balance (FS-8EGFA §API surface).
//
// No omitempty anywhere: a zero is a real balance, and the gin handler this
// replaces dropped zeros from the wire. No account id, member id or timestamps;
// the account is always the caller's own.
type WalletAccount struct {
	Gold          int64 `json:"gold" doc:"Total gold on the account."`
	HeldGold      int64 `json:"heldGold" doc:"Gold reserved by open bids."`
	AvailableGold int64 `json:"availableGold" doc:"Gold spendable now: gold minus heldGold."`
}

func walletAccountFromProto(res *pb.GetAccountResponse) WalletAccount {
	return WalletAccount{
		Gold:          res.GetGold(),
		HeldGold:      res.GetHeldGold(),
		AvailableGold: res.GetAvailableGold(),
	}
}
