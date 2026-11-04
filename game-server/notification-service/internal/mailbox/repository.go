package mailbox

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

type repository struct {
	db *sqlx.DB
}

func NewRepository(db *sqlx.DB) *repository {
	return &repository{db: db}
}

// letterColumns per inserted row.
const letterColumns = 10

// InsertLetters stores letters in one statement on tx, so the caller's
// transaction decides what commits with them: the admin send commits them
// alone, a letter request (I-1GZGD-5) with its inbox mark. All or none.
func (r *repository) InsertLetters(ctx context.Context, tx sqlx.ExtContext, letters []Letter) error {
	if len(letters) == 0 {
		return nil
	}

	var query strings.Builder
	query.WriteString(`INSERT INTO letters (id, title, body, sender, member_id, enclosures, sent_at, expires_at, sent_by_member_id, sent_by_source) VALUES `)
	args := make([]any, 0, len(letters)*letterColumns)
	for i, l := range letters {
		enclosures, err := json.Marshal(nonNilEnclosures(l.Enclosures))
		if err != nil {
			return fmt.Errorf("encode enclosures of letter %s: %w", l.ID, err)
		}
		if i > 0 {
			query.WriteString(", ")
		}
		n := i * letterColumns
		query.WriteString("(")
		for c := 1; c <= letterColumns; c++ {
			if c > 1 {
				query.WriteString(", ")
			}
			fmt.Fprintf(&query, "$%d", n+c)
		}
		query.WriteString(")")
		args = append(args, l.ID, l.Title, l.Body, string(l.Sender), l.MemberID, enclosures, l.SentAt, l.ExpiresAt,
			l.SentBy.MemberID, sentBySource(l.SentBy.Source))
	}

	if _, err := tx.ExecContext(ctx, query.String(), args...); err != nil {
		return fmt.Errorf("insert %d letters: %w", len(letters), err)
	}
	return nil
}

// letterRow is a letters row joined with the reader's state row, if any.
type letterRow struct {
	ID         uuid.UUID     `db:"id"`
	Title      string        `db:"title"`
	Body       string        `db:"body"`
	Sender     string        `db:"sender"`
	MemberID   uuid.NullUUID `db:"member_id"`
	Enclosures []byte        `db:"enclosures"`
	SentAt     time.Time     `db:"sent_at"`
	ExpiresAt  time.Time     `db:"expires_at"`
	ReadAt     sql.NullTime  `db:"read_at"`
	ClaimState string        `db:"claim_state"`
}

func (row letterRow) letter() (Letter, error) {
	var enclosures []Enclosure
	if err := json.Unmarshal(row.Enclosures, &enclosures); err != nil {
		return Letter{}, fmt.Errorf("decode enclosures of letter %s: %w", row.ID, err)
	}
	l := Letter{
		ID:         row.ID,
		Title:      row.Title,
		Body:       row.Body,
		Sender:     Sender(row.Sender),
		Enclosures: nonNilEnclosures(enclosures),
		SentAt:     row.SentAt,
		ExpiresAt:  row.ExpiresAt,
	}
	if row.MemberID.Valid {
		member := row.MemberID.UUID
		l.MemberID = &member
	}
	return l, nil
}

// addressedTo is the one definition of "this member's letters": addressed to
// them, or to every member. $1 is the member.
const addressedTo = `(l.member_id = $1 OR l.member_id IS NULL)`

// ListLetters reads a member's mailbox: the newest limit non-expired letters
// addressed to them or to all, each with the member's read and claim state.
// No state row reads as unread and unclaimed (R6).
func (r *repository) ListLetters(ctx context.Context, member uuid.UUID, now time.Time, limit int) ([]MailboxLetter, error) {
	query := `
	SELECT l.id, l.title, l.body, l.sender, l.member_id, l.enclosures, l.sent_at, l.expires_at,
	       s.read_at, COALESCE(s.claim_state, 'unclaimed') AS claim_state
	FROM letters l
	LEFT JOIN letter_states s ON s.letter_id = l.id AND s.member_id = $1
	WHERE ` + addressedTo + ` AND l.expires_at > $2
	ORDER BY l.sent_at DESC, l.id DESC
	LIMIT $3`

	var rows []letterRow
	if err := sqlx.SelectContext(ctx, r.db, &rows, query, member, now, limit); err != nil {
		return nil, fmt.Errorf("list letters of member %s: %w", member, err)
	}

	letters := make([]MailboxLetter, 0, len(rows))
	for _, row := range rows {
		l, err := row.letter()
		if err != nil {
			return nil, err
		}
		state := ClaimState(row.ClaimState)
		if len(l.Enclosures) == 0 {
			state = ClaimNone
		}
		letters = append(letters, MailboxLetter{Letter: l, Read: row.ReadAt.Valid, ClaimState: state})
	}
	return letters, nil
}

