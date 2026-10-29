package stats

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	pbstats "github.com/darkphotonKN/barrowspire-server/common/api/proto/stats"
	commonbroker "github.com/darkphotonKN/barrowspire-server/common/broker"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commonutils "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/common/utils/cache"
	commoncache "github.com/darkphotonKN/barrowspire-server/common/utils/cache"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"google.golang.org/protobuf/proto"
)

type Repository interface {
	// transaction methods
	UpsertPlayerMatchStatsTx(ctx context.Context, tx *sqlx.Tx, params *UpdateStatsParams) (*PlayerMatchStats, error)
	UpsertPlayerRankingStatsTx(ctx context.Context, tx *sqlx.Tx, params *UpdatePlayerRankingsParams) (*PlayerRankingStats, error)
	CreateMatchHistoryTx(ctx context.Context, tx *sqlx.Tx, history *MatchHistory) error
	GetPlayerMatchStatsTx(ctx context.Context, tx *sqlx.Tx, memberID uuid.UUID) (*PlayerMatchStats, error)
	GetPlayerRankingStatsTx(ctx context.Context, tx *sqlx.Tx, memberID uuid.UUID) (*PlayerRankingStats, error)

	// non transaction methods
	UpsertPlayerRankingStats(ctx context.Context, params *UpdatePlayerRankingsParams) (*PlayerRankingStats, error)
	GetPlayerRankings(ctx context.Context, params *GetPlayerRankings) ([]*PlayerRankingStats, error)
}

// InboxRepository records which events this service has already applied. It is
// implemented by common/inbox and declared here because the service is what
// consumes it.
type InboxRepository interface {
	MarkEventProcessed(ctx context.Context, tx *sqlx.Tx, eventID uuid.UUID, eventType string) (bool, error)
}

type service struct {
	repo      Repository
	inbox     InboxRepository
	publishCh commonbroker.Publisher
	cache     cache.Cache
	// withTx runs fn in one transaction on db, committing when fn succeeds.
	withTx func(ctx context.Context, fn func(tx *sqlx.Tx) error) error
}

func NewService(repo Repository, inbox InboxRepository, publishCh commonbroker.Publisher, db *sqlx.DB, cache cache.Cache) *service {
	return &service{
		repo:      repo,
		inbox:     inbox,
		publishCh: publishCh,
		cache:     cache,
		withTx: func(ctx context.Context, fn func(tx *sqlx.Tx) error) error {
			return commonutils.ExecTx(ctx, db, nil, fn)
		},
	}
}

// ProcessMatchCompleted applies one match.ended event exactly once, for every
// player or for none. One transaction records the event in the inbox and then
// writes each player's stats, leaderboard row and match history; any failure
// rolls all of it back, inbox row included, and is returned for the consumer to
// settle. An event already applied writes nothing and returns
// ErrAlreadyProcessed. The leaderboard cache version is bumped only once a new
// event has committed.
func (s *service) ProcessMatchCompleted(ctx context.Context, eventID uuid.UUID, eventType string, req *pb.MatchEndedEvent) error {
	slog.Info("Processing match completed",
		"event_id", eventID,
		"event_type", eventType,
		"session_id", req.SessionId,
		"match_started_at", req.MatchStartedAt.AsTime(),
		"match_ended_at", req.MatchEndedAt.AsTime(),
	)

	var writeErr error
	err := s.withTx(ctx, func(tx *sqlx.Tx) error {
		writeErr = s.applyMatchEnded(ctx, tx, eventID, eventType, req)
		return writeErr
	})
	switch {
	case err == nil:
	case writeErr == nil:
		// no write failed, the transaction around them did (begin or commit):
		// the store, not the event, is at fault
		return fmt.Errorf("transaction for match ended %s: %w: %w", eventID, commonconstants.ErrTransient, err)
	default:
		return err
	}

	if isFieldVisit(req) {
		// nothing reached the leaderboard, so its cache stays valid
		return nil
	}

	// version increment invalidates the cached leaderboard; no deletion needed,
	// the short TTL is enough. The event is already committed, so a slow or
	// failed bump is only logged, under its own deadline so it cannot stall the
	// consumer.
	bumpCtx, cancel := context.WithTimeout(ctx, cacheBumpTimeout)
	defer cancel()
	newVersion, err := s.cache.Incr(bumpCtx, commoncache.StatsLeaderboardVersionKey())
	if err != nil {
		slog.Warn("Cache version could not be updated", "error", err)
		return nil
	}
	slog.Info("Cache version updated", "for key", commoncache.StatsLeaderboardVersionKey(), "new version", newVersion)

	return nil
}

