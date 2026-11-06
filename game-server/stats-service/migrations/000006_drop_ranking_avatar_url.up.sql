-- FS-TVCZQ §Requirements 27. Avatar upload is gone, so the denormalized copy of
-- the URL on the leaderboard goes with it. Existing values are lost for good.
--
-- Ships with the removal of PlayerRankingStats.AvatarUrl: the repository upserts
-- with RETURNING * through sqlx, which fails on a column with no struct field.
-- Migrations run at pod boot, so a new pod never sees the column.
ALTER TABLE player_ranking_stats DROP COLUMN IF EXISTS avatar_url;
