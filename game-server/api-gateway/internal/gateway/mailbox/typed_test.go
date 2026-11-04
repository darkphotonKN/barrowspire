package mailbox_test

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/contract"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/mailbox"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/testsupport"
	itemspb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/notification"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func TestMain(m *testing.M) {
	gin.SetMode(gin.TestMode)
	m.Run()
}

// fakeLetterClient answers canned values and records what the gateway sent,
// including the authorization it forwarded.
type fakeLetterClient struct {
	err   error
	calls int
	auth  string

	gotSend *pb.SendLetterRequest
	sent    *pb.SendLetterResponse

	letters []*pb.Letter
	summary *pb.MailboxSummary
	gotRead *pb.MarkLetterReadRequest

	gotClaim *pb.ClaimLetterRequest
	claimed  *pb.ClaimLetterResponse
}

func (f *fakeLetterClient) ClaimLetter(ctx context.Context, req *pb.ClaimLetterRequest) (*pb.ClaimLetterResponse, error) {
	f.record(ctx)
	f.gotClaim = req
	return f.claimed, f.err
}

func (f *fakeLetterClient) record(ctx context.Context) {
	f.calls++
	if md, ok := metadata.FromOutgoingContext(ctx); ok && len(md.Get("authorization")) > 0 {
		f.auth = md.Get("authorization")[0]
	}
}

func (f *fakeLetterClient) SendLetter(ctx context.Context, req *pb.SendLetterRequest) (*pb.SendLetterResponse, error) {
	f.record(ctx)
	f.gotSend = req
	return f.sent, f.err
}

func (f *fakeLetterClient) ListLetters(ctx context.Context, _ *pb.ListLettersRequest) (*pb.ListLettersResponse, error) {
	f.record(ctx)
	if f.err != nil {
		return nil, f.err
	}
	return &pb.ListLettersResponse{Letters: f.letters}, nil
}

func (f *fakeLetterClient) GetMailboxSummary(ctx context.Context, _ *pb.GetMailboxSummaryRequest) (*pb.MailboxSummary, error) {
	f.record(ctx)
	return f.summary, f.err
}

func (f *fakeLetterClient) MarkLetterRead(ctx context.Context, req *pb.MarkLetterReadRequest) (*pb.MarkLetterReadResponse, error) {
	f.record(ctx)
	f.gotRead = req
	if f.err != nil {
		return nil, f.err
	}
	return &pb.MarkLetterReadResponse{}, nil
}

// signedIn stands in for AuthMiddleware's success path.
func signedIn(role commonauth.Role) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request = c.Request.WithContext(commonauth.EmbedIdentity(c.Request.Context(),
			commonauth.Identity{MemberID: uuid.New(), Role: role}))
	}
}

func newRouter(client mailbox.LetterClient, role commonauth.Role) *gin.Engine {
	r := gin.New()
	api := contract.New(r)
	mailbox.RegisterOperations(api, mailbox.NewHandler(client),
		contract.Protected(signedIn(role)), contract.SeamError, contract.Secured)
	return r
}

const bearer = "Bearer the-callers-token"

func do(r *gin.Engine, method, path, body string) *httptest.ResponseRecorder {
	return testsupport.DoWithHeaders(r, method, path, body, map[string]string{
		"Content-Type":  "application/json",
		"Authorization": bearer,
	})
}

var (
	sent    = time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC)
	expires = sent.Add(30 * 24 * time.Hour)
)

func TestMailboxSummary_AnswersTheCountsAndForwardsTheToken(t *testing.T) {
	client := &fakeLetterClient{summary: &pb.MailboxSummary{
		UnreadCount: 2, UnclaimedCount: 1, WaitingCount: 3, NewestLetterAt: timestamppb.New(sent),
	}}

	w := do(newRouter(client, commonauth.RolePlayer), http.MethodGet, "/api/mail/summary", "")

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Equal(t, bearer, client.auth, "notification reads the member from the forwarded token")
	assert.Equal(t, map[string]any{
		"unreadCount":    float64(2),
		"unclaimedCount": float64(1),
		"waitingCount":   float64(3),
		"newestLetterAt": "2026-11-04T12:00:00Z",
	}, testsupport.Decode(t, w))
}

func TestMailboxSummary_EmptyMailboxHasNoNewestLetter(t *testing.T) {
	client := &fakeLetterClient{summary: &pb.MailboxSummary{}}

	w := do(newRouter(client, commonauth.RolePlayer), http.MethodGet, "/api/mail/summary", "")

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Equal(t, map[string]any{
		"unreadCount": float64(0), "unclaimedCount": float64(0), "waitingCount": float64(0),
	}, testsupport.Decode(t, w))
}

