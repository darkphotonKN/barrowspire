package commonconstants

import (
	"log/slog"
	"time"
)

/**
NOTE: for those joining my project for the first time, follow this rule:

Simple rule:

Constant      |    Pattern                             |    Example
Exchange         {domain}.events                            game.events
Routing Key      {resource}.{action}                        match.ended
Exchange         {service}.{domain}.{resource}.{action}     stats.game.match.ended

**/

/**
* Exchange
* NOTE: try to keep these one per domain
* {domain}.events
**/
const (
	GameEventsExchange           = "game.events"
	AuthEventsExchange           = "auth.events"
	ItemEventsExchange           = "item.events"
	WalletEventsExchange         = "wallet.events"
	MarketplaceEventsExchange    = "marketplace.events"
	MailboxEventsExchange        = "mailbox.events" // letter requests to notification's Mailbox (FS-1GZGD R12)
	DlxEventsExchange            = "dlx.exchange"
	RetryExchange                = "retry.exchange"
	MarketplaceDlxEventsExchange = "marketplace.dlx.exchange"
)

/**
* Message Broker Events
* NOTE: also acting as Routing Keys
* {resource}.{action}
**/
const (
	CharacterCreatedEvent = "character.created"

	// Member Events
	MemberSignedUpEvent = "member.signedup"       // when user creates account
	MemberSignedInEvent = "member.signedin"       // when user signs into their account
	PasswordResetEvent  = "member.password.reset" // when password reset is requested

	// a verification code was issued and needs mailing (FS-V6SFK R16, ADR-0043)
	MemberVerificationRequestedEvent = "member.verification_requested"

	// Game Events
	GameMatchEnded = "match.ended"     // match ended
	ItemsExtracted = "items.extracted" // items extracted after match end

	// Wallet Events
	AccountCreatedEvent = "account.created" // when a member's gold account is born

	// Mailbox Events: another service asks for a system letter (FS-1GZGD R12, LetterRequested)
	MailLetterRequestedEvent = "mail.letter.requested"

	// Item Events
	ItemCreated  = "item.created"
	ItemReserved = "item.reserved"

	//Notification Event
	NotificationItemCreatedFailed    = "notification.item.created.failed"
	NotificationMemberSignedupFailed = "notification.member.signedup.failed"
	NotificationGameEndFailed        = "notification.game.end.failed"

	// a verification mail that could not be sent (FS-V6SFK R27)
	NotificationMemberVerificationRequestedFailed = "notification.member.verification_requested.failed"

	// a letter request that could not be stored after its retries (FS-1GZGD R12)
	NotificationMailLetterRequestedFailed = "notification.mail.letter.requested.failed"

	// auth events
	AuthMemberLogin = "member.login"

	// marketplace events
	MarpetplaceItemReservedDlq = "marketplace.item.reserved.dql"
	SettlementFailed           = "settlement.failed" // a settlement parked or rolled back (FS-NXP1W)
)

/**
* World types carried by MatchEndedEvent.world_type (FS-X2F2H R43, ADR-0031).
* An empty world_type is a run: events written before the field existed.
**/
const (
	WorldTypeRun   = "run"
	WorldTypeField = "field"
)

/**
* Queue Names
* NOTE: {service}.{domain}.{resource}.{action}
**/
const (
	StatsGameMatchEndedQueue        = "stats.game.match.ended"
	ItemsGameItemsExtractedQueue    = "items.game.items.extracted"
	NotificationMemberSignedUpQueue = "notification.auth.member.signedup"
	NotificationItemCreatedQueue    = "notification.item.created"
	NotificationGameEndQueue        = "notification.game.match.ended"
	NotificationDlqQueue            = "notification.dlq"
	WalletMemberSignedUpQueue       = "wallet.auth.member.signedup"
	AuthAccountCreatedQueue         = "auth.wallet.account.created"
	CharacterGameMatchEndedQueue    = "character.game.match.ended"

	NotificationMemberVerificationRequestedQueue = "notification.auth.member.verification_requested"
	NotificationMailLetterRequestedQueue         = "notification.mailbox.mail.letter.requested"
)

