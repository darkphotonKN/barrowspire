package mailbox

import (
	"time"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/wire"
	itemspb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/notification"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// MailboxSummary is the signed-in member's mailbox counts (FS-1GZGD R9).
// The counts stay on the wire at 0; newestLetterAt is absent when the mailbox
// is empty.
type MailboxSummary struct {
	UnreadCount    int32      `json:"unreadCount" minimum:"0" doc:"Letters the member has not read."`
	UnclaimedCount int32      `json:"unclaimedCount" minimum:"0" doc:"Letters whose enclosures the member has not taken."`
	WaitingCount   int32      `json:"waitingCount" minimum:"0" doc:"Letters unread or holding untaken enclosures: the count on the envelope's seal."`
	NewestLetterAt *time.Time `json:"newestLetterAt,omitempty" doc:"When the newest letter was sent. Absent when the mailbox is empty."`
}

// LetterList is the signed-in member's mailbox.
type LetterList struct {
	Letters []Letter `json:"letters" nullable:"false" doc:"At most 50 non-expired letters, newest first."`
}

// Letter is one letter as the signed-in member reads it.
type Letter struct {
	ID         string      `json:"id" format:"uuid"`
	Title      string      `json:"title"`
	Body       string      `json:"body" doc:"Plain text."`
	Sender     string      `json:"sender" enum:"official,system" doc:"official: the Barrowspire Wardens; system: the Spire."`
	SentAt     time.Time   `json:"sentAt"`
	ExpiresAt  time.Time   `json:"expiresAt"`
	Read       bool        `json:"read"`
	ClaimState string      `json:"claimState" enum:"none,unclaimed,claiming,claimed" doc:"none on a letter without enclosures; treat claiming like unclaimed."`
	Enclosures []Enclosure `json:"enclosures" nullable:"false" doc:"Empty on a letter without enclosures."`
}

// Enclosure is something a letter carries: an item with its quantity, or
// gold.
type Enclosure struct {
	Kind     string        `json:"kind" enum:"item,gold"`
	Quantity *int32        `json:"quantity,omitempty" doc:"How many of the item. Present on an item enclosure."`
	Item     *ItemSnapshot `json:"item,omitempty" doc:"The item as it was when the letter was sent. Present on an item enclosure."`
	Gold     *int64        `json:"gold,omitempty" doc:"The gold amount. Present on a gold enclosure."`
}

// ItemSnapshot is an enclosed item as it was resolved when the letter was
// sent: what the letter shows and exactly what a claim gives. It has no
// instance id; there is no instance until the claim.
type ItemSnapshot struct {
	TemplateID  string  `json:"templateId" format:"uuid"`
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	ItemType    string  `json:"itemType" doc:"e.g. weapon, armor, ring, consumable."`
	WeaponType  *string `json:"weaponType,omitempty"`
	ArmorSlot   *string `json:"armorSlot,omitempty"`
	Rarity      string  `json:"rarity" doc:"The rarity tier: normal, uncommon, rare, runed or fabled."`

	AttackPower     *int32   `json:"attackPower,omitempty"`
	CriticalRate    *float64 `json:"criticalRate,omitempty"`
	DefenseRating   *int32   `json:"defenseRating,omitempty"`
	MagicResistance *int32   `json:"magicResistance,omitempty"`
	HealingAmount   *int32   `json:"healingAmount,omitempty"`
	ManaAmount      *int32   `json:"manaAmount,omitempty"`
	BuffDuration    *int32   `json:"buffDuration,omitempty"`

	ItemLevel        int32        `json:"itemLevel" minimum:"1"`
	RequiredLevel    int32        `json:"requiredLevel" minimum:"1"`
	Affixes          []wire.Affix `json:"affixes" nullable:"false" doc:"Every affix; empty for an item without any."`
	UniqueEffectText *string      `json:"uniqueEffectText,omitempty" doc:"The unique's effect text. Absent unless the item is a unique."`
}

// SendLetterBody is the admin send. Exactly one recipient form. The letter
// rules (lengths, enclosure bounds, expiry, the list's size) are
// notification-service's, so none is restated here.
type SendLetterBody struct {
	Recipient  Recipient          `json:"recipient"`
	Title      string             `json:"title" doc:"1-60 characters after trimming (notification-service decides)."`
	Body       string             `json:"body" doc:"1-2000 characters after trimming, plain text (notification-service decides)."`
	Enclosures []EnclosureRequest `json:"enclosures,omitempty" nullable:"false" doc:"At most 10, at most one gold, item quantities summing to at most 60 (notification-service decides)."`
	ExpiresAt  *time.Time         `json:"expiresAt,omitempty" doc:"Must be later than now. Absent: 30 days after sending."`
}

// Recipient names exactly one of the three forms.
type Recipient struct {
	MemberID   *string  `json:"memberId,omitempty" format:"uuid" doc:"One member."`
	MemberIDs  []string `json:"memberIds,omitempty" nullable:"false" format:"uuid" doc:"A member list: one letter per distinct member, 1-1000 distinct ids (notification-service decides)."`
	AllMembers *bool    `json:"allMembers,omitempty" doc:"Every member, as one broadcast letter. Only true."`
}

// EnclosureRequest asks for one enclosure: a template
// (templateId, quantity, itemLevel?), a copy of an item instance
// (copyOf, quantity) or gold.
type EnclosureRequest struct {
	Kind       string  `json:"kind" enum:"template,copy,gold"`
	TemplateID *string `json:"templateId,omitempty" format:"uuid" doc:"template: the item template."`
	CopyOf     *string `json:"copyOf,omitempty" format:"uuid" doc:"copy: the item instance to copy as it stands now."`
	Quantity   *int32  `json:"quantity,omitempty" doc:"template, copy: 1-60 (notification-service decides)."`
	ItemLevel  *int32  `json:"itemLevel,omitempty" doc:"template: at least 1; absent means the template's minimum item level."`
	Gold       *int64  `json:"gold,omitempty" doc:"gold: at least 1 (notification-service decides)."`
}

// SentLetters answers the admin send: one entry per stored letter, in the
// order each recipient first appears in the request.
type SentLetters struct {
	Letters   []SentLetter `json:"letters" nullable:"false"`
	ExpiresAt time.Time    `json:"expiresAt"`
}

// SentLetter is one stored letter. memberId is absent only for a broadcast.
type SentLetter struct {
	LetterID string  `json:"letterId" format:"uuid"`
	MemberID *string `json:"memberId,omitempty" format:"uuid"`
}

// ClaimedLetter answers a claim: what the signed-in member took from the
// letter.
type ClaimedLetter struct {
	LetterID   string   `json:"letterId" format:"uuid"`
	ClaimState string   `json:"claimState" enum:"claimed" doc:"Always claimed: a claim that did not complete answers an error."`
	ItemIDs    []string `json:"itemIds" nullable:"false" format:"uuid" doc:"The item instances now in the member's stash, one per enclosed item and quantity. Empty on a gold-only letter."`
	Gold       int64    `json:"gold" minimum:"0" doc:"The gold credited to the member's wallet. 0 on an item-only letter."`
}

func claimedFromProto(res *pb.ClaimLetterResponse) ClaimedLetter {
	ids := res.GetItemIds()
	if ids == nil {
		ids = []string{}
	}
	return ClaimedLetter{
		LetterID:   res.GetLetterId(),
		ClaimState: res.GetClaimState(),
		ItemIDs:    ids,
		Gold:       res.GetGold(),
	}
}

func summaryFromProto(s *pb.MailboxSummary) MailboxSummary {
	out := MailboxSummary{
		UnreadCount:    s.GetUnreadCount(),
		UnclaimedCount: s.GetUnclaimedCount(),
		WaitingCount:   s.GetWaitingCount(),
	}
	if s.NewestLetterAt != nil {
		newest := s.GetNewestLetterAt().AsTime()
		out.NewestLetterAt = &newest
	}
	return out
}

func letterListFromProto(res *pb.ListLettersResponse) LetterList {
	list := LetterList{Letters: make([]Letter, 0, len(res.GetLetters()))}
	for _, l := range res.GetLetters() {
		list.Letters = append(list.Letters, letterFromProto(l))
	}
	return list
}

func letterFromProto(l *pb.Letter) Letter {
	out := Letter{
		ID:         l.GetId(),
		Title:      l.GetTitle(),
		Body:       l.GetBody(),
		Sender:     l.GetSender(),
		SentAt:     l.GetSentAt().AsTime(),
		ExpiresAt:  l.GetExpiresAt().AsTime(),
		Read:       l.GetRead(),
		ClaimState: l.GetClaimState(),
		Enclosures: make([]Enclosure, 0, len(l.GetEnclosures())),
	}
	for _, e := range l.GetEnclosures() {
		switch kind := e.GetKind().(type) {
		case *pb.Enclosure_Item:
			quantity := kind.Item.GetQuantity()
			item := snapshotFromProto(kind.Item.GetItem())
			out.Enclosures = append(out.Enclosures, Enclosure{Kind: "item", Quantity: &quantity, Item: &item})
		case *pb.Enclosure_Gold:
			gold := kind.Gold
			out.Enclosures = append(out.Enclosures, Enclosure{Kind: "gold", Gold: &gold})
		}
	}
	return out
}

func snapshotFromProto(s *itemspb.ItemSnapshot) ItemSnapshot {
	affixes := make([]wire.Affix, 0, len(s.GetAffixes()))
	for _, a := range s.GetAffixes() {
		affixes = append(affixes, wire.Affix{Stat: a.GetStat(), Tier: a.GetTier(), Value: a.GetValue()})
	}
	return ItemSnapshot{
		TemplateID:       s.GetTemplateId(),
		Name:             s.GetName(),
		Description:      s.Description,
		ItemType:         s.GetItemType(),
		WeaponType:       s.WeaponType,
		ArmorSlot:        s.ArmorSlot,
		Rarity:           s.GetRarity(),
		AttackPower:      s.AttackPower,
		CriticalRate:     s.CriticalRate,
		DefenseRating:    s.DefenseRating,
		MagicResistance:  s.MagicResistance,
		HealingAmount:    s.HealingAmount,
		ManaAmount:       s.ManaAmount,
		BuffDuration:     s.BuffDuration,
		ItemLevel:        s.GetItemLevel(),
		RequiredLevel:    s.GetRequiredLevel(),
		Affixes:          affixes,
		UniqueEffectText: s.UniqueEffectText,
	}
}

// sendRequest builds notification's request from a body Resolve has already
// checked for shape.
func (b SendLetterBody) sendRequest() *pb.SendLetterRequest {
	req := &pb.SendLetterRequest{
		Recipient:  b.Recipient.toProto(),
		Title:      b.Title,
		Body:       b.Body,
		Enclosures: make([]*pb.EnclosureRequest, 0, len(b.Enclosures)),
	}
	for _, e := range b.Enclosures {
		req.Enclosures = append(req.Enclosures, e.toProto())
	}
	if b.ExpiresAt != nil {
		req.ExpiresAt = timestamppb.New(*b.ExpiresAt)
	}
	return req
}

func (r Recipient) toProto() *pb.LetterRecipient {
	switch {
	case r.MemberID != nil:
		return &pb.LetterRecipient{Target: &pb.LetterRecipient_MemberId{MemberId: *r.MemberID}}
	case r.MemberIDs != nil:
		return &pb.LetterRecipient{Target: &pb.LetterRecipient_Members{Members: &pb.MemberList{MemberIds: r.MemberIDs}}}
	default:
		return &pb.LetterRecipient{Target: &pb.LetterRecipient_AllMembers{AllMembers: true}}
	}
}

func (e EnclosureRequest) toProto() *pb.EnclosureRequest {
	switch e.Kind {
	case "template":
		return &pb.EnclosureRequest{Kind: &pb.EnclosureRequest_Template{Template: &pb.TemplateEnclosureRequest{
			TemplateId: *e.TemplateID, Quantity: *e.Quantity, ItemLevel: e.ItemLevel,
		}}}
	case "copy":
		return &pb.EnclosureRequest{Kind: &pb.EnclosureRequest_Copy{Copy: &pb.CopyEnclosureRequest{
			InstanceId: *e.CopyOf, Quantity: *e.Quantity,
		}}}
	default:
		return &pb.EnclosureRequest{Kind: &pb.EnclosureRequest_Gold{Gold: *e.Gold}}
	}
}

func sentLettersFromProto(res *pb.SendLetterResponse) SentLetters {
	out := SentLetters{
		Letters:   make([]SentLetter, 0, len(res.GetLetters())),
		ExpiresAt: res.GetExpiresAt().AsTime(),
	}
	for _, l := range res.GetLetters() {
		out.Letters = append(out.Letters, SentLetter{LetterID: l.GetLetterId(), MemberID: l.MemberId})
	}
	return out
}