func TestMailboxSummary_NotificationDownIs503(t *testing.T) {
	client := &fakeLetterClient{err: status.Error(codes.Unavailable, "dial tcp 127.0.0.1:7190")}

	w := do(newRouter(client, commonauth.RolePlayer), http.MethodGet, "/api/mail/summary", "")

	testsupport.AssertProblem(t, w, http.StatusServiceUnavailable, string(errcode.ServiceUnavailable))
}

func TestListLetters_ReturnsEachStoredSnapshotUnchanged(t *testing.T) {
	letterID, templateID := uuid.NewString(), uuid.NewString()
	client := &fakeLetterClient{letters: []*pb.Letter{
		{
			Id: letterID, Title: "Restitution", Body: "For the lost blade.", Sender: "official",
			SentAt: timestamppb.New(sent), ExpiresAt: timestamppb.New(expires),
			Read: true, ClaimState: "unclaimed",
			Enclosures: []*pb.Enclosure{
				{Kind: &pb.Enclosure_Item{Item: &pb.ItemEnclosure{Quantity: 2, Item: &itemspb.ItemSnapshot{
					TemplateId: templateID, Name: "Barrow King's Edge", Description: proto.String("Cold iron."),
					ItemType: "weapon", WeaponType: proto.String("sword"), Rarity: "fabled",
					AttackPower: proto.Int32(31), CriticalRate: proto.Float64(7.5), Durability: proto.Int32(80),
					ItemLevel: 40, RequiredLevel: 18, UniqueEffectText: proto.String("Strikes twice at dusk."),
					Affixes: []*itemspb.Affix{{Stat: "attack_speed", Tier: 0, Value: 12}},
				}}}},
				{Kind: &pb.Enclosure_Gold{Gold: 500}},
			},
		},
		{
			Id: uuid.NewString(), Title: "Welcome", Body: "Hail.", Sender: "system",
			SentAt: timestamppb.New(sent), ExpiresAt: timestamppb.New(expires), ClaimState: "none",
		},
	}}

	w := do(newRouter(client, commonauth.RolePlayer), http.MethodGet, "/api/mail/letters", "")

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Equal(t, bearer, client.auth)
	body := testsupport.Decode(t, w)
	letters := body["letters"].([]any)
	require.Len(t, letters, 2)

	assert.Equal(t, map[string]any{
		"id": letterID, "title": "Restitution", "body": "For the lost blade.", "sender": "official",
		"sentAt": "2026-11-04T12:00:00Z", "expiresAt": "2026-12-04T12:00:00Z",
		"read": true, "claimState": "unclaimed",
		"enclosures": []any{
			map[string]any{"kind": "item", "quantity": float64(2), "item": map[string]any{
				"templateId": templateID, "name": "Barrow King's Edge", "description": "Cold iron.",
				"itemType": "weapon", "weaponType": "sword", "rarity": "fabled",
				"attackPower": float64(31), "criticalRate": 7.5,
				"itemLevel": float64(40), "requiredLevel": float64(18),
				"affixes":          []any{map[string]any{"stat": "attack_speed", "tier": float64(0), "value": float64(12)}},
				"uniqueEffectText": "Strikes twice at dusk.",
			}},
			map[string]any{"kind": "gold", "gold": float64(500)},
		},
	}, letters[0])

	plain := letters[1].(map[string]any)
	assert.Equal(t, false, plain["read"], "read stays on the wire when false")
	assert.Equal(t, "none", plain["claimState"])
	assert.Equal(t, []any{}, plain["enclosures"], "never null")
}

func TestMarkLetterRead_Answers204(t *testing.T) {
	client := &fakeLetterClient{}
	id := uuid.NewString()

	w := do(newRouter(client, commonauth.RolePlayer), http.MethodPost, "/api/mail/letters/"+id+"/read", "")

	require.Equal(t, http.StatusNoContent, w.Code, w.Body.String())
	assert.Equal(t, id, client.gotRead.GetLetterId())
	assert.Equal(t, bearer, client.auth)
}

func TestMarkLetterRead_Failures(t *testing.T) {
	cases := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   errcode.Code
	}{
		{"not addressed", status.Error(codes.NotFound, "letter not found"), http.StatusNotFound, errcode.NotFound},
		{"expired", errcode.Refuse(errcode.LetterExpired), http.StatusBadRequest, errcode.LetterExpired},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			client := &fakeLetterClient{err: tc.err}
			w := do(newRouter(client, commonauth.RolePlayer), http.MethodPost, "/api/mail/letters/"+uuid.NewString()+"/read", "")
			testsupport.AssertProblem(t, w, tc.wantStatus, string(tc.wantCode))
		})
	}

	t.Run("a non-uuid id is shape", func(t *testing.T) {
		client := &fakeLetterClient{}
		w := do(newRouter(client, commonauth.RolePlayer), http.MethodPost, "/api/mail/letters/nope/read", "")
		testsupport.AssertProblem(t, w, http.StatusUnprocessableEntity, string(errcode.ValidationFailed))
		assert.Zero(t, client.calls)
	})
}

