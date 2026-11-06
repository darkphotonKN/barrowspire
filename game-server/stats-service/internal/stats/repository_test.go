package stats

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	pbstats "github.com/darkphotonKN/barrowspire-server/common/api/proto/stats"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/inbox"
	"github.com/darkphotonKN/barrowspire-server/common/utils/cache"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// A foreign-key violation keeps its SQLSTATE through the repo boundary, so the
// consumer can tell a reference that is not there yet from a malformed event,
// while still reading as a constraint violation to every other caller.
func TestWrapDBErr_ForeignKeyViolationKeepsSQLState(t *testing.T) {
	got := wrapDBErr("create match history", &pq.Error{Code: "23503"})

	if !errors.Is(got, commonconstants.ErrConstraintViolation) {
		t.Fatalf("%v is not a constraint violation", got)
	}
	var pqErr *pq.Error
	if !errors.As(got, &pqErr) || pqErr.Code != "23503" {
		t.Fatalf("%v lost its SQLSTATE 23503", got)
	}
	if o := classify(got); o.disposition != retryBounded {
		t.Fatalf("classified as %v, want %v", o.disposition, retryBounded)
	}
}

// Every other constraint violation is still only the sentinel, and rejected.
func TestWrapDBErr_OtherConstraintViolationIsRejected(t *testing.T) {
	got := wrapDBErr("create match history", &pq.Error{Code: "23502"})

	if !errors.Is(got, commonconstants.ErrConstraintViolation) {
		t.Fatalf("%v is not a constraint violation", got)
	}
	if o := classify(got); o.disposition != reject {
		t.Fatalf("classified as %v, want %v", o.disposition, reject)
	}
}

// The tests below need real Postgres: a struct with no field for a column only
// fails inside sqlx. The DSN is supplied by the caller and they skip when it is
// absent or unreachable, like common/inbox's, so a plain `go test` never reaches
// for the database stats-service runs on.
const testDSNEnv = "STATS_TEST_DB_DSN"

const (
	dropAvatarVersion = 6
	dropAvatarUp      = "000006_drop_ranking_avatar_url.up.sql"
	dropAvatarDown    = "000006_drop_ranking_avatar_url.down.sql"
)

func readMigration(t *testing.T, name string) string {
	t.Helper()
	sql, err := os.ReadFile(filepath.Join("../../migrations", name))
	require.NoError(t, err)
	return string(sql)
}

