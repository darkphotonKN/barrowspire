package mailbox

import (
	"context"
	"errors"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/notification"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type fakeService struct {
	calls int

	gotCaller commonauth.Identity
	gotDraft  LetterDraft
	sent      *SentLetters

	gotMember uuid.UUID
	gotLetter uuid.UUID
	letters   []MailboxLetter
	summary   Summary

	err error
}

func (f *fakeService) SendLetter(_ context.Context, caller commonauth.Identity, d LetterDraft) (*SentLetters, error) {
	f.calls++
	f.gotCaller, f.gotDraft = caller, d
	return f.sent, f.err
}

func (f *fakeService) ListLetters(_ context.Context, member uuid.UUID) ([]MailboxLetter, error) {
	f.calls++
	f.gotMember = member
	return f.letters, f.err
}

func (f *fakeService) MailboxSummary(_ context.Context, member uuid.UUID) (Summary, error) {
	f.calls++
	f.gotMember = member
	return f.summary, f.err
}

func (f *fakeService) MarkLetterRead(_ context.Context, letterID, member uuid.UUID) error {
	f.calls++
	f.gotLetter, f.gotMember = letterID, member
	return f.err
}

func as(id commonauth.Identity) context.Context {
	return commonauth.EmbedIdentity(context.Background(), id)
}

func sendRequest(recipient *pb.LetterRecipient, enclosures ...*pb.EnclosureRequest) *pb.SendLetterRequest {
	return &pb.SendLetterRequest{Recipient: recipient, Title: "Hail", Body: "Well met.", Enclosures: enclosures}
}

func memberRecipient(id string) *pb.LetterRecipient {
	return &pb.LetterRecipient{Target: &pb.LetterRecipient_MemberId{MemberId: id}}
}

func listRecipient(ids ...string) *pb.LetterRecipient {
	return &pb.LetterRecipient{Target: &pb.LetterRecipient_Members{Members: &pb.MemberList{MemberIds: ids}}}
}

var allRecipient = &pb.LetterRecipient{Target: &pb.LetterRecipient_AllMembers{AllMembers: true}}

func TestHandlerSendLetter_TranslatesTheRequestAndAnswersTheStoredLetters(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	tmpl, source := uuid.New(), uuid.New()
	expiry := now.Add(72 * time.Hour)
	first, second := uuid.New(), uuid.New()
	svc := &fakeService{sent: &SentLetters{
		Letters:   []SentLetter{{LetterID: first, MemberID: &a}, {LetterID: second, MemberID: &b}},
		ExpiresAt: expiry,
	}}

	req := sendRequest(listRecipient(a.String(), b.String(), a.String()),
		&pb.EnclosureRequest{Kind: &pb.EnclosureRequest_Template{Template: &pb.TemplateEnclosureRequest{TemplateId: tmpl.String(), Quantity: 3}}},
		&pb.EnclosureRequest{Kind: &pb.EnclosureRequest_Template{Template: &pb.TemplateEnclosureRequest{TemplateId: tmpl.String(), Quantity: 1, ItemLevel: proto.Int32(40)}}},
		&pb.EnclosureRequest{Kind: &pb.EnclosureRequest_Copy{Copy: &pb.CopyEnclosureRequest{InstanceId: source.String(), Quantity: 2}}},
		&pb.EnclosureRequest{Kind: &pb.EnclosureRequest_Gold{Gold: 500}},
	)
	req.ExpiresAt = timestamppb.New(expiry)

	res, err := NewHandler(svc).SendLetter(as(admin), req)
	require.NoError(t, err)

	assert.Equal(t, admin, svc.gotCaller, "the caller is the token's")
	assert.Equal(t, LetterDraft{
		Recipient: Recipient{Kind: RecipientMemberList, MemberIDs: []uuid.UUID{a, b, a}},
		Title:     "Hail",
		Body:      "Well met.",
		Enclosures: []EnclosureRequest{
			{Kind: RequestTemplate, TemplateID: tmpl, Quantity: 3},
			{Kind: RequestTemplate, TemplateID: tmpl, Quantity: 1, ItemLevel: ptr(int32(40))},
			{Kind: RequestCopy, CopyOf: source, Quantity: 2},
			{Kind: RequestGold, Gold: 500},
		},
		ExpiresAt: &expiry,
	}, svc.gotDraft)

	require.Len(t, res.GetLetters(), 2)
	assert.Equal(t, first.String(), res.GetLetters()[0].GetLetterId())
	assert.Equal(t, a.String(), res.GetLetters()[0].GetMemberId())
	assert.Equal(t, b.String(), res.GetLetters()[1].GetMemberId())
	assert.True(t, res.GetExpiresAt().AsTime().Equal(expiry))
}

