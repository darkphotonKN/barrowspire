// Package mailbox is the Mailbox bounded context (FS-1GZGD, ADR-0044): in-game
// letters a member reads in the town, and the enclosures they carry.
//
// "Mail" in this service means outbound email (ADR-0043). The in-game concept
// is Mailbox / Letter / Enclosure; no type here is named Mail*.
package mailbox

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// Sender is who a letter speaks for.
type Sender string

const (
	// SenderOfficial is an admin's letter, sent through the gateway.
	SenderOfficial Sender = "official"
	// SenderSystem is a letter made from a broker letter request.
	SenderSystem Sender = "system"
)

// ClaimState is where one member's claim of one letter stands.
type ClaimState string

const (
	// ClaimNone: the letter has no enclosures, so nothing to claim.
	ClaimNone      ClaimState = "none"
	ClaimUnclaimed ClaimState = "unclaimed"
	ClaimClaiming  ClaimState = "claiming"
	ClaimClaimed   ClaimState = "claimed"
)

// EnclosureKind is what a stored enclosure holds. A template and a copy
// enclosure are both stored as items once resolved (A2).
type EnclosureKind string

const (
	EnclosureItem EnclosureKind = "item"
	EnclosureGold EnclosureKind = "gold"
)

// Bounds (FS-1GZGD D10, S1, A6).
const (
	maxTitleRunes       = 60
	maxBodyRunes        = 2000
	maxEnclosures       = 10
	maxGoldEnclosures   = 1
	maxItemQuantity     = 60
	maxSlotCount        = 60 // the stash cap: every letter fits an empty stash
	maxListRecipients   = 1000
	defaultLetterExpiry = 30 * 24 * time.Hour
	// mailboxSize is how many letters a mailbox read returns (D14).
	mailboxSize = 50
)

// Affix is one affix of an item snapshot.
type Affix struct {
	Stat  string `json:"stat"`
	Tier  int32  `json:"tier"`
	Value int32  `json:"value"`
}

// ItemSnapshot is one item as items-service resolved it at send: everything a
// letter shows and everything a claim mints from (A2). Never re-read later.
type ItemSnapshot struct {
	TemplateID       uuid.UUID `json:"template_id"`
	Name             string    `json:"name"`
	Description      *string   `json:"description,omitempty"`
	ItemType         string    `json:"item_type"`
	WeaponType       *string   `json:"weapon_type,omitempty"`
	ArmorSlot        *string   `json:"armor_slot,omitempty"`
	Rarity           string    `json:"rarity"`
	AttackPower      *int32    `json:"attack_power,omitempty"`
	CriticalRate     *float64  `json:"critical_rate,omitempty"`
	DefenseRating    *int32    `json:"defense_rating,omitempty"`
	MagicResistance  *int32    `json:"magic_resistance,omitempty"`
	HealingAmount    *int32    `json:"healing_amount,omitempty"`
	ManaAmount       *int32    `json:"mana_amount,omitempty"`
	BuffDuration     *int32    `json:"buff_duration,omitempty"`
	Durability       *int32    `json:"durability,omitempty"`
	ItemLevel        int32     `json:"item_level"`
	RequiredLevel    int32     `json:"required_level"`
	Affixes          []Affix   `json:"affixes"`
	UniqueEffectText *string   `json:"unique_effect_text,omitempty"`
}

// Enclosure is something a stored letter carries: an item snapshot with its
// quantity, or an amount of gold.
type Enclosure struct {
	Kind     EnclosureKind `json:"kind"`
	Quantity int32         `json:"quantity,omitempty"`
	Item     *ItemSnapshot `json:"item,omitempty"`
	Gold     int64         `json:"gold,omitempty"`
}

// Letter is one stored letter. MemberID nil addresses every member.
type Letter struct {
	ID         uuid.UUID
	Title      string
	Body       string
	Sender     Sender
	MemberID   *uuid.UUID
	Enclosures []Enclosure
	SentAt     time.Time
	ExpiresAt  time.Time
}

// MailboxLetter is a letter as one member reads it.
type MailboxLetter struct {
	Letter
	Read       bool
	ClaimState ClaimState
}

// Summary is one member's mailbox counts (R9, S6).
type Summary struct {
	Unread    int
	Unclaimed int
	// Waiting counts letters that are unread or hold unclaimed enclosures.
	Waiting        int
	NewestLetterAt *time.Time
}

// RecipientKind is which of the three recipient forms a send names.
type RecipientKind int

const (
	RecipientMember RecipientKind = iota + 1
	RecipientMemberList
	RecipientAllMembers
)

// Recipient is who a send addresses: one member, a member list (A6) or every
// member.
type Recipient struct {
	Kind RecipientKind
	// MemberIDs holds the one member, or the list as given (duplicates and
	// all); empty for every member.
	MemberIDs []uuid.UUID
}

// EnclosureRequestKind is how a sender asks for an enclosure (A1).
type EnclosureRequestKind int

const (
	RequestTemplate EnclosureRequestKind = iota + 1
	RequestCopy
	RequestGold
)

// EnclosureRequest is one enclosure as a sender asks for it: a template
// (TemplateID, Quantity, optional ItemLevel), a copy of an instance (CopyOf,
// Quantity) or gold.
type EnclosureRequest struct {
	Kind       EnclosureRequestKind
	TemplateID uuid.UUID
	ItemLevel  *int32
	CopyOf     uuid.UUID
	Quantity   int32
	Gold       int64
}

// LetterDraft is a send before it is checked and stored.
type LetterDraft struct {
	Recipient  Recipient
	Title      string
	Body       string
	Enclosures []EnclosureRequest
	// ExpiresAt nil means 30 days after sending.
	ExpiresAt *time.Time
}

// SentLetter is one stored letter of a send: MemberID nil for a broadcast.
type SentLetter struct {
	LetterID uuid.UUID
	MemberID *uuid.UUID
}

// SentLetters answers a send: one entry per stored letter, in the order each
// recipient first appeared, and their shared expiry.
type SentLetters struct {
	Letters   []SentLetter
	ExpiresAt time.Time
}

var (
	// ErrLetterNotFound: no such letter, or not addressed to the caller. The
	// two are one answer so a letter's existence is never revealed.
	ErrLetterNotFound = errors.New("letter not found")
	// ErrNotAdmin: only an admin sends official letters (R11).
	ErrNotAdmin = errors.New("only an admin may send official letters")
	// ErrItemsUnavailable: items-service could not be reached to resolve the
	// enclosures. Retryable.
	ErrItemsUnavailable = errors.New("items service unavailable")
	// ErrStoreFailed: storing the letters failed and nothing was stored.
	// Retryable.
	ErrStoreFailed = errors.New("storing the letters failed")
)
