package mailbox

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	eventspb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

/**
* The letter request (FS-1GZGD R12, R55, A7.2): the system door. Another service publishes
* mail.letter.requested and this stores one system letter through the admin send's rules
* (prepareLetters), deduplicated through the inbox in the same transaction.
*
* How each outcome settles the delivery, under the notification consumer's handleResult:
*   - stored: nil, acked, then announced on mail:arrived after the commit.
*   - already processed: ErrAlreadyProcessed, acked; nothing stored or announced.
*   - invalid (R3-R5, S1, R55, an unknown template or instance, a malformed id): logged at
*     error, the inbox mark committed alone, nil, acked; never requeued, nothing stored.
*   - items-service unavailable, or any other resolve failure: ErrTransient, rolled back, so
*     not marked processed; requeued with the consumer's delays, then dead-lettered.
*   - no usable event id, or the store failing: a plain error, dead-lettered.
**/

// errLetterRequestInvalid marks an event that breaks the letter rules in a way retrying cannot
// mend, before prepareLetters sees it: no recipient, a malformed id, an enclosure of no kind.
var errLetterRequestInvalid = errors.New("letter request invalid")

// ProcessLetterRequested stores the letter one mail.letter.requested event asks for, once per
// event id. See the outcomes above.
func (s *service) ProcessLetterRequested(ctx context.Context, evt *eventspb.LetterRequested) error {
	// Without a usable event id the inbox cannot dedupe, and retrying will not grow one.
	eventID, err := uuid.Parse(evt.GetEventId())
	if err != nil {
		return fmt.Errorf("letter request event id %q is not a uuid: %w", evt.GetEventId(), err)
	}

	var stored []Letter
	err = s.withTx(ctx, func(tx *sqlx.Tx) error {
		inserted, err := s.inbox.MarkEventProcessed(ctx, tx, eventID, commonconstants.MailLetterRequestedEvent)
		if err != nil {
			return fmt.Errorf("mark letter request processed: %w", err)
		}
		if !inserted {
			return commonconstants.ErrAlreadyProcessed
		}

		letters, err := s.requestedLetters(ctx, evt)
		if requestInvalid(err) {
			// commit the mark alone: the request is settled, and nothing is stored
			slog.ErrorContext(ctx, "mailbox: letter request invalid; marked processed, nothing stored",
				"event_id", eventID,
				"sent_by_source", evt.GetSource(),
				"error", err,
			)
			return nil
		}
		if err != nil {
			// items unreachable or answering out of contract: roll the mark back and retry
			return fmt.Errorf("prepare requested letter: %w: %w", commonconstants.ErrTransient, err)
		}

		if err := s.repo.InsertLetters(ctx, tx, letters); err != nil {
			return fmt.Errorf("store requested letter: %w", err)
		}
		stored = letters
		return nil
	})
	if err != nil {
		return err
	}

	if len(stored) == 0 {
		return nil // invalid, settled without a letter: nothing to announce
	}
	slog.InfoContext(ctx, "mailbox: requested letter stored",
		"event_id", eventID,
		"letter_id", stored[0].ID,
		"sent_by_source", stored[0].SentBy.Source,
	)
	// committed: announce outside the transaction; it never fails the event
	s.arrivals.PublishArrivals(ctx, stored)
	return nil
}

// requestedLetters checks the event and builds its letter through the send path, resolving
// its item enclosures. Nothing is stored.
func (s *service) requestedLetters(ctx context.Context, evt *eventspb.LetterRequested) ([]Letter, error) {
	source, err := ParseSentBySource(evt.GetSource())
	if err != nil {
		return nil, err
	}
	draft, err := draftFromRequest(evt)
	if err != nil {
		return nil, err
	}
	return s.prepareLetters(ctx, draft, systemFrom(source))
}

// requestInvalid reports whether a request failed on its own content, which retrying cannot mend: a
// refusal of the letter rules, a bad source or a malformed event.
func requestInvalid(err error) bool {
	var refusal *errcode.Refusal
	return errors.As(err, &refusal) ||
		errors.Is(err, ErrSentBySourceInvalid) ||
		errors.Is(err, errLetterRequestInvalid)
}

// draftFromRequest reads the event into a send's draft: one member or every member, never a
// list (A6).
func draftFromRequest(evt *eventspb.LetterRequested) (LetterDraft, error) {
	var recipient Recipient
	switch target := evt.GetRecipient().(type) {
	case *eventspb.LetterRequested_MemberId:
		id, err := uuid.Parse(target.MemberId)
		if err != nil {
			return LetterDraft{}, fmt.Errorf("%w: member id %q", errLetterRequestInvalid, target.MemberId)
		}
		recipient = Recipient{Kind: RecipientMember, MemberIDs: []uuid.UUID{id}}
	case *eventspb.LetterRequested_AllMembers:
		if !target.AllMembers {
			return LetterDraft{}, fmt.Errorf("%w: all_members is false", errLetterRequestInvalid)
		}
		recipient = Recipient{Kind: RecipientAllMembers}
	default:
		return LetterDraft{}, fmt.Errorf("%w: no recipient", errLetterRequestInvalid)
	}

	enclosures := make([]EnclosureRequest, 0, len(evt.GetEnclosures()))
	for i, e := range evt.GetEnclosures() {
		enc, err := enclosureFromRequest(e)
		if err != nil {
			return LetterDraft{}, fmt.Errorf("enclosure %d: %w", i, err)
		}
		enclosures = append(enclosures, enc)
	}

	draft := LetterDraft{
		Recipient:  recipient,
		Title:      evt.GetTitle(),
		Body:       evt.GetBody(),
		Enclosures: enclosures,
	}
	if evt.ExpiresAt != nil {
		expiry := evt.GetExpiresAt().AsTime()
		draft.ExpiresAt = &expiry
	}
	return draft, nil
}

func enclosureFromRequest(e *eventspb.LetterRequestedEnclosure) (EnclosureRequest, error) {
	switch kind := e.GetKind().(type) {
	case *eventspb.LetterRequestedEnclosure_Template:
		id, err := uuid.Parse(kind.Template.GetTemplateId())
		if err != nil {
			return EnclosureRequest{}, fmt.Errorf("%w: template id %q", errLetterRequestInvalid, kind.Template.GetTemplateId())
		}
		return EnclosureRequest{Kind: RequestTemplate, TemplateID: id, Quantity: kind.Template.GetQuantity(), ItemLevel: kind.Template.ItemLevel}, nil
	case *eventspb.LetterRequestedEnclosure_Copy:
		id, err := uuid.Parse(kind.Copy.GetInstanceId())
		if err != nil {
			return EnclosureRequest{}, fmt.Errorf("%w: instance id %q", errLetterRequestInvalid, kind.Copy.GetInstanceId())
		}
		return EnclosureRequest{Kind: RequestCopy, CopyOf: id, Quantity: kind.Copy.GetQuantity()}, nil
	case *eventspb.LetterRequestedEnclosure_Gold:
		return EnclosureRequest{Kind: RequestGold, Gold: kind.Gold}, nil
	default:
		return EnclosureRequest{}, fmt.Errorf("%w: an enclosure of no kind", errLetterRequestInvalid)
	}
}