// Summary counts a member's non-expired letters (R9, S6). A letter holds
// unclaimed enclosures while it has any and its claim is not 'claimed'.
func (r *repository) Summary(ctx context.Context, member uuid.UUID, now time.Time) (Summary, error) {
	query := `
	WITH mailbox AS (
		SELECT l.sent_at,
		       s.read_at IS NULL AS unread,
		       jsonb_array_length(l.enclosures) > 0
		         AND COALESCE(s.claim_state, 'unclaimed') <> 'claimed' AS unclaimed
		FROM letters l
		LEFT JOIN letter_states s ON s.letter_id = l.id AND s.member_id = $1
		WHERE ` + addressedTo + ` AND l.expires_at > $2
	)
	SELECT COUNT(*) FILTER (WHERE unread)                AS unread,
	       COUNT(*) FILTER (WHERE unclaimed)             AS unclaimed,
	       COUNT(*) FILTER (WHERE unread OR unclaimed)   AS waiting,
	       MAX(sent_at)                                  AS newest
	FROM mailbox`

	var row struct {
		Unread    int          `db:"unread"`
		Unclaimed int          `db:"unclaimed"`
		Waiting   int          `db:"waiting"`
		Newest    sql.NullTime `db:"newest"`
	}
	if err := sqlx.GetContext(ctx, r.db, &row, query, member, now); err != nil {
		return Summary{}, fmt.Errorf("summarize mailbox of member %s: %w", member, err)
	}

	summary := Summary{Unread: row.Unread, Unclaimed: row.Unclaimed, Waiting: row.Waiting}
	if row.Newest.Valid {
		newest := row.Newest.Time
		summary.NewestLetterAt = &newest
	}
	return summary, nil
}

// FindAddressed reads one letter if it is addressed to member or to every
// member, expired or not. Anything else is ErrLetterNotFound.
func (r *repository) FindAddressed(ctx context.Context, letterID, member uuid.UUID) (*Letter, error) {
	query := `
	SELECT l.id, l.title, l.body, l.sender, l.member_id, l.enclosures, l.sent_at, l.expires_at,
	       NULL::timestamptz AS read_at, '' AS claim_state
	FROM letters l
	WHERE ` + addressedTo + ` AND l.id = $2`

	var row letterRow
	if err := sqlx.GetContext(ctx, r.db, &row, query, member, letterID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrLetterNotFound
		}
		return nil, fmt.Errorf("find letter %s for member %s: %w", letterID, member, err)
	}
	l, err := row.letter()
	if err != nil {
		return nil, err
	}
	return &l, nil
}

// MarkRead records that member read the letter at at, creating the member's
// state row on first use (R6, R8). A repeat keeps the first read time.
//
// It never waits on a claim in flight, and never makes one wait: a claim holds
// the row locked across its items and wallet calls and records the read
// itself, so a row another transaction holds is skipped, not waited for. The
// row is created only when a plain read sees none (as EnsureState does), and
// the read time is set only on a row still unread, so marking an already read
// letter takes no lock at all and cannot make a claim's NOWAIT refuse.
func (r *repository) MarkRead(ctx context.Context, letterID, member uuid.UUID, at time.Time) error {
	create := `
	INSERT INTO letter_states (letter_id, member_id, read_at)
	SELECT $1, $2, $3
	WHERE NOT EXISTS (SELECT 1 FROM letter_states WHERE letter_id = $1 AND member_id = $2)
	ON CONFLICT (letter_id, member_id) DO NOTHING`

	if _, err := r.db.ExecContext(ctx, create, letterID, member, at); err != nil {
		return fmt.Errorf("mark letter %s read for member %s: %w", letterID, member, err)
	}

	mark := `
	WITH unread AS (
		SELECT letter_id, member_id FROM letter_states
		WHERE letter_id = $1 AND member_id = $2 AND read_at IS NULL
		FOR UPDATE SKIP LOCKED
	)
	UPDATE letter_states s
	SET read_at = $3
	FROM unread u
	WHERE s.letter_id = u.letter_id AND s.member_id = u.member_id`

	if _, err := r.db.ExecContext(ctx, mark, letterID, member, at); err != nil {
		return fmt.Errorf("mark letter %s read for member %s: %w", letterID, member, err)
	}
	return nil
}

