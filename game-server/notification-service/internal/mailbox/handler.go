package mailbox

import (
	"context"
	"errors"
	"log/slog"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/notification"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Service is what the mailbox gRPC methods need.
type Service interface {
	SendLetter(ctx context.Context, caller commonauth.Identity, draft LetterDraft) (*SentLetters, error)
	ListLetters(ctx context.Context, member uuid.UUID) ([]MailboxLetter, error)
	MailboxSummary(ctx context.Context, member uuid.UUID) (Summary, error)
	MarkLetterRead(ctx context.Context, letterID, member uuid.UUID) error
	ClaimLetter(ctx context.Context, letterID, member uuid.UUID) (*Claim, error)
}

// Handler serves the mailbox methods of NotificationService. It does not
// embed the generated Unimplemented server: config composes it with the
// notification handler, which does, into the one registered server.
type Handler struct {
	service Service
}

func NewHandler(service Service) *Handler {
	return &Handler{service: service}
}

// caller is the forwarded token's identity, embedded by the auth interceptor.
func caller(ctx context.Context) (commonauth.Identity, error) {
	id, ok := commonauth.IdentityFromCtx(ctx)
	if !ok {
		return commonauth.Identity{}, status.Error(codes.Unauthenticated, "no caller")
	}
	return id, nil
}

func (h *Handler) SendLetter(ctx context.Context, req *pb.SendLetterRequest) (*pb.SendLetterResponse, error) {
	who, err := caller(ctx)
	if err != nil {
		return nil, err
	}
	draft, err := draftFromProto(req)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	sent, err := h.service.SendLetter(ctx, who, draft)
	if err != nil {
		return nil, statusOf(ctx, "send letter", err)
	}

	res := &pb.SendLetterResponse{
		Letters:   make([]*pb.SentLetter, 0, len(sent.Letters)),
		ExpiresAt: timestamppb.New(sent.ExpiresAt),
	}
	for _, l := range sent.Letters {
		entry := &pb.SentLetter{LetterId: l.LetterID.String()}
		if l.MemberID != nil {
			member := l.MemberID.String()
			entry.MemberId = &member
		}
		res.Letters = append(res.Letters, entry)
	}
	return res, nil
}

func (h *Handler) ListLetters(ctx context.Context, _ *pb.ListLettersRequest) (*pb.ListLettersResponse, error) {
	who, err := caller(ctx)
	if err != nil {
		return nil, err
	}
	letters, err := h.service.ListLetters(ctx, who.MemberID)
	if err != nil {
		return nil, statusOf(ctx, "list letters", err)
	}

	res := &pb.ListLettersResponse{Letters: make([]*pb.Letter, 0, len(letters))}
	for _, l := range letters {
		res.Letters = append(res.Letters, letterToProto(l))
	}
	return res, nil
}

func (h *Handler) GetMailboxSummary(ctx context.Context, _ *pb.GetMailboxSummaryRequest) (*pb.MailboxSummary, error) {
	who, err := caller(ctx)
	if err != nil {
		return nil, err
	}
	summary, err := h.service.MailboxSummary(ctx, who.MemberID)
	if err != nil {
		return nil, statusOf(ctx, "mailbox summary", err)
	}

	res := &pb.MailboxSummary{
		UnreadCount:    int32(summary.Unread),
		UnclaimedCount: int32(summary.Unclaimed),
		WaitingCount:   int32(summary.Waiting),
	}
	if summary.NewestLetterAt != nil {
		res.NewestLetterAt = timestamppb.New(*summary.NewestLetterAt)
	}
	return res, nil
}

func (h *Handler) MarkLetterRead(ctx context.Context, req *pb.MarkLetterReadRequest) (*pb.MarkLetterReadResponse, error) {
	who, err := caller(ctx)
	if err != nil {
		return nil, err
	}
	letterID, err := uuid.Parse(req.GetLetterId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "letter_id is not a uuid")
	}
	if err := h.service.MarkLetterRead(ctx, letterID, who.MemberID); err != nil {
		return nil, statusOf(ctx, "mark letter read", err)
	}
	return &pb.MarkLetterReadResponse{}, nil
}

// ClaimLetter takes every enclosure of one letter for the token's member
// (R13). The forwarded token stays on ctx: the claim forwards it to items and
// wallet, which act on that same member.
func (h *Handler) ClaimLetter(ctx context.Context, req *pb.ClaimLetterRequest) (*pb.ClaimLetterResponse, error) {
	who, err := caller(ctx)
	if err != nil {
		return nil, err
	}
	letterID, err := uuid.Parse(req.GetLetterId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "letter_id is not a uuid")
	}

	claim, err := h.service.ClaimLetter(ctx, letterID, who.MemberID)
	if err != nil {
		return nil, statusOf(ctx, "claim letter", err)
	}

	res := &pb.ClaimLetterResponse{
		LetterId:   claim.LetterID.String(),
		ClaimState: string(ClaimClaimed),
		ItemIds:    make([]string, 0, len(claim.ItemIDs)),
		Gold:       claim.Gold,
	}
	for _, id := range claim.ItemIDs {
		res.ItemIds = append(res.ItemIds, id.String())
	}
	return res, nil
}