func TestHandlerSendLetter_RecipientForms(t *testing.T) {
	member := uuid.New()
	cases := []struct {
		name      string
		recipient *pb.LetterRecipient
		want      Recipient
	}{
		{"one member", memberRecipient(member.String()), Recipient{Kind: RecipientMember, MemberIDs: []uuid.UUID{member}}},
		{"every member", allRecipient, Recipient{Kind: RecipientAllMembers}},
		{"an empty list reaches the rule", listRecipient(), Recipient{Kind: RecipientMemberList, MemberIDs: []uuid.UUID{}}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc := &fakeService{sent: &SentLetters{Letters: []SentLetter{{LetterID: uuid.New()}}, ExpiresAt: now}}
			res, err := NewHandler(svc).SendLetter(as(admin), sendRequest(tc.recipient))
			require.NoError(t, err)
			assert.Equal(t, tc.want, svc.gotDraft.Recipient)
			assert.Nil(t, svc.gotDraft.ExpiresAt, "no expiry given is the default")
			assert.Nil(t, res.GetLetters()[0].MemberId, "a broadcast entry names no member")
		})
	}
}

func TestHandlerSendLetter_MalformedRequestsNeverReachTheService(t *testing.T) {
	cases := map[string]*pb.SendLetterRequest{
		"no recipient":         sendRequest(nil),
		"all members false":    sendRequest(&pb.LetterRecipient{Target: &pb.LetterRecipient_AllMembers{AllMembers: false}}),
		"bad member id":        sendRequest(memberRecipient("nope")),
		"bad list id":          sendRequest(listRecipient(uuid.NewString(), "nope")),
		"no enclosure kind":    sendRequest(allRecipient, &pb.EnclosureRequest{}),
		"bad template id":      sendRequest(allRecipient, &pb.EnclosureRequest{Kind: &pb.EnclosureRequest_Template{Template: &pb.TemplateEnclosureRequest{TemplateId: "x", Quantity: 1}}}),
		"bad copy instance id": sendRequest(allRecipient, &pb.EnclosureRequest{Kind: &pb.EnclosureRequest_Copy{Copy: &pb.CopyEnclosureRequest{InstanceId: "x", Quantity: 1}}}),
	}
	for name, req := range cases {
		t.Run(name, func(t *testing.T) {
			svc := &fakeService{}
			_, err := NewHandler(svc).SendLetter(as(admin), req)
			assert.Equal(t, codes.InvalidArgument, status.Code(err))
			assert.Zero(t, svc.calls)
		})
	}
}

func TestHandler_ErrorsCrossAsTheirStatus(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want codes.Code
	}{
		{"not an admin", ErrNotAdmin, codes.PermissionDenied},
		{"not addressed", ErrLetterNotFound, codes.NotFound},
		{"items down", errors.Join(ErrItemsUnavailable, errors.New("dial")), codes.Unavailable},
		{"store failed", errors.Join(ErrStoreFailed, errors.New("reset")), codes.Unavailable},
		{"a bug", errors.New("boom"), codes.Internal},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := NewHandler(&fakeService{err: tc.err}).SendLetter(as(admin), sendRequest(allRecipient))
			assert.Equal(t, tc.want, status.Code(err))
		})
	}

	t.Run("a refusal passes its code through", func(t *testing.T) {
		_, err := NewHandler(&fakeService{err: errcode.Refuse(errcode.LetterExpired)}).
			MarkLetterRead(as(player), &pb.MarkLetterReadRequest{LetterId: uuid.NewString()})
		st, _ := status.FromError(err)
		code, ok := errcode.RefusalReason(st)
		require.True(t, ok)
		assert.Equal(t, errcode.LetterExpired, code)
	})
}