// cacheBumpTimeout bounds the leaderboard cache-version bump after an event
// commits.
const cacheBumpTimeout = time.Second

// applyMatchEnded is the body of the event's transaction: the inbox mark
// first, then every player's writes.
func (s *service) applyMatchEnded(ctx context.Context, tx *sqlx.Tx, eventID uuid.UUID, eventType string, req *pb.MatchEndedEvent) error {
	inserted, err := s.inbox.MarkEventProcessed(ctx, tx, eventID, eventType)
	if err != nil {
		return fmt.Errorf("mark event processed: %w", err)
	}
	if !inserted {
		return commonconstants.ErrAlreadyProcessed
	}

	if isFieldVisit(req) {
		slog.Info("Skipping field visit: not a match", "event_id", eventID, "session_id", req.SessionId)
		return nil
	}

	sessionID, err := uuid.Parse(req.SessionId)
	if err != nil {
		return fmt.Errorf("session id %q: %w: %w", req.SessionId, commonconstants.ErrUUIDCouldNotBeParsed, err)
	}

	for _, player := range req.Players {
		if err := s.applyPlayerResult(ctx, tx, sessionID, req, player); err != nil {
			return fmt.Errorf("player %s: %w", player.MemberId, err)
		}
	}
	return nil
}

// isFieldVisit reports whether a match.ended event is one player's visit to a
// field world rather than a run. A visit is not a match: it counts no game,
// win or history (FS-X2F2H R44, ADR-0031). An empty world type is a run.
func isFieldVisit(req *pb.MatchEndedEvent) bool {
	return req.GetWorldType() == commonconstants.WorldTypeField
}

// applyPlayerResult writes one player's stats, leaderboard row and match
// history inside the event's transaction.
func (s *service) applyPlayerResult(ctx context.Context, tx *sqlx.Tx, sessionID uuid.UUID, req *pb.MatchEndedEvent, player *pb.PlayerMatchResult) error {
	if err := s.updatePlayerStats(ctx, tx, player); err != nil {
		return fmt.Errorf("update match stats: %w", err)
	}

	if err := s.updateDenormalizedLeaderboard(ctx, tx, player); err != nil {
		return fmt.Errorf("update leaderboard: %w", err)
	}

	memberID, err := uuid.Parse(player.MemberId)
	if err != nil {
		return fmt.Errorf("member id %q: %w: %w", player.MemberId, commonconstants.ErrUUIDCouldNotBeParsed, err)
	}

	matchHistory := &MatchHistory{
		SessionID:      sessionID,
		MemberID:       memberID,
		Win:            player.Win,
		FinalPosition:  int(player.FinalPosition),
		Kills:          int(player.Kills),
		Deaths:         int(player.Deaths),
		MatchStartedAt: req.MatchStartedAt.AsTime(),
	}
	if err := s.repo.CreateMatchHistoryTx(ctx, tx, matchHistory); err != nil {
		return fmt.Errorf("create match history: %w", err)
	}
	return nil
}

