package stats

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/wire"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/stats"
	"github.com/darkphotonKN/barrowspire-server/common/apperr"
)

type ErrorFunc func(error) error

var toStatusError ErrorFunc = func(err error) error { return err }

func guard[I, O any](fn func(context.Context, *I) (*O, error)) func(context.Context, *I) (*O, error) {
	return func(ctx context.Context, in *I) (*O, error) {
		out, err := fn(ctx, in)
		if err != nil {
			return nil, toStatusError(err)
		}
		return out, nil
	}
}

// PlayerMatchStats mirrors pb.PlayerMatchStats.
type PlayerMatchStats struct {
	ID                  string          `json:"id,omitempty" doc:"Stats row id"`
	MemberID            string          `json:"member_id,omitempty" doc:"Member id"`
	GamesPlayed         int32           `json:"games_played,omitempty" doc:"Games played"`
	Wins                int32           `json:"wins,omitempty" doc:"Wins"`
	Losses              int32           `json:"losses,omitempty" doc:"Losses"`
	Kills               int32           `json:"kills,omitempty" doc:"Kills"`
	Deaths              int32           `json:"deaths,omitempty" doc:"Deaths"`
	TimesPlacedTopThree int32           `json:"times_placed_top_three,omitempty" doc:"Top-three finishes"`
	CreatedAt           *wire.Timestamp `json:"created_at,omitempty" doc:"Creation time"`
	UpdatedAt           *wire.Timestamp `json:"updated_at,omitempty" doc:"Last update time"`
}

// PlayerRankingStats mirrors pb.PlayerRankingStats.
type PlayerRankingStats struct {
	ID               string          `json:"id,omitempty" doc:"Ranking row id"`
	MemberID         string          `json:"member_id,omitempty" doc:"Member id"`
	Username         string          `json:"username,omitempty" doc:"Display name"`
	Wins             int32           `json:"wins,omitempty" doc:"Wins"`
	TopThrees        int32           `json:"top_threes,omitempty" doc:"Top-three finishes"`
	AvatarURL        string          `json:"avatar_url,omitempty" doc:"Avatar URL"`
	Rating           int32           `json:"rating,omitempty" doc:"Rating"`
	RankPosition     *int32          `json:"rank_position,omitempty" doc:"Position on the leaderboard"`
	LastCalculatedAt *wire.Timestamp `json:"last_calculated_at,omitempty" doc:"When the ranking was last computed"`
	CreatedAt        *wire.Timestamp `json:"created_at,omitempty" doc:"Creation time"`
	UpdatedAt        *wire.Timestamp `json:"updated_at,omitempty" doc:"Last update time"`
}

// Leaderboard mirrors pb.GetLeaderboardResponse.
type Leaderboard struct {
	Players    []*PlayerRankingStats `json:"players,omitempty" doc:"Ranked players"`
	TotalCount int32                 `json:"total_count,omitempty" doc:"Total ranked players"`
}

// NOTE: the stats group has NO envelope — both handlers return the downstream
// payload directly, unlike every other group. Transcribed as-is (ADR-0002 §1).
//
// NOTE (pioneer log): these two routes are PUBLIC. No AuthMiddleware is applied,
// and the gateway's own SPECIFICATION.md already asks whether that is intended.
// Documenting a route as unauthenticated records what it does; it does not bless
// it. Adding auth here would be a behavior change riding a wrap, and would break
// game-client's leaderboard silently.
var errsPublic = []int{http.StatusBadRequest, http.StatusUnprocessableEntity, http.StatusNotFound, http.StatusInternalServerError}

// RegisterOperations declares the serialized stats surface (FS-0002 slice 3).
// No protect: these routes are public today.
func RegisterOperations(api huma.API, h *Handler, errFor ErrorFunc) {
	toStatusError = errFor

	type playerIn struct {
		PlayerID string `path:"playerId" doc:"Member id to fetch stats for"`
	}
	type playerOut struct{ Body *PlayerMatchStats }
	huma.Register(api, huma.Operation{
		OperationID: "get-player-stats",
		Method:      http.MethodGet,
		Path:        "/api/stats/player/{playerId}",
		Summary:     "Get a player's match stats",
		Description: "Public. Returns the player's aggregate match statistics with no envelope.",
		Tags:        []string{"stats"}, Errors: errsPublic,
	}, guard(func(ctx context.Context, in *playerIn) (*playerOut, error) {
		if in.PlayerID == "" {
			return nil, apperr.WithDetail(apperr.ErrValidation, "player ID is required")
		}
		res, err := h.client.GetPlayerStats(ctx, &pb.GetPlayerMatchStatsRequest{MemberId: in.PlayerID})
		if err != nil {
			return nil, err
		}
		body, err := wire.As[PlayerMatchStats](res)
		if err != nil {
			return nil, err
		}
		return &playerOut{Body: body}, nil
	}))

	type boardIn struct {
		Limit  int32 `query:"limit" default:"50" doc:"Rows to return, 0-50"`
		Offset int32 `query:"offset" default:"0" doc:"Rows to skip"`
	}
	type boardOut struct{ Body *Leaderboard }
	huma.Register(api, huma.Operation{
		OperationID: "get-leaderboard",
		Method:      http.MethodGet,
		Path:        "/api/stats/leaderboard",
		Summary:     "Get the leaderboard",
		Description: "Public. Returns ranked players. limit defaults to 50 and may not exceed it.",
		Tags:        []string{"stats"}, Errors: errsPublic,
	}, guard(func(ctx context.Context, in *boardIn) (*boardOut, error) {
		// Bounds transcribed from the legacy handler, which rejected them itself
		// rather than declaring them on the parameter. Kept as handler checks so
		// the status stays 400 rather than becoming a boundary 422.
		if in.Limit > 50 || in.Limit < 0 {
			return nil, apperr.WithDetail(apperr.ErrValidation, "limit must be between 0 and 50.")
		}
		if in.Offset < 0 {
			return nil, apperr.WithDetail(apperr.ErrValidation, "offset must be 0 or greater.")
		}
		limit, offset := in.Limit, in.Offset
		res, err := h.client.GetLeaderboard(ctx, &pb.GetLeaderboardRequest{Limit: &limit, Offset: &offset})
		if err != nil {
			return nil, err
		}
		body, err := wire.As[Leaderboard](res)
		if err != nil {
			return nil, err
		}
		return &boardOut{Body: body}, nil
	}))
}
