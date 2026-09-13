package identity

import (
	"context"
)

type claimKey string

const (
	claimKeyMemberID  claimKey = "member_id"
	claimKeyAccountID claimKey = "account_id"
	claimKeyRole      claimKey = "role"
)

type Claims struct {
	MemberID  string
	AccountID string
	Role      string
}

// Claims extracts the member's id, role and account_id from context.
func ExtractClaims(ctx context.Context) (Claims, bool) {
	memberId, memberIdOk := ctx.Value(claimKeyMemberID).(string)
	if !memberIdOk {
		return Claims{}, false
	}

	// leave in the _, this form doesn't panic of the types don't match string
	accountId, _ := ctx.Value(claimKeyAccountID).(string)
	role, _ := ctx.Value(claimKeyRole).(string)

	return Claims{
		MemberID:  memberId,
		AccountID: accountId,
		Role:      role,
	}, true
}

// exposed setter for added claims to context
func EmbedClaims(ctx context.Context, c Claims) context.Context {
	ctx = context.WithValue(ctx, claimKeyMemberID, c.MemberID)
	ctx = context.WithValue(ctx, claimKeyAccountID, c.AccountID)
	ctx = context.WithValue(ctx, claimKeyRole, c.Role)

	return ctx
}