func sendBody(recipient string, extra ...string) string {
	parts := append([]string{`"recipient":` + recipient, `"title":"Hail"`, `"body":"Well met."`}, extra...)
	return "{" + strings.Join(parts, ",") + "}"
}

func TestSendLetter_NonAdminIs403AndNeverForwarded(t *testing.T) {
	for _, recipient := range []string{
		`{"memberId":"` + uuid.NewString() + `"}`,
		`{"memberIds":["` + uuid.NewString() + `"]}`,
		`{"allMembers":true}`,
	} {
		client := &fakeLetterClient{}
		w := do(newRouter(client, commonauth.RolePlayer), http.MethodPost, "/api/admin/mail", sendBody(recipient))

		testsupport.AssertProblem(t, w, http.StatusForbidden, string(errcode.Forbidden))
		assert.Zero(t, client.calls)
	}
}

func TestSendLetter_MemberListIsForwardedWithItsEnclosuresAndAnswered(t *testing.T) {
	a, b := uuid.NewString(), uuid.NewString()
	tmpl, source := uuid.NewString(), uuid.NewString()
	first, second := uuid.NewString(), uuid.NewString()
	client := &fakeLetterClient{sent: &pb.SendLetterResponse{
		Letters:   []*pb.SentLetter{{LetterId: first, MemberId: &a}, {LetterId: second, MemberId: &b}},
		ExpiresAt: timestamppb.New(expires),
	}}

	body := sendBody(fmt.Sprintf(`{"memberIds":[%q,%q,%q]}`, a, b, a),
		`"enclosures":[`+
			`{"kind":"template","templateId":"`+tmpl+`","quantity":3},`+
			`{"kind":"template","templateId":"`+tmpl+`","quantity":1,"itemLevel":40},`+
			`{"kind":"copy","copyOf":"`+source+`","quantity":2},`+
			`{"kind":"gold","gold":500}]`,
		`"expiresAt":"2026-12-04T12:00:00Z"`,
	)
	w := do(newRouter(client, commonauth.RoleAdmin), http.MethodPost, "/api/admin/mail", body)

	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	assert.Equal(t, bearer, client.auth, "notification checks the admin role again from the token")

	got := client.gotSend
	assert.Equal(t, []string{a, b, a}, got.GetRecipient().GetMembers().GetMemberIds(), "notification owns de-duplication")
	assert.Equal(t, "Hail", got.GetTitle())
	assert.Equal(t, "Well met.", got.GetBody())
	require.Len(t, got.GetEnclosures(), 4)
	assert.Equal(t, tmpl, got.GetEnclosures()[0].GetTemplate().GetTemplateId())
	assert.Equal(t, int32(3), got.GetEnclosures()[0].GetTemplate().GetQuantity())
	assert.Nil(t, got.GetEnclosures()[0].GetTemplate().ItemLevel, "no item level stays unset")
	assert.Equal(t, int32(40), got.GetEnclosures()[1].GetTemplate().GetItemLevel())
	assert.Equal(t, source, got.GetEnclosures()[2].GetCopy().GetInstanceId())
	assert.Equal(t, int32(2), got.GetEnclosures()[2].GetCopy().GetQuantity())
	assert.Equal(t, int64(500), got.GetEnclosures()[3].GetGold())
	assert.True(t, got.GetExpiresAt().AsTime().Equal(expires))

	assert.Equal(t, map[string]any{
		"letters": []any{
			map[string]any{"letterId": first, "memberId": a},
			map[string]any{"letterId": second, "memberId": b},
		},
		"expiresAt": "2026-12-04T12:00:00Z",
	}, testsupport.Decode(t, w))
}

