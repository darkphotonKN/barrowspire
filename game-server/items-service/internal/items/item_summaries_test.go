package items

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// summaryService fakes only the one method GetItemSummaries reaches; the
// embedded interface panics if the handler strays into anything else.
type summaryService struct {
	Service

	summaries []*ItemSummary
	err       error

	calls  int
	gotIDs []uuid.UUID
}

func (s *summaryService) GetItemSummaries(ctx context.Context, ids []uuid.UUID) ([]*ItemSummary, error) {
	s.calls++
	s.gotIDs = ids
	return s.summaries, s.err
}

func TestGetItemSummariesMapsOnlyThePublicFacts(t *testing.T) {
	desc, weaponType := "A notched blade", "sword"
	attack, crit := 12, 0.25
	sword := &ItemSummary{
		ID: uuid.New(), Name: "Longsword", Description: &desc, ItemType: "weapon", Rarity: "runed",
		WeaponType: &weaponType, AttackPower: &attack, CriticalRate: &crit,
	}
	svc := &summaryService{summaries: []*ItemSummary{sword}}

	res, err := NewHandler(svc, nil).GetItemSummaries(context.Background(), &pb.GetItemSummariesRequest{Ids: []string{sword.ID.String()}})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(svc.gotIDs) != 1 || svc.gotIDs[0] != sword.ID {
		t.Fatalf("service asked for %v, want [%s]", svc.gotIDs, sword.ID)
	}
	if len(res.GetSummaries()) != 1 {
		t.Fatalf("got %d summaries, want 1", len(res.GetSummaries()))
	}

	got := res.GetSummaries()[0]
	checks := []struct {
		name      string
		got, want any
	}{
		{"id", got.GetId(), sword.ID.String()},
		{"name", got.GetName(), "Longsword"},
		{"description", got.GetDescription(), desc},
		{"item type", got.GetItemType(), "weapon"},
		{"rarity", got.GetRarity(), "runed"},
		{"weapon type", got.GetWeaponType(), "sword"},
		{"attack power", got.GetAttackPower(), int32(12)},
		{"critical rate", got.GetCriticalRate(), 0.25},
	}
	for _, c := range checks {
		if c.got != c.want {
			t.Errorf("%s = %v, want %v", c.name, c.got, c.want)
		}
	}

	// a weapon has no armor or consumable stats, and says so by absence
	if got.ArmorSlot != nil || got.DefenseRating != nil || got.MagicResistance != nil ||
		got.HealingAmount != nil || got.ManaAmount != nil || got.BuffDuration != nil {
		t.Errorf("stats the item does not have must be absent, got %+v", got)
	}
}

// Summaries are public, so a caller with no identity is served.
func TestGetItemSummariesNeedsNoCaller(t *testing.T) {
	svc := &summaryService{}

	_, err := NewHandler(svc, nil).GetItemSummaries(context.Background(), &pb.GetItemSummariesRequest{Ids: []string{uuid.NewString()}})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestGetItemSummariesAnswersNothingForNoIDs(t *testing.T) {
	svc := &summaryService{}

	res, err := NewHandler(svc, nil).GetItemSummaries(context.Background(), &pb.GetItemSummariesRequest{})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res.GetSummaries()) != 0 {
		t.Errorf("got %d summaries, want none", len(res.GetSummaries()))
	}
	if svc.calls != 0 {
		t.Errorf("an empty request must not reach the database")
	}
}

func TestGetItemSummariesRejectsBadRequests(t *testing.T) {
	tooMany := make([]string, maxSummaryIDs+1)
	for i := range tooMany {
		tooMany[i] = uuid.NewString()
	}

	tests := []struct {
		name string
		ids  []string
	}{
		{name: "more than the limit", ids: tooMany},
		{name: "a malformed id", ids: []string{uuid.NewString(), "not-a-uuid"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := &summaryService{}

			_, err := NewHandler(svc, nil).GetItemSummaries(context.Background(), &pb.GetItemSummariesRequest{Ids: tt.ids})

			if status.Code(err) != codes.InvalidArgument {
				t.Errorf("code = %v, want InvalidArgument", status.Code(err))
			}
			if svc.calls != 0 {
				t.Errorf("a bad request must not reach the database")
			}
		})
	}
}

func TestGetItemSummariesAnswersInternalWhenTheReadFails(t *testing.T) {
	svc := &summaryService{err: errors.New("connection reset")}

	_, err := NewHandler(svc, nil).GetItemSummaries(context.Background(), &pb.GetItemSummariesRequest{Ids: []string{uuid.NewString()}})

	if status.Code(err) != codes.Internal {
		t.Errorf("code = %v, want Internal", status.Code(err))
	}
	if strings.Contains(status.Convert(err).Message(), "connection reset") {
		t.Errorf("the database error must not reach the caller: %q", status.Convert(err).Message())
	}
}

// Opt-in: runs only with ITEMS_TEST_DSN pointing at a migrated items DB.
// Everything happens in one transaction that is rolled back.
func TestSelectItemSummaries_JoinsTheRarityAndOmitsUnknownIDs(t *testing.T) {
	dsn := os.Getenv("ITEMS_TEST_DSN")
	if dsn == "" {
		t.Skip("ITEMS_TEST_DSN not set")
	}
	ctx := context.Background()
	db, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer db.Close()

	tx, err := db.BeginTxx(ctx, nil)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer tx.Rollback()

	// the fixed id migration 000020 seeds for the runed tier
	runed := uuid.MustParse("f8700000-0000-0000-0000-000000000004")
	weaponID, templateID, instanceID := uuid.New(), uuid.New(), uuid.New()
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO weapons (id, rarity_id, attack_power, critical_rate, weapon_type) VALUES ($1, $2, 12, 0.25, 'sword')`,
		weaponID, runed); err != nil {
		t.Fatalf("weapon: %v", err)
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO item_templates (id, item_name, rarity_id, item_type, item_id, required_level) VALUES ($1, 'Longsword', $2, 'weapon', $3, 1)`,
		templateID, runed, weaponID); err != nil {
		t.Fatalf("template: %v", err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO item_instances (id, template_id, owner_member_id, source, item_type, name, rarity_id,
		                            attack_power, critical_rate, weapon_type, description)
		VALUES ($1, $2, $3, 'extracted', 'weapon', 'Longsword', $4, 12, 0.25, 'sword', 'A notched blade')`,
		instanceID, templateID, uuid.New(), runed); err != nil {
		t.Fatalf("instance: %v", err)
	}

	got, err := selectItemSummaries(ctx, tx, []uuid.UUID{instanceID, uuid.New()})
	if err != nil {
		t.Fatalf("select: %v", err)
	}

	if len(got) != 1 {
		t.Fatalf("got %d summaries, want 1: the unknown id is omitted", len(got))
	}
	s := got[0]
	if s.ID != instanceID || s.Name != "Longsword" || s.ItemType != "weapon" {
		t.Errorf("identity = %s %q %q", s.ID, s.Name, s.ItemType)
	}
	if s.Rarity != "runed" {
		t.Errorf("rarity = %q, want the joined code %q", s.Rarity, "runed")
	}
	if s.AttackPower == nil || *s.AttackPower != 12 || s.WeaponType == nil || *s.WeaponType != "sword" {
		t.Errorf("weapon stats = %v %v", s.AttackPower, s.WeaponType)
	}
	if s.DefenseRating != nil || s.ArmorSlot != nil || s.HealingAmount != nil {
		t.Errorf("a weapon carries no armor or consumable stats")
	}
	if s.Description == nil || *s.Description != "A notched blade" {
		t.Errorf("description = %v", s.Description)
	}
}
