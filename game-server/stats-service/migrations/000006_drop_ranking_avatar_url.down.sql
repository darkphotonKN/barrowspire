-- FS-TVCZQ §Requirements 27. Restores the column as 000002 added it, with no URL
-- in it. Existing rows get an empty string rather than NULL: the image this rolls
-- back to scans the column into a plain string and writes '' for "no avatar", so
-- a NULL would fail its leaderboard read.
ALTER TABLE player_ranking_stats ADD COLUMN avatar_url TEXT;
UPDATE player_ranking_stats SET avatar_url = '';