func TestSendLetter_OneMemberAndBroadcastAnswerTheSameShape(t *testing.T) {
	member, letter := uuid.NewString(), uuid.NewString()

	t.Run("one member", func(t *testing.T) {
		client := &fakeLetterClient{sent: &pb.SendLetterResponse{
			Letters: []*pb.SentLetter{{LetterId: letter, MemberId: &member}}, ExpiresAt: timestamppb.New(expires),
		}}
		w := do(newRouter(client, commonauth.RoleAdmin), http.MethodPost, "/api/admin/mail", sendBody(`{"memberId":"`+member+`"}`))

		require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
		assert.Equal(t, member, client.gotSend.GetRecipient().GetMemberId())
		assert.Nil(t, client.gotSend.ExpiresAt, "no expiry given is notification's default")
		assert.Equal(t, []any{map[string]any{"letterId": letter, "memberId": member}}, testsupport.Decode(t, w)["letters"])
	})

	t.Run("every member", func(t *testing.T) {
		client := &fakeLetterClient{sent: &pb.SendLetterResponse{
			Letters: []*pb.SentLetter{{LetterId: letter}}, ExpiresAt: timestamppb.New(expires),
		}}
		w := do(newRouter(client, commonauth.RoleAdmin), http.MethodPost, "/api/admin/mail", sendBody(`{"allMembers":true}`))

		require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
		assert.True(t, client.gotSend.GetRecipient().GetAllMembers())
		assert.Equal(t, []any{map[string]any{"letterId": letter}}, testsupport.Decode(t, w)["letters"])
	})
}

// The list's bounds are notification's (R47): an empty list is forwarded and
// its refusal passed through.
func TestSendLetter_EmptyListIsNotificationsToRefuse(t *testing.T) {
	client := &fakeLetterClient{err: errcode.Refuse(errcode.LetterRecipientsInvalid)}

	w := do(newRouter(client, commonauth.RoleAdmin), http.MethodPost, "/api/admin/mail", sendBody(`{"memberIds":[]}`))

	testsupport.AssertProblem(t, w, http.StatusBadRequest, string(errcode.LetterRecipientsInvalid))
	require.NotNil(t, client.gotSend.GetRecipient().GetMembers(), "forwarded as an empty list, not as no recipient")
	assert.Empty(t, client.gotSend.GetRecipient().GetMembers().GetMemberIds())
}

func TestSendLetter_ShapeFailuresAre422AndNeverForwarded(t *testing.T) {
	member := uuid.NewString()
	cases := map[string]string{
		"two recipient forms":    sendBody(`{"memberId":"` + member + `","memberIds":["` + member + `"]}`),
		"no recipient form":      sendBody(`{}`),
		"allMembers false":       sendBody(`{"allMembers":false}`),
		"non-uuid list entry":    sendBody(`{"memberIds":["` + member + `","nope"]}`),
		"non-uuid member":        sendBody(`{"memberId":"nope"}`),
		"unknown recipient form": sendBody(`{"members":["` + member + `"]}`),
		"no title":               `{"recipient":{"allMembers":true},"body":"b"}`,
		"unknown kind":           sendBody(`{"allMembers":true}`, `"enclosures":[{"kind":"pouch","gold":5}]`),
		"template without id":    sendBody(`{"allMembers":true}`, `"enclosures":[{"kind":"template","quantity":1}]`),
		"template without qty":   sendBody(`{"allMembers":true}`, `"enclosures":[{"kind":"template","templateId":"`+member+`"}]`),
		"copy without source":    sendBody(`{"allMembers":true}`, `"enclosures":[{"kind":"copy","quantity":1}]`),
		"gold without amount":    sendBody(`{"allMembers":true}`, `"enclosures":[{"kind":"gold"}]`),
		"non-uuid template":      sendBody(`{"allMembers":true}`, `"enclosures":[{"kind":"template","templateId":"x","quantity":1}]`),
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			client := &fakeLetterClient{}
			w := do(newRouter(client, commonauth.RoleAdmin), http.MethodPost, "/api/admin/mail", body)

			testsupport.AssertProblem(t, w, http.StatusUnprocessableEntity, string(errcode.ValidationFailed))
			assert.Zero(t, client.calls)
		})
	}
}

// Bounds are notification's (R3, S1): out-of-range values are forwarded, and
// the refusal comes back with its code.
func TestSendLetter_DomainRefusalsPassThrough(t *testing.T) {
	for _, code := range []errcode.Code{
		errcode.LetterTitleInvalid, errcode.LetterBodyInvalid, errcode.LetterExpiryInvalid,
		errcode.EnclosureInvalid, errcode.UnknownItemTemplate, errcode.UnknownItemInstance,
	} {
		t.Run(string(code), func(t *testing.T) {
			client := &fakeLetterClient{err: errcode.Refuse(code)}
			w := do(newRouter(client, commonauth.RoleAdmin), http.MethodPost, "/api/admin/mail",
				sendBody(`{"allMembers":true}`, `"enclosures":[{"kind":"template","templateId":"`+uuid.NewString()+`","quantity":0,"itemLevel":0},{"kind":"gold","gold":0}]`))

			testsupport.AssertProblem(t, w, http.StatusBadRequest, string(code))
			assert.Equal(t, 1, client.calls)
		})
	}
}

