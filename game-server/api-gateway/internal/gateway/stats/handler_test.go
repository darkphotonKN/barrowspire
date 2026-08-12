package stats_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/stats"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/testsupport"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/stats"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestMain(m *testing.M) {
	gin.SetMode(gin.TestMode)
	m.Run()
}

type stubStatsClient struct {
	err         error
	playerStats *pb.PlayerMatchStats
	leaderboard *pb.GetLeaderboardResponse
}

func (s *stubStatsClient) GetPlayerStats(context.Context, *pb.GetPlayerMatchStatsRequest) (*pb.PlayerMatchStats, error) {
	return s.playerStats, s.err
}

func (s *stubStatsClient) GetLeaderboard(context.Context, *pb.GetLeaderboardRequest) (*pb.GetLeaderboardResponse, error) {
	return s.leaderboard, s.err
}

// These routes are public — config/routes.go mounts them without the auth
// middleware, so there is no identity to stub.
func newRouter(client stats.StatsClient) *gin.Engine {
	r := gin.New()
	h := stats.NewHandler(client)

	g := r.Group("/stats")
	g.GET("/player/:playerId", h.GetPlayerStats)
	g.GET("/leaderboard", h.GetLeaderboard)

	return r
}

// FS-0001 §Requirements 4, 5, 7. This package used a fourth body shape — a bare
// {"error": "..."} with no envelope — and its default arm sent Unavailable to
// 500. That last one is the change worth watching: the leaderboard is the
// endpoint most likely to be hit while stats-service is restarting.
func TestStatsHandler_DownstreamFailures_ResolveThroughTheSeam(t *testing.T) {
	tests := []struct {
		name       string
		path       string
		clientErr  error
		wantStatus int
		wantCode   errcode.Code
	}{
		{
			name: "player stats not found", path: "/stats/player/abc",
			clientErr:  status.Error(codes.NotFound, "no rows"),
			wantStatus: http.StatusNotFound, wantCode: errcode.NotFound,
		},
		{
			name: "player id rejected downstream", path: "/stats/player/abc",
			clientErr:  status.Error(codes.InvalidArgument, "not a uuid"),
			wantStatus: http.StatusBadRequest, wantCode: errcode.ValidationFailed,
		},
		{
			// CHANGED: the default arm sent this to 500.
			name: "player stats while downstream is down", path: "/stats/player/abc",
			clientErr:  status.Error(codes.Unavailable, "stats-service unreachable"),
			wantStatus: http.StatusServiceUnavailable, wantCode: errcode.ServiceUnavailable,
		},
		{
			// CHANGED: no PermissionDenied arm existed.
			name: "player stats forbidden", path: "/stats/player/abc",
			clientErr:  status.Error(codes.PermissionDenied, "private profile"),
			wantStatus: http.StatusForbidden, wantCode: errcode.Forbidden,
		},
		{
			name: "leaderboard not found", path: "/stats/leaderboard",
			clientErr:  status.Error(codes.NotFound, "no season"),
			wantStatus: http.StatusNotFound, wantCode: errcode.NotFound,
		},
		{
			// CHANGED: same default arm.
			name: "leaderboard while downstream is down", path: "/stats/leaderboard",
			clientErr:  status.Error(codes.Unavailable, "stats-service unreachable"),
			wantStatus: http.StatusServiceUnavailable, wantCode: errcode.ServiceUnavailable,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := testsupport.Do(newRouter(&stubStatsClient{err: tt.clientErr}), http.MethodGet, tt.path, "")

			testsupport.AssertProblem(t, w, tt.wantStatus, string(tt.wantCode))
		})
	}
}

// The gateway owns these rules, so its own wording is client-safe and must
// survive the migration — this is the case apperr.WithDetail exists for.
// Flattening them to "Bad Request" would lose the only thing telling a caller
// what to send instead.
func TestStatsHandler_GatewayOwnedValidation_KeepsItsWording(t *testing.T) {
	tests := []struct {
		name       string
		path       string
		wantDetail string
	}{
		{"limit above the cap", "/stats/leaderboard?limit=500", "limit must be between 0 and 50."},
		{"limit not a number", "/stats/leaderboard?limit=abc", "limit must be between 0 and 50."},
		{"negative offset", "/stats/leaderboard?offset=-1", "offset must be 0 or greater."},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := testsupport.Do(newRouter(&stubStatsClient{}), http.MethodGet, tt.path, "")

			body := testsupport.AssertProblem(t, w, http.StatusBadRequest, string(errcode.ValidationFailed))
			assert.Equal(t, tt.wantDetail, body["detail"])
		})
	}
}

// FS-0001 §Requirements 9.
func TestStatsHandler_DownstreamMessages_NeverReachTheClient(t *testing.T) {
	const leak = "pq: relation \"player_match_stats\" does not exist"

	w := testsupport.Do(newRouter(&stubStatsClient{err: status.Error(codes.NotFound, leak)}), http.MethodGet, "/stats/player/abc", "")

	assert.NotContains(t, w.Body.String(), "player_match_stats")
	assert.NotContains(t, w.Body.String(), "pq:")
}

// FS-0001 §Requirements 12 — this package returns the raw proto on success,
// with no envelope. That shape is untouched.
func TestStatsHandler_SuccessResponses_AreUnchanged(t *testing.T) {
	client := &stubStatsClient{
		playerStats: &pb.PlayerMatchStats{},
		leaderboard: &pb.GetLeaderboardResponse{},
	}

	for _, path := range []string{"/stats/player/abc", "/stats/leaderboard"} {
		t.Run(path, func(t *testing.T) {
			w := testsupport.Do(newRouter(client), http.MethodGet, path, "")

			assert.Equal(t, http.StatusOK, w.Code)
			assert.Contains(t, w.Header().Get("Content-Type"), "application/json")
			assert.NotContains(t, testsupport.Decode(t, w), "code")
		})
	}
}
