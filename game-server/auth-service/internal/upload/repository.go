package upload

import (
	"context"
	"fmt"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// repository implements Repository interface
type repository struct {
	db *sqlx.DB
}

// NewRepository creates a new repository instance
func NewRepository(db *sqlx.DB) *repository {
	return &repository{
		db: db,
	}
}

// wrapDBErr is the repo boundary translation point: it delegates to the shared
// WrapDBErr helper, which converts infrastructure errors into domain sentinels
// and wraps anything else with the repo name + operation for context.
func wrapDBErr(op string, err error) error {
	return commonhelpers.WrapDBErr("upload repo", op, err)
}

// CreateUpload creates a new upload record
func (r *repository) CreateUpload(ctx context.Context, upload *AvatarUpload) error {
	query := `
		INSERT INTO avatar_uploads (
			id, member_id, s3_key, upload_status,
			file_size, content_type, presigned_url_expires_at
		) VALUES (
			:id, :member_id, :s3_key, :upload_status,
			:file_size, :content_type, :presigned_url_expires_at
		)`

	_, err := r.db.NamedExecContext(ctx, query, upload)
	if err != nil {
		return wrapDBErr("create upload record", err)
	}

	return nil
}

// GetUploadByID retrieves an upload by ID
func (r *repository) GetUploadByID(ctx context.Context, id uuid.UUID) (*AvatarUpload, error) {
	var upload AvatarUpload
	query := `
		SELECT id, member_id, s3_key, upload_status,
		       file_size, content_type, presigned_url_expires_at,
		       created_at, updated_at
		FROM avatar_uploads
		WHERE id = $1`

	err := r.db.GetContext(ctx, &upload, query, id)
	if err != nil {
		return nil, wrapDBErr("get upload by id", err)
	}

	return &upload, nil
}

// UpdateUploadStatus updates the status of an upload
func (r *repository) UpdateUploadStatus(ctx context.Context, id uuid.UUID, status string) error {
	query := `
		UPDATE avatar_uploads
		SET upload_status = $2, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1`

	result, err := r.db.ExecContext(ctx, query, id, status)
	if err != nil {
		return wrapDBErr("update upload status", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("checking rows affected: %w", err)
	}

	if rows == 0 {
		return fmt.Errorf("upload not found")
	}

	return nil
}

// UpdateUploadStatus updates the status of an upload
func (r *repository) UpdateUploadStatusTx(ctx context.Context, tx *sqlx.Tx, id uuid.UUID, status string) error {
	query := `
		UPDATE avatar_uploads
		SET upload_status = $2, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1`

	result, err := tx.ExecContext(ctx, query, id, status)
	if err != nil {
		return wrapDBErr("update upload status in tx", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("checking rows affected: %w", err)
	}

	if rows == 0 {
		return fmt.Errorf("upload not found")
	}

	return nil
}

// GetPendingUploadsByMember retrieves pending uploads for a member
func (r *repository) GetPendingUploadsByMember(ctx context.Context, memberID uuid.UUID) ([]*AvatarUpload, error) {
	var uploads []*AvatarUpload
	query := `
		SELECT id, member_id, s3_key, upload_status,
		       file_size, content_type, presigned_url_expires_at,
		       created_at, updated_at
		FROM avatar_uploads
		WHERE member_id = $1 AND upload_status = $2
		ORDER BY created_at DESC`

	err := r.db.SelectContext(ctx, &uploads, query, memberID, StatusPending)
	if err != nil {
		return nil, wrapDBErr("get pending uploads by member", err)
	}

	return uploads, nil
}