func TestHandler_WithoutACallerIsUnauthenticated(t *testing.T) {
	h := NewHandler(&fakeService{})
	ctx := context.Background()

	_, err := h.SendLetter(ctx, sendRequest(allRecipient))
	assert.Equal(t, codes.Unauthenticated, status.Code(err))
	_, err = h.ListLetters(ctx, &pb.ListLettersRequest{})
	assert.Equal(t, codes.Unauthenticated, status.Code(err))
	_, err = h.GetMailboxSummary(ctx, &pb.GetMailboxSummaryRequest{})
	assert.Equal(t, codes.Unauthenticated, status.Code(err))
	_, err = h.MarkLetterRead(ctx, &pb.MarkLetterReadRequest{LetterId: uuid.NewString()})
	assert.Equal(t, codes.Unauthenticated, status.Code(err))
}

func TestHandlerListLetters_AnswersTheStoredSnapshots(t *testing.T) {
	member := uuid.New()
	l := letterTo(&member, now,
		Enclosure{Kind: EnclosureItem, Quantity: 2, Item: unique},
		Enclosure{Kind: EnclosureGold, Gold: 500},
	)
	svc := &fakeService{letters: []MailboxLetter{
		{Letter: l, Read: true, ClaimState: ClaimClaiming},
		{Letter: letterTo(nil, now.Add(-time.Hour)), ClaimState: ClaimNone},
	}}

	res, err := NewHandler(svc).ListLetters(as(commonauth.Identity{MemberID: member, Role: commonauth.RolePlayer}), &pb.ListLettersRequest{})
	require.NoError(t, err)
	assert.Equal(t, member, svc.gotMember, "the member is the token's")

	require.Len(t, res.GetLetters(), 2)
	got := res.GetLetters()[0]
	assert.Equal(t, l.ID.String(), got.GetId())
	assert.Equal(t, "official", got.GetSender())
	assert.True(t, got.GetRead())
	assert.Equal(t, "claiming", got.GetClaimState())
	assert.True(t, got.GetSentAt().AsTime().Equal(l.SentAt))
	assert.True(t, got.GetExpiresAt().AsTime().Equal(l.ExpiresAt))
	require.Len(t, got.GetEnclosures(), 2)
	item := got.GetEnclosures()[0].GetItem()
	assert.Equal(t, int32(2), item.GetQuantity())
	assert.True(t, proto.Equal(SnapshotProto(unique), item.GetItem()), "the stored snapshot, unchanged")
	assert.Equal(t, int64(500), got.GetEnclosures()[1].GetGold())

	assert.Equal(t, "none", res.GetLetters()[1].GetClaimState())
	assert.Empty(t, res.GetLetters()[1].GetEnclosures())
}

func TestHandlerGetMailboxSummary(t *testing.T) {
	member := uuid.New()
	newest := now.Add(-time.Minute)
	caller := as(commonauth.Identity{MemberID: member, Role: commonauth.RolePlayer})

	res, err := NewHandler(&fakeService{summary: Summary{Unread: 3, Unclaimed: 1, Waiting: 4, NewestLetterAt: &newest}}).
		GetMailboxSummary(caller, &pb.GetMailboxSummaryRequest{})
	require.NoError(t, err)
	assert.Equal(t, int32(3), res.GetUnreadCount())
	assert.Equal(t, int32(1), res.GetUnclaimedCount())
	assert.Equal(t, int32(4), res.GetWaitingCount())
	assert.True(t, res.GetNewestLetterAt().AsTime().Equal(newest))

	empty, err := NewHandler(&fakeService{}).GetMailboxSummary(caller, &pb.GetMailboxSummaryRequest{})
	require.NoError(t, err)
	assert.Nil(t, empty.NewestLetterAt, "absent when the mailbox is empty")
}

func TestHandlerMarkLetterRead(t *testing.T) {
	member, letter := uuid.New(), uuid.New()
	svc := &fakeService{}

	_, err := NewHandler(svc).MarkLetterRead(as(commonauth.Identity{MemberID: member, Role: commonauth.RolePlayer}),
		&pb.MarkLetterReadRequest{LetterId: letter.String()})
	require.NoError(t, err)
	assert.Equal(t, member, svc.gotMember)
	assert.Equal(t, letter, svc.gotLetter)

	_, err = NewHandler(svc).MarkLetterRead(as(player), &pb.MarkLetterReadRequest{LetterId: "nope"})
	assert.Equal(t, codes.InvalidArgument, status.Code(err))
}
