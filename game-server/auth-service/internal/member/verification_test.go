package member_test

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/member"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeCodes records the code rows the issuer writes.
type fakeCodes struct {
	err     error
	written []member.VerificationCode
}

func (f *fakeCodes) UpsertVerificationCodeTx(ctx context.Context, tx *sqlx.Tx, code member.VerificationCode) error {
	if f.err != nil {
		return f.err
	}
	f.written = append(f.written, code)
	return nil
}

// fakeOutbox records the outbox rows the issuer writes.
type fakeOutbox struct {
	err     error
	written []commonoutbox.OutboxParams
}

func (f *fakeOutbox) CreateOutbox(context.Context, commonoutbox.OutboxParams) error {
	return errors.New("test: issuance must write its outbox row inside the caller's transaction")
}

func (f *fakeOutbox) CreateOutboxTx(ctx context.Context, tx *sqlx.Tx, params commonoutbox.OutboxParams) error {
	if f.err != nil {
		return f.err
	}
	f.written = append(f.written, params)
	return nil
}

func verificationPayload(t *testing.T, params commonoutbox.OutboxParams) commonconstants.MemberVerificationRequestedEventPayload {
	t.Helper()
	var payload commonconstants.MemberVerificationRequestedEventPayload
	require.NoError(t, json.Unmarshal(params.Payload, &payload))
	return payload
}

// FS-V6SFK §Requirements 11, 12, 13, 16. One issuance writes one code row
// holding only SHA-256(member id + code), valid for 15 minutes, and one
// member.verification_requested outbox row carrying the plaintext.
func TestIssueTx_WritesAHashedCodeAndTheEvent(t *testing.T) {
	codes, outbox := &fakeCodes{}, &fakeOutbox{}
	issuer := member.NewCodeIssuer(codes, outbox, time.Now)
	to := member.Recipient{MemberID: uuid.New(), Name: "Delver", Email: "delver@barrowspire.test"}
	before := time.Now()

	err := issuer.IssueTx(context.Background(), nil, to)

	require.NoError(t, err)
	require.Len(t, outbox.written, 1)
	require.Len(t, codes.written, 1)
	row, params := codes.written[0], outbox.written[0]
	payload := verificationPayload(t, params)

	assert.Equal(t, commonconstants.MemberVerificationRequestedEvent, params.RoutingKey)
	assert.Equal(t, commonconstants.AuthEventsExchange, params.Exchange)
	_, err = uuid.Parse(payload.EventID)
	assert.NoError(t, err, "event id is a uuid")
	assert.Equal(t, to.MemberID.String(), payload.MemberID)
	assert.Equal(t, to.Name, payload.Name)
	assert.Equal(t, to.Email, payload.Email)
	assert.Regexp(t, `^[0-9]{6}$`, payload.Code)

	want := sha256.Sum256([]byte(to.MemberID.String() + payload.Code))
	assert.Equal(t, to.MemberID, row.MemberID)
	assert.Equal(t, want[:], row.CodeHash, "only the hash of member id + code is stored")
	assert.NotContains(t, string(row.CodeHash), payload.Code)

	assert.False(t, row.IssuedAt.Before(before), "issued now")
	assert.Equal(t, 15*time.Minute, row.ExpiresAt.Sub(row.IssuedAt))
	assert.True(t, payload.ExpiresAt.Equal(row.ExpiresAt), "the mail states the stored expiry")
}

// FS-V6SFK §Requirements 14, 16: issuance runs in the caller's transaction, so
// any failure is returned for the caller to roll back, and a code row that
// failed to write never sends a mail.
func TestIssueTx_Failures(t *testing.T) {
	boom := errors.New("boom")
	tests := []struct {
		name       string
		codesErr   error
		outboxErr  error
		wantOutbox int
	}{
		{"code row fails: no event written", boom, nil, 0},
		{"outbox row fails: error returned", nil, boom, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			codes, outbox := &fakeCodes{err: tt.codesErr}, &fakeOutbox{err: tt.outboxErr}
			issuer := member.NewCodeIssuer(codes, outbox, time.Now)

			err := issuer.IssueTx(context.Background(), nil, member.Recipient{MemberID: uuid.New(), Name: "Delver", Email: "delver@barrowspire.test"})

			assert.ErrorIs(t, err, boom)
			assert.Len(t, outbox.written, tt.wantOutbox)
		})
	}
}