// statusOf is the one place a mailbox error becomes a gRPC status. A refusal
// crosses as its code, unwrapped, so no service context reaches the wire.
func statusOf(ctx context.Context, op string, err error) error {
	var refusal *errcode.Refusal
	switch {
	case errors.As(err, &refusal):
		return refusal.GRPCStatus().Err()
	case errors.Is(err, ErrNotAdmin):
		return status.Error(codes.PermissionDenied, "only an admin may send official letters")
	case errors.Is(err, ErrLetterNotFound):
		return status.Error(codes.NotFound, "letter not found")
	case errors.Is(err, ErrItemsUnavailable), errors.Is(err, ErrWalletUnavailable), errors.Is(err, ErrStoreFailed),
		errors.Is(err, ErrClaimsBusy):
		slog.WarnContext(ctx, "mailbox dependency unavailable", "op", op, "error", err)
		return status.Error(codes.Unavailable, op+" unavailable")
	default:
		slog.ErrorContext(ctx, "mailbox request failed", "op", op, "error", err)
		return status.Error(codes.Internal, op+" failed")
	}
}

func draftFromProto(req *pb.SendLetterRequest) (LetterDraft, error) {
	recipient, err := recipientFromProto(req.GetRecipient())
	if err != nil {
		return LetterDraft{}, err
	}
	enclosures := make([]EnclosureRequest, 0, len(req.GetEnclosures()))
	for _, e := range req.GetEnclosures() {
		enc, err := enclosureFromProto(e)
		if err != nil {
			return LetterDraft{}, err
		}
		enclosures = append(enclosures, enc)
	}

	draft := LetterDraft{
		Recipient:  recipient,
		Title:      req.GetTitle(),
		Body:       req.GetBody(),
		Enclosures: enclosures,
	}
	if req.ExpiresAt != nil {
		expiry := req.GetExpiresAt().AsTime()
		draft.ExpiresAt = &expiry
	}
	return draft, nil
}

var (
	errNoRecipient  = errors.New("recipient names no form")
	errBadMemberID  = errors.New("recipient member id is not a uuid")
	errNoEnclosure  = errors.New("enclosure names no kind")
	errBadItemRefID = errors.New("enclosure item id is not a uuid")
)

func recipientFromProto(r *pb.LetterRecipient) (Recipient, error) {
	switch target := r.GetTarget().(type) {
	case *pb.LetterRecipient_MemberId:
		id, err := uuid.Parse(target.MemberId)
		if err != nil {
			return Recipient{}, errBadMemberID
		}
		return Recipient{Kind: RecipientMember, MemberIDs: []uuid.UUID{id}}, nil
	case *pb.LetterRecipient_Members:
		ids := make([]uuid.UUID, 0, len(target.Members.GetMemberIds()))
		for _, raw := range target.Members.GetMemberIds() {
			id, err := uuid.Parse(raw)
			if err != nil {
				return Recipient{}, errBadMemberID
			}
			ids = append(ids, id)
		}
		return Recipient{Kind: RecipientMemberList, MemberIDs: ids}, nil
	case *pb.LetterRecipient_AllMembers:
		if !target.AllMembers {
			return Recipient{}, errNoRecipient
		}
		return Recipient{Kind: RecipientAllMembers}, nil
	default:
		return Recipient{}, errNoRecipient
	}
}

func enclosureFromProto(e *pb.EnclosureRequest) (EnclosureRequest, error) {
	switch kind := e.GetKind().(type) {
	case *pb.EnclosureRequest_Template:
		id, err := uuid.Parse(kind.Template.GetTemplateId())
		if err != nil {
			return EnclosureRequest{}, errBadItemRefID
		}
		return EnclosureRequest{Kind: RequestTemplate, TemplateID: id, Quantity: kind.Template.GetQuantity(), ItemLevel: kind.Template.ItemLevel}, nil
	case *pb.EnclosureRequest_Copy:
		id, err := uuid.Parse(kind.Copy.GetInstanceId())
		if err != nil {
			return EnclosureRequest{}, errBadItemRefID
		}
		return EnclosureRequest{Kind: RequestCopy, CopyOf: id, Quantity: kind.Copy.GetQuantity()}, nil
	case *pb.EnclosureRequest_Gold:
		return EnclosureRequest{Kind: RequestGold, Gold: kind.Gold}, nil
	default:
		return EnclosureRequest{}, errNoEnclosure
	}
}

func letterToProto(l MailboxLetter) *pb.Letter {
	out := &pb.Letter{
		Id:         l.ID.String(),
		Title:      l.Title,
		Body:       l.Body,
		Sender:     string(l.Sender),
		SentAt:     timestamppb.New(l.SentAt),
		ExpiresAt:  timestamppb.New(l.ExpiresAt),
		Read:       l.Read,
		ClaimState: string(l.ClaimState),
		Enclosures: make([]*pb.Enclosure, 0, len(l.Enclosures)),
	}
	for _, e := range l.Enclosures {
		switch e.Kind {
		case EnclosureItem:
			out.Enclosures = append(out.Enclosures, &pb.Enclosure{Kind: &pb.Enclosure_Item{
				Item: &pb.ItemEnclosure{Item: SnapshotProto(e.Item), Quantity: e.Quantity},
			}})
		case EnclosureGold:
			out.Enclosures = append(out.Enclosures, &pb.Enclosure{Kind: &pb.Enclosure_Gold{Gold: e.Gold}})
		}
	}
	return out
}
