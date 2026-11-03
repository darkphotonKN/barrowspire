package member_test

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/member"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/auth"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// errAbortSignup rolls the signup back once the outbox step has looked at it.
var errAbortSignup = errors.New("test: abort the signup transaction")

// inspectingOutbox reads what the signup wrote, from inside its transaction,
// then fails it. The transaction rolls back, so no member and no
// member.signedup row survive the test: nothing reaches a running outbox
// worker, and no wallet account is opened for a member that is about to go.
type inspectingOutbox struct {
	storedEmail  string
	payloadEmail string
}

func (o *inspectingOutbox) CreateOutbox(context.Context, commonoutbox.OutboxParams) error {
	return errors.New("test: signup must write its outbox row inside the transaction")
}

func (o *inspectingOutbox) CreateOutboxTx(ctx context.Context, tx *sqlx.Tx, params commonoutbox.OutboxParams) error {
	var payload commonconstants.MemberSignedUpEventPayload
	if err := json.Unmarshal(params.Payload, &payload); err != nil {
		return err
	}
	o.payloadEmail = payload.Email
	if err := tx.GetContext(ctx, &o.storedEmail, `SELECT email FROM members WHERE id = $1`, payload.UserID); err != nil {
		return err
	}
	return errAbortSignup
}

// FS-V6SFK §Requirements 6, §Acceptance Criteria: signup with
// "  Foo@Example.COM " stores the normalized form, and the event carries it too.
func TestCreateMember_StoresTheNormalizedEmail(t *testing.T) {
	db := authDB(t)
	outbox := &inspectingOutbox{}
	repo := member.NewRepository(db)
	svc := member.NewService(db, repo, nil, outbox, member.NewPasswordPolicy(testCommonList), member.NewCodeIssuer(repo, outbox, time.Now), nil)
	local := "Foo-" + uuid.NewString()

	_, err := svc.CreateMember(context.Background(), &pb.CreateMemberRequest{
		Name: "Delver", Email: "  " + local + "@Example.COM ", Password: "abcdefghij",
	})

	require.ErrorIs(t, err, errAbortSignup)
	want := strings.ToLower(local) + "@example.com"
	assert.Equal(t, want, outbox.storedEmail)
	assert.Equal(t, want, outbox.payloadEmail)
}

// FS-V6SFK §Requirements 9: a duplicate compared case-insensitively is still
// the duplicate path that answers 409 · ALREADY_EXISTS.
func TestCreateMember_CaseVariantOfATakenEmail_IsADuplicate(t *testing.T) {
	db := authDB(t)
	taken := seedMember(t, db) // seeded as "<id>@barrowspire.test"
	repo, outbox := member.NewRepository(db), &inspectingOutbox{}
	svc := member.NewService(db, repo, nil, outbox, member.NewPasswordPolicy(testCommonList), member.NewCodeIssuer(repo, outbox, time.Now), nil)

	_, err := svc.CreateMember(context.Background(), &pb.CreateMemberRequest{
		Name: "Delver", Email: strings.ToUpper(taken.String()) + "@BARROWSPIRE.test", Password: "abcdefghij",
	})

	assert.ErrorIs(t, err, commonconstants.ErrDuplicateResource)
}

// rollbackAfterVerificationOutbox writes every outbox row for real, then, once
// the member.verification_requested row is in, reads back what the signup
// wrote from inside its transaction and fails it. Nothing survives the test,
// so no running outbox worker ever sees these rows.
type rollbackAfterVerificationOutbox struct {
	real commonoutbox.OutboxPublisher

	routingKeys []string
	payload     commonconstants.MemberVerificationRequestedEventPayload
	storedHash  []byte
	pending     int // outbox rows for this member visible inside the tx
}

func (o *rollbackAfterVerificationOutbox) CreateOutbox(context.Context, commonoutbox.OutboxParams) error {
	return errors.New("test: signup must write its outbox rows inside the transaction")
}

func (o *rollbackAfterVerificationOutbox) CreateOutboxTx(ctx context.Context, tx *sqlx.Tx, params commonoutbox.OutboxParams) error {
	if err := o.real.CreateOutboxTx(ctx, tx, params); err != nil {
		return err
	}
	o.routingKeys = append(o.routingKeys, params.RoutingKey)
	if params.RoutingKey != commonconstants.MemberVerificationRequestedEvent {
		return nil
	}
	if err := json.Unmarshal(params.Payload, &o.payload); err != nil {
		return err
	}
	if err := tx.GetContext(ctx, &o.storedHash,
		`SELECT code_hash FROM verification_codes WHERE member_id = $1`, o.payload.MemberID); err != nil {
		return err
	}
	if err := tx.GetContext(ctx, &o.pending,
		`SELECT count(*) FROM outbox WHERE convert_from(payload, 'UTF8') LIKE '%' || $1 || '%'`, o.payload.MemberID); err != nil {
		return err
	}
	return errAbortSignup
}

// FS-V6SFK §Requirements 12, 14, 16, §Acceptance Criteria: a signup writes the
// member, member.signedup, the code row and member.verification_requested in
// one transaction. The stored code is a hash; the plaintext is only in the
// payload. A forced rollback leaves none of them behind.
func TestCreateMember_IssuesAVerificationCodeInTheSignupTransaction(t *testing.T) {
	db := authDB(t)
	outbox := &rollbackAfterVerificationOutbox{real: commonoutbox.NewService(commonoutbox.NewRepo(db))}
	repo := member.NewRepository(db)
	svc := member.NewService(db, repo, nil, outbox, member.NewPasswordPolicy(testCommonList), member.NewCodeIssuer(repo, outbox, time.Now), nil)
	email := "delver-" + uuid.NewString() + "@barrowspire.test"

	_, err := svc.CreateMember(context.Background(), &pb.CreateMemberRequest{
		Name: "Delver", Email: email, Password: "abcdefghij",
	})

	require.ErrorIs(t, err, errAbortSignup)
	assert.Equal(t, []string{commonconstants.MemberSignedUpEvent, commonconstants.MemberVerificationRequestedEvent}, outbox.routingKeys)
	assert.Equal(t, email, outbox.payload.Email)
	assert.Regexp(t, `^[0-9]{6}$`, outbox.payload.Code)
	want := sha256.Sum256([]byte(outbox.payload.MemberID + outbox.payload.Code))
	assert.Equal(t, want[:], outbox.storedHash, "the code row holds only the hash")
	assert.Equal(t, 2, outbox.pending, "both outbox rows were written in the transaction")

	var members, codes, rows int
	require.NoError(t, db.Get(&members, `SELECT count(*) FROM members WHERE email = $1`, email))
	require.NoError(t, db.Get(&codes, `SELECT count(*) FROM verification_codes WHERE member_id = $1`, outbox.payload.MemberID))
	require.NoError(t, db.Get(&rows, `SELECT count(*) FROM outbox WHERE convert_from(payload, 'UTF8') LIKE '%' || $1 || '%'`, outbox.payload.MemberID))
	assert.Zero(t, members, "member rolled back")
	assert.Zero(t, codes, "code row rolled back")
	assert.Zero(t, rows, "both outbox rows rolled back")
}