func TestSendLetter_DownstreamOutageIs503(t *testing.T) {
	client := &fakeLetterClient{err: status.Error(codes.Unavailable, "items down")}

	w := do(newRouter(client, commonauth.RoleAdmin), http.MethodPost, "/api/admin/mail", sendBody(`{"allMembers":true}`))

	testsupport.AssertProblem(t, w, http.StatusServiceUnavailable, string(errcode.ServiceUnavailable))
}

func TestSendLetter_NotificationRefusingTheRoleIs403(t *testing.T) {
	client := &fakeLetterClient{err: status.Error(codes.PermissionDenied, "only an admin")}

	w := do(newRouter(client, commonauth.RoleAdmin), http.MethodPost, "/api/admin/mail", sendBody(`{"allMembers":true}`))

	testsupport.AssertProblem(t, w, http.StatusForbidden, string(errcode.Forbidden))
}

func TestClaimLetter_AnswersWhatWasTakenAndForwardsTheToken(t *testing.T) {
	letter, first, second := uuid.NewString(), uuid.NewString(), uuid.NewString()
	client := &fakeLetterClient{claimed: &pb.ClaimLetterResponse{
		LetterId: letter, ClaimState: "claimed", ItemIds: []string{first, second}, Gold: 500,
	}}

	w := do(newRouter(client, commonauth.RolePlayer), http.MethodPost, "/api/mail/letters/"+letter+"/claim", "")

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Equal(t, letter, client.gotClaim.GetLetterId())
	assert.Equal(t, bearer, client.auth, "items and gold go to the token's member")
	assert.Equal(t, map[string]any{
		"letterId": letter, "claimState": "claimed", "itemIds": []any{first, second}, "gold": float64(500),
	}, testsupport.Decode(t, w))
}

func TestClaimLetter_ItemOnlyAndGoldOnlyKeepBothFields(t *testing.T) {
	letter, item := uuid.NewString(), uuid.NewString()

	t.Run("item only: gold 0", func(t *testing.T) {
		client := &fakeLetterClient{claimed: &pb.ClaimLetterResponse{LetterId: letter, ClaimState: "claimed", ItemIds: []string{item}}}
		w := do(newRouter(client, commonauth.RolePlayer), http.MethodPost, "/api/mail/letters/"+letter+"/claim", "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		assert.Equal(t, float64(0), testsupport.Decode(t, w)["gold"])
	})

	t.Run("gold only: no item ids, never null", func(t *testing.T) {
		client := &fakeLetterClient{claimed: &pb.ClaimLetterResponse{LetterId: letter, ClaimState: "claimed", Gold: 75}}
		w := do(newRouter(client, commonauth.RolePlayer), http.MethodPost, "/api/mail/letters/"+letter+"/claim", "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		assert.Equal(t, []any{}, testsupport.Decode(t, w)["itemIds"])
	})
}

func TestClaimLetter_Failures(t *testing.T) {
	cases := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   errcode.Code
	}{
		{"not addressed", status.Error(codes.NotFound, "letter not found"), http.StatusNotFound, errcode.NotFound},
		{"items or wallet down", status.Error(codes.Unavailable, "claim letter unavailable"), http.StatusServiceUnavailable, errcode.ServiceUnavailable},
	}
	for _, code := range []errcode.Code{
		errcode.LetterExpired, errcode.NothingToClaim, errcode.LetterAlreadyClaimed,
		errcode.LetterClaimInProgress, errcode.StashFull,
	} {
		cases = append(cases, struct {
			name       string
			err        error
			wantStatus int
			wantCode   errcode.Code
		}{string(code), errcode.Refuse(code), http.StatusBadRequest, code})
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			client := &fakeLetterClient{err: tc.err}
			w := do(newRouter(client, commonauth.RolePlayer), http.MethodPost, "/api/mail/letters/"+uuid.NewString()+"/claim", "")
			testsupport.AssertProblem(t, w, tc.wantStatus, string(tc.wantCode))
		})
	}

	t.Run("a non-uuid id is shape", func(t *testing.T) {
		client := &fakeLetterClient{}
		w := do(newRouter(client, commonauth.RolePlayer), http.MethodPost, "/api/mail/letters/nope/claim", "")
		testsupport.AssertProblem(t, w, http.StatusUnprocessableEntity, string(errcode.ValidationFailed))
		assert.Zero(t, client.calls)
	})
}