// EnsureState creates the member's state row for a letter if absent (R6),
// committed at once, outside any claim's transaction, so a claim always finds
// a committed row to lock.
//
// It must never wait on a claim in flight, which holds the row locked and
// updated: a bare INSERT … ON CONFLICT DO NOTHING would, since its conflict
// check waits for the transaction that last updated the conflicting row. So
// the insert is only attempted when a plain read sees no row; ON CONFLICT
// then settles two first claims racing to create it, the loser waiting only
// for the winner's one-statement insert.
func (r *repository) EnsureState(ctx context.Context, letterID, member uuid.UUID) error {
	query := `
	INSERT INTO letter_states (letter_id, member_id)
	SELECT $1, $2
	WHERE NOT EXISTS (SELECT 1 FROM letter_states WHERE letter_id = $1 AND member_id = $2)
	ON CONFLICT (letter_id, member_id) DO NOTHING`

	if _, err := r.db.ExecContext(ctx, query, letterID, member); err != nil {
		return fmt.Errorf("ensure state of letter %s for member %s: %w", letterID, member, err)
	}
	return nil
}

// pgLockNotAvailable is the SQLSTATE of a NOWAIT lock another transaction
// holds.
const pgLockNotAvailable = "55P03"

// LockState takes the row lock on the member's state row for the rest of tx
// and answers its claim state (ADR-0044 §Decision 3). It never waits: a row
// another claim holds is ErrStateLocked.
func (r *repository) LockState(ctx context.Context, tx sqlx.ExtContext, letterID, member uuid.UUID) (ClaimState, error) {
	query := `
	SELECT claim_state FROM letter_states
	WHERE letter_id = $1 AND member_id = $2
	FOR UPDATE NOWAIT`

	var state string
	if err := sqlx.GetContext(ctx, tx, &state, query, letterID, member); err != nil {
		var pqErr *pq.Error
		if errors.As(err, &pqErr) && pqErr.Code == pgLockNotAvailable {
			return "", ErrStateLocked
		}
		return "", fmt.Errorf("lock state of letter %s for member %s: %w", letterID, member, err)
	}
	return ClaimState(state), nil
}

// StartClaim is the conditional move out of 'unclaimed' (R25): it moves the
// row to 'claiming', or keeps it there when an earlier attempt left it, and
// marks the letter read (R13). A 'claimed' row is never moved back.
func (r *repository) StartClaim(ctx context.Context, tx sqlx.ExtContext, letterID, member uuid.UUID, at time.Time) error {
	query := `
	UPDATE letter_states
	SET claim_state = 'claiming', read_at = COALESCE(read_at, $3)
	WHERE letter_id = $1 AND member_id = $2 AND claim_state IN ('unclaimed', 'claiming')`

	return updateOne(ctx, tx, "start claim", query, letterID, member, at)
}

// FinishClaim records 'claimed', only from 'claiming' (R17).
func (r *repository) FinishClaim(ctx context.Context, tx sqlx.ExtContext, letterID, member uuid.UUID) error {
	query := `
	UPDATE letter_states
	SET claim_state = 'claimed'
	WHERE letter_id = $1 AND member_id = $2 AND claim_state = 'claiming'`

	return updateOne(ctx, tx, "finish claim", query, letterID, member)
}

// RevertClaim puts a 'claiming' row back to the state the claim locked it in
// (R17): after items refused the grant, so nothing was minted. The read the
// claim recorded stays.
func (r *repository) RevertClaim(ctx context.Context, tx sqlx.ExtContext, letterID, member uuid.UUID, to ClaimState) error {
	query := `
	UPDATE letter_states
	SET claim_state = $3
	WHERE letter_id = $1 AND member_id = $2 AND claim_state = 'claiming'`

	return updateOne(ctx, tx, "revert claim", query, letterID, member, string(to))
}

// errStateNotMoved: a conditional claim update matched no row, which under
// the row lock means the state was not what the caller locked.
var errStateNotMoved = errors.New("letter state not in the expected claim state")

func updateOne(ctx context.Context, tx sqlx.ExtContext, op, query string, letterID, member uuid.UUID, args ...any) error {
	res, err := tx.ExecContext(ctx, query, append([]any{letterID, member}, args...)...)
	if err != nil {
		return fmt.Errorf("%s of letter %s for member %s: %w", op, letterID, member, err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("%s of letter %s for member %s: %w", op, letterID, member, err)
	}
	if n != 1 {
		return fmt.Errorf("%s of letter %s for member %s: %w", op, letterID, member, errStateNotMoved)
	}
	return nil
}

// sentBySource stores an official letter's absent source as NULL, never as
// an empty string.
func sentBySource(source SentBySource) sql.NullString {
	return sql.NullString{String: string(source), Valid: source != ""}
}

// nonNilEnclosures keeps "no enclosures" a JSON [] on the way in and an empty
// slice on the way out.
func nonNilEnclosures(e []Enclosure) []Enclosure {
	if e == nil {
		return []Enclosure{}
	}
	return e
}
