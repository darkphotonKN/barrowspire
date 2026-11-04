package mailbox

import (
	"context"
	"errors"
	"fmt"
	"strings"
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
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
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
	claim     *Claim

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

func (f *fakeService) ClaimLetter(_ context.Context, letterID, member uuid.UUID) (*Claim, error) {
	f.calls++
	f.gotLetter, f.gotMember = letterID, member
	return f.claim, f.err
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
	_, err = h.ClaimLetter(ctx, &pb.ClaimLetterRequest{LetterId: uuid.NewString()})
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

func TestHandlerClaimLetter_AnswersWhatTheTokensMemberTook(t *testing.T) {
	member, letter := uuid.New(), uuid.New()
	first, second := uuid.New(), uuid.New()
	svc := &fakeService{claim: &Claim{LetterID: letter, ItemIDs: []uuid.UUID{first, second}, Gold: 500}}

	res, err := NewHandler(svc).ClaimLetter(as(commonauth.Identity{MemberID: member, Role: commonauth.RolePlayer}),
		&pb.ClaimLetterRequest{LetterId: letter.String()})
	require.NoError(t, err)

	assert.Equal(t, member, svc.gotMember, "the member is the token's, never a request field")
	assert.Equal(t, letter, svc.gotLetter)
	assert.Equal(t, letter.String(), res.GetLetterId())
	assert.Equal(t, "claimed", res.GetClaimState())
	assert.Equal(t, []string{first.String(), second.String()}, res.GetItemIds())
	assert.Equal(t, int64(500), res.GetGold())
}

func TestHandlerClaimLetter_Failures(t *testing.T) {
	t.Run("a non-uuid letter id never reaches the service", func(t *testing.T) {
		svc := &fakeService{}
		_, err := NewHandler(svc).ClaimLetter(as(player), &pb.ClaimLetterRequest{LetterId: "nope"})
		assert.Equal(t, codes.InvalidArgument, status.Code(err))
		assert.Zero(t, svc.calls)
	})

	cases := []struct {
		name string
		err  error
		want codes.Code
	}{
		{"not addressed", ErrLetterNotFound, codes.NotFound},
		{"items down", errors.Join(ErrItemsUnavailable, errors.New("dial")), codes.Unavailable},
		{"wallet down", errors.Join(ErrWalletUnavailable, errors.New("dial")), codes.Unavailable},
		{"no wallet account", errors.New("credit 5 gold: rpc error: code = NotFound"), codes.Internal},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := NewHandler(&fakeService{err: tc.err}).ClaimLetter(as(player), &pb.ClaimLetterRequest{LetterId: uuid.NewString()})
			assert.Equal(t, tc.want, status.Code(err))
		})
	}

	for _, code := range []errcode.Code{
		errcode.LetterExpired, errcode.NothingToClaim, errcode.LetterAlreadyClaimed,
		errcode.LetterClaimInProgress, errcode.StashFull,
	} {
		t.Run(string(code)+" passes through", func(t *testing.T) {
			wrapped := fmt.Errorf("grant the items of letter x: %w", errcode.Refuse(code))
			_, err := NewHandler(&fakeService{err: wrapped}).ClaimLetter(as(player), &pb.ClaimLetterRequest{LetterId: uuid.NewString()})
			st, _ := status.FromError(err)
			got, ok := errcode.RefusalReason(st)
			require.True(t, ok)
			assert.Equal(t, code, got)
			assert.Equal(t, string(code), st.Message(), "no service context on the wire")
		})
	}
}

// R56: the sent-by audit is never shown to players. The notification proto is
// the only way a letter leaves this service (the gateway, its openapi and the
// generated client are all derived from it), so no message in it may carry a
// sent-by field.
func TestNoNotificationMessageCarriesTheSentByAudit(t *testing.T) {
	var walk func(protoreflect.MessageDescriptors)
	walk = func(messages protoreflect.MessageDescriptors) {
		for i := 0; i < messages.Len(); i++ {
			m := messages.Get(i)
			fields := m.Fields()
			for j := 0; j < fields.Len(); j++ {
				name := strings.ToLower(string(fields.Get(j).Name()))
				assert.NotContains(t, strings.ReplaceAll(name, "_", ""), "sentby",
					"%s.%s would show the sent-by audit", m.FullName(), fields.Get(j).Name())
			}
			walk(m.Messages())
		}
	}
	walk(pb.File_api_proto_notification_notification_proto.Messages())
}

// R56 at the handler: a stored letter's sent-by never reaches an answer.
func TestHandler_AnswersNeverCarryTheSentBy(t *testing.T) {
	member, sender := uuid.New(), uuid.New()
	official := letterTo(&member, now)
	official.SentBy = SentBy{MemberID: &sender}
	system := letterTo(nil, now)
	system.Sender, system.SentBy = SenderSystem, SentBy{Source: "test.compensation"}
	svc := &fakeService{
		letters: []MailboxLetter{{Letter: official, ClaimState: ClaimNone}, {Letter: system, ClaimState: ClaimNone}},
		sent:    &SentLetters{Letters: []SentLetter{{LetterID: official.ID, MemberID: &member}}, ExpiresAt: official.ExpiresAt},
	}
	h := NewHandler(svc)
	ctx := as(commonauth.Identity{MemberID: sender, Role: commonauth.RoleAdmin})

	listed, err := h.ListLetters(ctx, &pb.ListLettersRequest{})
	require.NoError(t, err)
	sent, err := h.SendLetter(ctx, sendRequest(memberRecipient(member.String())))
	require.NoError(t, err)

	for _, res := range []proto.Message{listed, sent} {
		wire, err := protojson.Marshal(res)
		require.NoError(t, err)
		assert.NotContains(t, string(wire), sender.String(), "the admin's member id")
		assert.NotContains(t, string(wire), "test.compensation", "the sent-by source")
	}
}
