package items

import (
	"context"
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/emptypb"
)

// fakeTemplateService serves ListItemTemplateAggregates only.
type fakeTemplateService struct {
	Service
	templates []*ItemTemplateAggregate
}

func (f *fakeTemplateService) ListItemTemplateAggregates(context.Context) ([]*ItemTemplateAggregate, error) {
	return f.templates, nil
}

// FS-4R9M9 R8: the template listing carries min item level, required level,
// rings, and a unique's row; a non-unique carries no unique.
func TestHandler_ListItemTemplates_CarriesTiersRingsAndUniques(t *testing.T) {
	code, text := "pierce", "Your projectiles pierce one extra target."
	ring := &ItemTemplateAggregate{ID: uuid.New(), ItemName: "Silver Band", ItemType: "ring", Rarity: "Normal", RequiredLevel: 1, MinItemLevel: 8}
	unique := &ItemTemplateAggregate{
		ID: uuid.New(), ItemName: "Lantern of the Drowned", ItemType: "ring", Rarity: "Fabled", RequiredLevel: 9, MinItemLevel: 10,
		UniqueEffectCode: &code, UniqueEffectText: &text,
		UniqueFixedAffixes: AffixRanges{{Stat: "intelligence", Min: 2, Max: 4}, {Stat: "max_mana", Min: 10, Max: 16}},
	}
	h := NewHandler(&fakeTemplateService{templates: []*ItemTemplateAggregate{ring, unique}}, nil)

	res, err := h.ListItemTemplates(context.Background(), &emptypb.Empty{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res.GetItems()) != 2 {
		t.Fatalf("got %d templates, want 2", len(res.GetItems()))
	}

	gotRing, gotUnique := res.GetItems()[0], res.GetItems()[1]
	if gotRing.GetItemType() != "ring" || gotRing.GetMinItemLevel() != 8 || gotRing.GetRequiredLevel() != 1 {
		t.Errorf("ring = type %q min ilvl %d req %d, want ring 8 1", gotRing.GetItemType(), gotRing.GetMinItemLevel(), gotRing.GetRequiredLevel())
	}
	if gotRing.Unique != nil {
		t.Errorf("a base ring must carry no unique, got %v", gotRing.Unique)
	}

	if gotUnique.GetMinItemLevel() != 10 || gotUnique.GetRequiredLevel() != 9 {
		t.Errorf("unique min ilvl %d req %d, want 10 9", gotUnique.GetMinItemLevel(), gotUnique.GetRequiredLevel())
	}
	u := gotUnique.GetUnique()
	if u.GetEffectCode() != code || u.GetEffectText() != text {
		t.Fatalf("unique = %v, want %s / %s", u, code, text)
	}
	want := []*pb.AffixRange{{Stat: "intelligence", Min: 2, Max: 4}, {Stat: "max_mana", Min: 10, Max: 16}}
	if len(u.GetFixedAffixes()) != len(want) {
		t.Fatalf("fixed affixes = %v, want %v", u.GetFixedAffixes(), want)
	}
	for i, w := range want {
		g := u.GetFixedAffixes()[i]
		if g.GetStat() != w.Stat || g.GetMin() != w.Min || g.GetMax() != w.Max {
			t.Errorf("fixed affix[%d] = %v, want %v", i, g, w)
		}
	}
}

// FS-4R9M9 R51: an owned unique reports its effect code and text; a
// non-unique reports neither.
func TestItemInstanceToProto_UniqueEffect(t *testing.T) {
	code, text := "kill_heal", "Kills restore 4% of your max health."
	unique := itemInstanceToProto(&ItemInstance{ID: uuid.New(), ItemType: "armor", UniqueEffectCode: &code, UniqueEffectText: &text})
	if unique.GetUniqueEffectCode() != code || unique.GetUniqueEffectText() != text {
		t.Errorf("unique effect = %q / %q, want %q / %q", unique.GetUniqueEffectCode(), unique.GetUniqueEffectText(), code, text)
	}

	plain := itemInstanceToProto(&ItemInstance{ID: uuid.New(), ItemType: "ring"})
	if plain.GetUniqueEffectCode() != "" || plain.GetUniqueEffectText() != "" {
		t.Errorf("non-unique effect = %q / %q, want none", plain.GetUniqueEffectCode(), plain.GetUniqueEffectText())
	}
}

// FS-4R9M9 R52: a summary carries a unique's effect text only; a non-unique's
// is absent.
func TestToProtoItemSummary_UniqueEffectText(t *testing.T) {
	text := "Dash leaves a burning trail."
	unique := toProtoItemSummary(&ItemSummary{ID: uuid.New(), ItemType: "armor", UniqueEffectText: &text})
	if unique.UniqueEffectText == nil || *unique.UniqueEffectText != text {
		t.Errorf("unique effect text = %v, want %q", unique.UniqueEffectText, text)
	}

	plain := toProtoItemSummary(&ItemSummary{ID: uuid.New(), ItemType: "weapon"})
	if plain.UniqueEffectText != nil {
		t.Errorf("non-unique effect text = %q, want absent", *plain.UniqueEffectText)
	}
}