/**
* Message Broker Event Payloads
**/

/**
* MemberSignedUpEventPayload
*
* Published by auth-service.
* Consumed by:
* - notification-service
* - analytics-service
**/
type MemberSignedUpEventPayload struct {
	EventID    string `json:"eventId"`
	UserID     string `json:"userId"`
	Name       string `json:"name"`
	Email      string `json:"email"`
	SignedUpAt string `json:"signedUpAt"`
}

/**
* MemberVerificationRequestedEventPayload
*
* Published by auth-service on AuthEventsExchange, in the same transaction as
* the verification code it carries (FS-V6SFK R16).
* Consumed by:
* - notification-service, which mails the code (FS-V6SFK R24-R27)
*
* Code is the plaintext 6-digit code. It travels only in this payload
* (ADR-0043) and must never be logged: LogValue leaves it out, so handing the
* payload to slog is safe.
**/
type MemberVerificationRequestedEventPayload struct {
	EventID   string    `json:"event_id"`
	MemberID  string    `json:"member_id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"` // the normalized destination address
	Code      string    `json:"code"`
	ExpiresAt time.Time `json:"expires_at"`
}

// LogValue keeps the code (and the address) out of every log line.
func (p MemberVerificationRequestedEventPayload) LogValue() slog.Value {
	return slog.GroupValue(
		slog.String("event_id", p.EventID),
		slog.String("member_id", p.MemberID),
	)
}

/**
* AccountCreatedEventPayload
*
* Published by wallet-service on WalletEventsExchange.
* Consumed by:
* - auth-service (caches AccountID onto members.account_id)
*
* EventID is the CONSUMER'S DEDUPE KEY and is generated here, in the payload.
* It is deliberately NOT the outbox row's id: that id identifies a row in the
* producer's table, the worker ships only Payload, and a key the consumer
* cannot see is no key at all (FS-9KW9F §Req 14).
**/
type AccountCreatedEventPayload struct {
	EventID   string `json:"eventId"`
	AccountID string `json:"accountId"`
	MemberID  string `json:"memberId"`
}

/**
* MemberSignedInEventPayload
*
* Published by auth-service.
* Consumed by:
* - notification-service
* - analytics-service
**/
type MemberSignedInEventPayload struct {
	UserID string `json:"userId"`
}

/*
*
* type ItemCreatedItemEventPayload struct {

*
* Published by item-service.
* Consumed by:
* - notification-service
*
 */
type ItemCreatedItemEventPayload struct {
	UserID string `json:"userId"`
	Name   string `json:"name"`
	// Email      string `json:"email"`
	SignedUpAt string `json:"signedUpAt"`
}

/**
* StatsUpdatedEventPayload
*
* Published by stats-service.
* Consumed by:
* - notification-service
* - leaderboard-service
**/
type StatsUpdatedPayload struct {
	PlayerID  string `json:"playerId"`
	Level     int32  `json:"level"`
	XP        int32  `json:"xp"`
	UpdatedAt string `json:"updatedAt"`
}

/**
* MatchCompletedEventPayload
*
* Published by game-service.
* Consumed by:
* - stats-service
**/
type MatchCompletedPayload struct {
	MatchID  string `json:"matchId"`
	Duration int32  `json:"duration"`
	Players  []struct {
		PlayerID       string  `json:"playerId"`
		Won            bool    `json:"won"`
		Kills          int32   `json:"kills"`
		Deaths         int32   `json:"deaths"`
		Assists        int32   `json:"assists"`
		DamageDealt    float32 `json:"damageDealt"`
		DamageTaken    float32 `json:"damageTaken"`
		ItemsCollected int32   `json:"itemsCollected"`
	} `json:"players"`
}

/**
* PlayerActionEventPayload
*
* Published by game-service.
* Consumed by:
* - stats-service
**/
type PlayerActionPayload struct {
	PlayerID    string  `json:"playerId"`
	Action      string  `json:"action"` // "kill", "death", "assist", "item_collected"
	DamageDealt float32 `json:"damageDealt,omitempty"`
	DamageTaken float32 `json:"damageTaken,omitempty"`
}