func (s *service) updatePlayerStats(ctx context.Context, tx *sqlx.Tx, player *pb.PlayerMatchResult) error {
	memberId, err := uuid.Parse(player.MemberId)
	if err != nil {
		slog.Info("Errored when attempting to get parse member id into UUID", "err", err)
		return fmt.Errorf("member id %q: %w: %w", player.MemberId, commonconstants.ErrUUIDCouldNotBeParsed, err)
	}

	// TODO: recalculate averages, averages migration and update WIP
	matchHistoryData, err := s.getMatchHistory(ctx, memberId)

	if err != nil {
		slog.Info("Errored when attempting to get match history", "err", err)
		return err
	}

	slog.Info("Match history data for player", "player", player, "data", matchHistoryData)

	playerStats, err := s.repo.GetPlayerMatchStatsTx(ctx, tx, memberId)

	if err != nil {
		return err
	}

	if playerStats == nil {
		// initialize struct, players first time
		playerStats = &PlayerMatchStats{
			MemberID:            memberId,
			GamesPlayed:         0,
			Wins:                0,
			Losses:              0,
			Kills:               0,
			Deaths:              0,
			TimesPlacedTopThree: 0,
		}
	}

	playerStats.GamesPlayed += 1
	playerStats.Kills += int(player.Kills)
	playerStats.Deaths += int(player.Deaths)

	// TODO: check if player won
	if player.Win {
		playerStats.Wins += 1
	} else if player.FinalPosition == 5 {
		playerStats.Losses += 1
	}

	// update aggregate stats
	_, err = s.repo.UpsertPlayerMatchStatsTx(ctx, tx, &UpdateStatsParams{
		MemberID:            playerStats.MemberID,
		GamesPlayed:         playerStats.GamesPlayed,
		Wins:                playerStats.Wins,
		Losses:              playerStats.Losses,
		Kills:               playerStats.Kills,
		Deaths:              playerStats.Deaths,
		TimesPlacedTopThree: playerStats.TimesPlacedTopThree,
	})

	if err != nil {
		return err
	}
	return nil
}

func (s *service) getMatchHistory(ctx context.Context, memberID uuid.UUID) ([]*MatchHistory, error) {

	return nil, nil
}

func (s *service) calculateMatchAverage(ctx context.Context, matchHistory []*MatchHistory) (*PlayerMatchStats, error) {
	// TODO: calculate the new averages
	return nil, nil
}

/**
* handles setting up and updating the denormalized leaderboard stats.
**/
func (s *service) updateDenormalizedLeaderboard(ctx context.Context, tx *sqlx.Tx, results *pb.PlayerMatchResult) error {
	memberId, err := uuid.Parse(results.MemberId)
	if err != nil {
		slog.Info("Errored when attempting to get parse member id into UUID", "err", err)
		return fmt.Errorf("member id %q: %w: %w", results.MemberId, commonconstants.ErrUUIDCouldNotBeParsed, err)
	}

	stats, err := s.repo.GetPlayerMatchStatsTx(ctx, tx, memberId)

	if err != nil {
		return err
	}

	wins := stats.Wins
	topThree := stats.TimesPlacedTopThree
	if results.Win {
		wins += 1
	}
	if results.FinalPosition >= 3 {
		topThree += 1
	}

	// recalculate rank position
	rankingStats, err := s.repo.GetPlayerRankingStatsTx(ctx, tx, memberId)

	slog.Debug("getting ranking stats from GetPlayerRankingStats", "rankingStats", rankingStats)

	var ranking *int
	if rankingStats != nil {
		ranking = rankingStats.RankPosition
	}

	statsParam := &UpdatePlayerRankingsParams{
		MemberID:         memberId,
		Username:         results.Username,
		Wins:             wins,
		TopThrees:        topThree,
		Rating:           0,
		RankPosition:     ranking,
		LastCalculatedAt: time.Now(),
	}

	playerRankingStats, err := s.repo.UpsertPlayerRankingStatsTx(ctx, tx, statsParam)

	if err != nil {
		return err
	}

	slog.Debug("after upsert for player ranking stats", "playerRankingStats", playerRankingStats)

	return nil
}

