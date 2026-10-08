package wallet_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/contract"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/wallet"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/testsupport"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/wallet"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestMain(m *testing.M) {
	gin.SetMode(gin.TestMode)
	m.Run()
}

// stubWalletClient answers GetAccount with a canned response and records the
// bearer the gateway forwarded. The other methods are never reached by the
// typed read.
type stubWalletClient struct {
	account *pb.GetAccountResponse
	err     error

	calls   int
	gotAuth string
}

func (s *stubWalletClient) GetAccount(ctx context.Context, _ *pb.GetAccountRequest) (*pb.GetAccountResponse, error) {
	s.calls++
	s.gotAuth, _ = wallet.BearerFromCtx(ctx)
	if s.err != nil {
		return nil, s.err
	}
	return s.account, nil
}

func (s *stubWalletClient) CreateAccount(context.Context, *pb.CreateAccountRequest) (*pb.CreateAccountResponse, error) {
	panic("not used by the typed read")
}

func (s *stubWalletClient) Deposit(context.Context, *pb.DepositRequest) (*pb.DepositResponse, error) {
	panic("not used by the typed read")
}

func (s *stubWalletClient) Withdraw(context.Context, *pb.WithdrawRequest) (*pb.WithdrawResponse, error) {
	panic("not used by the typed read")
}

// embedding stands in for AuthMiddleware's success path.
func embedding() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request = c.Request.WithContext(commonauth.EmbedIdentity(c.Request.Context(),
			commonauth.Identity{MemberID: uuid.New(), Role: commonauth.RolePlayer}))
	}
}

// rejecting stands in for AuthMiddleware's failure path: the seam writes a 401
// and aborts.
func rejecting() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.AbortWithStatus(http.StatusUnauthorized)
	}
}

func newRouter(client wallet.WalletClient, mw gin.HandlerFunc) *gin.Engine {
	r := gin.New()
	api := contract.New(r)
	wallet.RegisterOperations(api, wallet.NewHandler(client),
		contract.Protected(mw), contract.SeamError, contract.Secured)
	return r
}

func getAccount(r *gin.Engine) *http.Response {
	return testsupport.DoWithHeaders(r, http.MethodGet, "/api/wallet/account", "",
		map[string]string{"Authorization": "Bearer caller-token"}).Result()
}

func TestGetWalletAccount_ZeroHeldGoldIsOnTheWire(t *testing.T) {
	client := &stubWalletClient{account: &pb.GetAccountResponse{
		Id:            uuid.NewString(),
		MemberId:      uuid.NewString(),
		Gold:          500,
		HeldGold:      0,
		AvailableGold: 500,
	}}

	res := getAccount(newRouter(client, embedding()))
	defer res.Body.Close()

	require.Equal(t, http.StatusOK, res.StatusCode)

	var body map[string]any
	require.NoError(t, json.NewDecoder(res.Body).Decode(&body))

	// Exactly the three balances: no account id, member id or timestamps.
	assert.Equal(t, map[string]any{
		"gold":          float64(500),
		"heldGold":      float64(0),
		"availableGold": float64(500),
	}, body)

	// wallet-service re-validates the caller from the token, so it has to travel on.
	assert.Equal(t, "Bearer caller-token", client.gotAuth)
}

// A brand-new account is all zeros; every field still has to be present, which
// is what the gin handler's omitempty lost.
func TestGetWalletAccount_AllZeroAccountKeepsEveryField(t *testing.T) {
	client := &stubWalletClient{account: &pb.GetAccountResponse{}}

	res := getAccount(newRouter(client, embedding()))
	defer res.Body.Close()

	require.Equal(t, http.StatusOK, res.StatusCode)

	var body map[string]any
	require.NoError(t, json.NewDecoder(res.Body).Decode(&body))
	assert.Equal(t, map[string]any{
		"gold":          float64(0),
		"heldGold":      float64(0),
		"availableGold": float64(0),
	}, body)
}

func TestGetWalletAccount_DownstreamErrorsGoThroughTheSeam(t *testing.T) {
	cases := []struct {
		name   string
		code   codes.Code
		status int
		want   errcode.Code
	}{
		{"unauthenticated", codes.Unauthenticated, http.StatusUnauthorized, errcode.Unauthenticated},
		{"account not yet created", codes.NotFound, http.StatusNotFound, errcode.NotFound},
		{"wallet down", codes.Unavailable, http.StatusServiceUnavailable, errcode.ServiceUnavailable},
		{"anything else", codes.Internal, http.StatusInternalServerError, errcode.Internal},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			client := &stubWalletClient{err: status.Error(tc.code, "downstream detail that must not leak")}

			res := getAccount(newRouter(client, embedding()))
			defer res.Body.Close()

			require.Equal(t, tc.status, res.StatusCode)
			assert.Equal(t, "application/problem+json", res.Header.Get("Content-Type"))

			var body map[string]any
			require.NoError(t, json.NewDecoder(res.Body).Decode(&body))
			assert.Equal(t, string(tc.want), body["code"])
			assert.NotContains(t, body["detail"], "downstream detail")
		})
	}
}

func TestGetWalletAccount_NoTokenNeverReachesWallet(t *testing.T) {
	client := &stubWalletClient{account: &pb.GetAccountResponse{}}

	res := getAccount(newRouter(client, rejecting()))
	defer res.Body.Close()

	assert.Equal(t, http.StatusUnauthorized, res.StatusCode)
	assert.Equal(t, 0, client.calls)
}
