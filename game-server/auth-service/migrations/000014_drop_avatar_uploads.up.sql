-- FS-TVCZQ §Requirements 19. Avatar upload is gone, so its table and column go
-- with it. Existing avatar URLs are lost for good.
--
-- Ships with the removal of models.Member.AvatarURL: auth reads members with
-- SELECT * and RETURNING * through sqlx, which fails on a column with no struct
-- field. Migrations run at pod boot, so a new pod never sees the column.
DROP TABLE IF EXISTS avatar_uploads;
ALTER TABLE members DROP COLUMN IF EXISTS avatar_url;