/**
* Updates the player rankings leaderboard stats
**/
func (s *service) UpdatePlayerRankings(ctx context.Context, updateData *pb.MemberProfileUpdatedEvent) error {
	memberIdUUID, err := uuid.Parse(updateData.MemberId)
	if err != nil {
		slog.Error("error when parsing updateData.MemberId as uuid", "memberID", updateData.MemberId, "error", err)
	}
	_, err = s.repo.UpsertPlayerRankingStats(ctx, &UpdatePlayerRankingsParams{
		Username:  updateData.Username,
		MemberID:  memberIdUUID,
		AvatarUrl: updateData.AvatarUrl,
	})

	if err != nil {
		slog.Error("error when updating player rankings", "memberID", updateData.MemberId, "error", err)
		return err
	}

	return nil
}

/**
* Grabs leaderboard related data from the player rankings table.
**/

func (s *service) GetLeaderboard(ctx context.Context, req *pbstats.GetLeaderboardRequest) (*pbstats.GetLeaderboardResponse, error) {
	limit := 50
	offset := 0

	if req.Limit != nil {
		limit = int(*req.Limit)
	}

	if req.Offset != nil {
		offset = int(*req.Offset)
	}

	// get cache version
	version, err := s.cache.Get(ctx, commoncache.StatsLeaderboardVersionKey())
	var versionInt64 int64

	if err != nil {
		slog.Warn("Cached \"version\" value for status leaderboard version doesn't exist or retreival failed.", "key", commoncache.StatsLeaderboardVersionKey(), "error", err)

		versionInt64 = int64(1) // default to 1
	} else {
		// cache exists, parse into int64
		versionInt64, _ = strconv.ParseInt(version, 10, 64)
	}

	// get cache key and cached data
	key := commoncache.StatsLeaderboardKey(versionInt64, limit, offset)
	cachedResStr, err := s.cache.Get(ctx, key)

	if err == nil && cachedResStr != "" {
		// -- cache exists, return cached data --
		slog.Info("Getleaderboard cached result", "cachedRes", cachedResStr)

		var cachedResProto pbstats.GetLeaderboardResponse
		err := proto.Unmarshal([]byte(cachedResStr), &cachedResProto)

		if err == nil {
			slog.Info("cache hit", "cachedResProto", &cachedResProto)
			return &cachedResProto, nil
		}

		slog.Warn("Error when attempting to unmarshal proto", "error", err)
		// back to db fetch after this point
	}

	// -- cache stale / invalid, pull from repo --
	slog.Warn("Cached result doesn't exist or retreival failed.", "key", key, "error", err)

	params := GetPlayerRankings{
		limit:  limit,
		offset: offset,
	}

	playerRankings, err := s.repo.GetPlayerRankings(ctx, &params)

	if err != nil {
		return nil, err
	}

	playerRankingsProto := make([]*pbstats.PlayerRankingStats, len(playerRankings))

	for index, playerRanking := range playerRankings {
		playerRankingProto := &pbstats.PlayerRankingStats{
			Id:        playerRanking.ID.String(),
			Wins:      int32(playerRanking.Wins),
			Username:  playerRanking.Username,
			TopThrees: int32(playerRanking.TopThrees),
			AvatarUrl: playerRanking.AvatarUrl,
			Rating:    int32(playerRanking.Rating),
		}
		playerRankingsProto[index] = playerRankingProto
	}

	res := pbstats.GetLeaderboardResponse{
		Players: playerRankingsProto,
	}

	// cache results w with TTL
	go func() {
		slog.Debug("Caching results of leaderboard response", "res", &res)

		protoRes, err := proto.Marshal(&res)
		if err != nil {
			slog.Warn("could not marshal result for caching, caching failed", "key", key, "error", err)
			return
		}

		s.cache.Set(context.Background(), key, protoRes, time.Hour*1)
	}()

	return &res, nil
}