// schemaAt connects to a fresh schema holding the real up files through
// version. The schema comes first on the search_path, so every object the files
// create or alter is its own, and it is dropped when the test ends. public stays
// on the path for the uuid extension.
func schemaAt(t *testing.T, version int) *sqlx.DB {
	t.Helper()
	if testing.Short() {
		t.Skip("needs a database; skipped under -short")
	}
	dsn := os.Getenv(testDSNEnv)
	if dsn == "" {
		t.Skipf("set %s to a postgres the test may create a throwaway schema in", testDSNEnv)
	}
	admin, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Skipf("no database reachable at %s: %v", testDSNEnv, err)
	}
	t.Cleanup(func() { _ = admin.Close() })

	// 000001 would install this in the scratch schema and it would go with it.
	_, err = admin.Exec(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public`)
	require.NoError(t, err)

	schema := "tvczq_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	_, err = admin.Exec(`CREATE SCHEMA ` + schema)
	require.NoError(t, err)
	t.Cleanup(func() { _, _ = admin.Exec(`DROP SCHEMA ` + schema + ` CASCADE`) })

	separator := "?"
	if strings.Contains(dsn, "?") {
		separator = "&"
	}
	db, err := sqlx.Connect("postgres", dsn+separator+"search_path="+schema+",public")
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	files, err := filepath.Glob("../../migrations/*.up.sql")
	require.NoError(t, err)
	require.NotEmpty(t, files)
	for _, file := range files {
		var n int
		_, err := fmt.Sscanf(filepath.Base(file), "%06d", &n)
		require.NoError(t, err)
		if n > version {
			continue
		}
		_, err = db.Exec(readMigration(t, filepath.Base(file)))
		require.NoError(t, err, file)
	}
	return db
}

// avatarColumn is player_ranking_stats.avatar_url as the catalog has it, empty
// when there is no such column.
func avatarColumn(t *testing.T, db *sqlx.DB) []string {
	t.Helper()
	var shape []string
	require.NoError(t, db.Select(&shape, `
		SELECT data_type || ' nullable=' || is_nullable || ' default=' || coalesce(column_default, '-')
		  FROM information_schema.columns
		 WHERE table_schema = current_schema()
		   AND table_name = 'player_ranking_stats' AND column_name = 'avatar_url'`))
	return shape
}

// FS-TVCZQ §Requirements 27: the column goes and every ranking row stays.
func TestDropAvatarMigration_Up_DropsColumnKeepsRows(t *testing.T) {
	db := schemaAt(t, dropAvatarVersion-1)
	require.NotEmpty(t, avatarColumn(t, db))
	memberID := uuid.New()
	_, err := db.Exec(`INSERT INTO player_ranking_stats (member_id, username, wins, top_threes, rating, rank_position, avatar_url)
		VALUES ($1, 'Delver', 4, 2, 1100, 7, 'https://cdn.example.com/a.png')`, memberID)
	require.NoError(t, err)

	_, err = db.Exec(readMigration(t, dropAvatarUp))
	require.NoError(t, err)

	assert.Empty(t, avatarColumn(t, db))
	got, err := NewRepository(db).GetPlayerRankings(context.Background(), &GetPlayerRankings{limit: 10})
	require.NoError(t, err)
	require.Len(t, got, 1)
	assert.Equal(t, memberID, got[0].MemberID)
	assert.Equal(t, "Delver", got[0].Username)
	assert.Equal(t, 4, got[0].Wins)
	assert.Equal(t, 2, got[0].TopThrees)
	assert.Equal(t, 1100, got[0].Rating)
	require.NotNil(t, got[0].RankPosition)
	assert.Equal(t, 7, *got[0].RankPosition)
}

// FS-TVCZQ §Requirements 27 and §Edge States (rollback): the down file restores
// the column as it stood at 000005 with no URL in it. The image rolled back to
// scans it into a plain string, which fails on NULL, so existing rows hold an
// empty string, the value that image itself writes for "no avatar".
func TestDropAvatarMigration_Down_RestoresTheEmptyColumn(t *testing.T) {
	want := avatarColumn(t, schemaAt(t, dropAvatarVersion-1))

	db := schemaAt(t, dropAvatarVersion)
	memberID := uuid.New()
	_, err := db.Exec(`INSERT INTO player_ranking_stats (member_id, username) VALUES ($1, 'Delver')`, memberID)
	require.NoError(t, err)

	_, err = db.Exec(readMigration(t, dropAvatarDown))
	require.NoError(t, err)

	assert.Equal(t, want, avatarColumn(t, db))
	var url string
	require.NoError(t, db.Get(&url, `SELECT avatar_url FROM player_ranking_stats WHERE member_id = $1`, memberID))
	assert.Empty(t, url, "no URL comes back")

	// The up file applies again.
	_, err = db.Exec(readMigration(t, dropAvatarUp))
	assert.NoError(t, err)
}

// FS-TVCZQ §Requirements 24, 27: sqlx fails a RETURNING * on a column with no
// struct field and an explicit column that no longer exists, so the upsert and
// the leaderboard read are run against the schema the pod really boots to.
func TestRankingRepository_After000006_UpsertsAndReads(t *testing.T) {
	db := schemaAt(t, dropAvatarVersion)
	repo := NewRepository(db)
	ctx := context.Background()
	memberID := uuid.New()
	rank := 3

	tx, err := db.Beginx()
	require.NoError(t, err)
	defer func() { _ = tx.Rollback() }()

	inserted, err := repo.UpsertPlayerRankingStatsTx(ctx, tx, &UpdatePlayerRankingsParams{
		MemberID: memberID, Username: "Delver", Wins: 1, TopThrees: 1, Rating: 900, RankPosition: &rank,
	})
	require.NoError(t, err)
	assert.Equal(t, memberID, inserted.MemberID)
	assert.Equal(t, "Delver", inserted.Username)

	updated, err := repo.UpsertPlayerRankingStatsTx(ctx, tx, &UpdatePlayerRankingsParams{
		MemberID: memberID, Username: "Renamed", Wins: 2, TopThrees: 1, Rating: 950, RankPosition: &rank,
	})
	require.NoError(t, err)
	assert.Equal(t, inserted.ID, updated.ID, "the same row")
	assert.Equal(t, "Renamed", updated.Username)
	assert.Equal(t, 2, updated.Wins)

	read, err := repo.GetPlayerRankingStatsTx(ctx, tx, memberID)
	require.NoError(t, err)
	assert.Equal(t, "Renamed", read.Username)
	require.NoError(t, tx.Commit())

	rankings, err := repo.GetPlayerRankings(ctx, &GetPlayerRankings{limit: 10})
	require.NoError(t, err)
	require.Len(t, rankings, 1)
	assert.Equal(t, "Renamed", rankings[0].Username)
	assert.Equal(t, 950, rankings[0].Rating)
}

// missCache is a cache with nothing in it, so a leaderboard read reaches the
// database.
type missCache struct {
	cache.Cache
}

func (missCache) Get(ctx context.Context, key string) (string, error) {
	return "", errors.New("cache miss")
}

func (missCache) Set(ctx context.Context, key string, value interface{}, expiration time.Duration) error {
	return nil
}

func (missCache) Incr(ctx context.Context, key string) (int64, error) { return 1, nil }

// FS-TVCZQ §Acceptance Criteria: after 000006 the match-completed path and the
// leaderboard read work on real tables. Per-player writes are off in
// applyMatchEnded (PvE pivot), so the event is recorded through
// ProcessMatchCompleted and the writes it would make run through
// applyPlayerResult, the same code once they are turned back on.
func TestMatchCompletedAndLeaderboard_After000006(t *testing.T) {
	db := schemaAt(t, dropAvatarVersion)
	svc := NewService(NewRepository(db), inbox.NewRepo(), nil, db, missCache{})
	ctx := context.Background()
	eventID := uuid.New()
	event := twoPlayerMatch()
	event.MatchStartedAt = timestamppb.Now()
	for _, player := range event.Players {
		player.FinalPosition = 1 // match_history checks it is at least 1
	}

	require.NoError(t, svc.ProcessMatchCompleted(ctx, eventID, commonconstants.GameMatchEnded, event))
	err := svc.ProcessMatchCompleted(ctx, eventID, commonconstants.GameMatchEnded, event)
	require.ErrorIs(t, err, commonconstants.ErrAlreadyProcessed, "a redelivery is recognised")

	tx, err := db.Beginx()
	require.NoError(t, err)
	defer func() { _ = tx.Rollback() }()
	sessionID := uuid.MustParse(event.SessionId)
	for _, player := range event.Players {
		require.NoError(t, svc.applyPlayerResult(ctx, tx, sessionID, event, player))
	}
	require.NoError(t, tx.Commit())

	res, err := svc.GetLeaderboard(ctx, &pbstats.GetLeaderboardRequest{})
	require.NoError(t, err)
	var names []string
	for _, player := range res.Players {
		names = append(names, player.Username)
	}
	assert.ElementsMatch(t, []string{"a", "b"}, names)
}
