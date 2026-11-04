package items

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func intRef(v int) *int { return &v }

// seedUniqueRingInstance seeds an instance of the unique ring template,
// owned by owner and LISTED under a listing, with its own name, description,
// rarity, item level, required level and raw affixes JSON.
func seedUniqueRingInstance(t *testing.T, ctx context.Context, db *sqlx.DB, template, owner uuid.UUID, affixes string) uuid.UUID {
	t.Helper()
	id := uuid.New()
	fabled := rarityID(t, ctx, db, "fabled")
	if _, err := db.ExecContext(ctx, `
		INSERT INTO item_instances (id, template_id, owner_member_id, source, item_type, name, rarity_id,
		                            description, status, listing_id, reserved_at, location,
		                            item_level, required_level, affixes)
		VALUES ($1, $2, $3, 'extracted', 'ring', 'Band of Embers', $4,
		        'Warm to the touch.', 'LISTED', $5, NOW(), 'BAG', 77, 9, $6::jsonb)`,
		id, template, owner, fabled, uuid.New(), affixes); err != nil {
		t.Fatalf("seed unique instance: %v", err)
	}
	return id
}

// FS-1GZGD A1, AC "ResolveItemSnapshots for a template": without an item
// level, a fresh Normal item at min_item_level with the base stats and no
// affixes; with item level 40, the same at 40, above the template's band.
func TestResolveItemSnapshots_ATemplateIsAFreshNormalItem(t *testing.T) {
	ctx, db := catalogueDB(t)
	svc := NewService(NewRepository(db), db, nil, nil, nil)
	sword := seedWeaponTemplate(t, ctx, db, "Rusted Sword", 5, 3)
	ring := seedRingTemplate(t, ctx, db, "Band of Embers", "fabled", 1, 1, "kill_frenzy", "Kills ignite.")

	got, err := svc.ResolveItemSnapshots(ctx,
		[]TemplateSnapshotRequest{{TemplateID: sword}, {TemplateID: sword, ItemLevel: intRef(40)}, {TemplateID: ring}}, nil)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}

	if len(got.Templates) != 3 || got.Templates[0] == nil || got.Templates[1] == nil || got.Templates[2] == nil {
		t.Fatalf("templates = %+v, want three snapshots in request order", got.Templates)
	}
	for i, wantLevel := range []int{5, 40} {
		s := got.Templates[i]
		if s.TemplateID != sword || s.Name != "Rusted Sword" || s.ItemType != "weapon" || s.Rarity != "normal" {
			t.Errorf("%d: identity = %s %q %q %q, want the sword, normal", i, s.TemplateID, s.Name, s.ItemType, s.Rarity)
		}
		if s.ItemLevel != wantLevel || s.RequiredLevel != 3 {
			t.Errorf("%d: item level %d required %d, want %d / 3", i, s.ItemLevel, s.RequiredLevel, wantLevel)
		}
		if len(s.Affixes) != 0 || s.Affixes == nil {
			t.Errorf("%d: affixes = %#v, want an empty list", i, s.Affixes)
		}
		if s.AttackPower == nil || *s.AttackPower != 6 || s.CriticalRate == nil || *s.CriticalRate != 0.08 || s.WeaponType == nil || *s.WeaponType != "sword" {
			t.Errorf("%d: base stats = %v %v %v, want 6 / 0.08 / sword", i, s.AttackPower, s.CriticalRate, s.WeaponType)
		}
		if s.DefenseRating != nil || s.ArmorSlot != nil || s.HealingAmount != nil || s.Durability != nil || s.UniqueEffectText != nil {
			t.Errorf("%d: a plain sword carries no armor, consumable, durability or unique facts", i)
		}
		if s.Description == nil || *s.Description != "A plain blade." {
			t.Errorf("%d: description = %v", i, s.Description)
		}
	}
	if r := got.Templates[2]; r.Rarity != "normal" || r.UniqueEffectText == nil || *r.UniqueEffectText != "Kills ignite." || len(r.Affixes) != 0 {
		t.Errorf("unique template = %+v, want normal with no affixes, carrying its effect text", r)
	}
	if got.Templates[0] == got.Templates[1] {
		t.Errorf("two requests for one template share a snapshot")
	}
	if len(got.UnknownTemplateIDs)+len(got.UnknownInstanceIDs)+len(got.UnrepresentableIDs) != 0 {
		t.Errorf("nothing should be reported: %+v", got)
	}
}

// FS-1GZGD A1, AC "ResolveItemSnapshots for a unique instance": a copy as it
// stands, its template, item level, rarity, affixes and values, with an affix
// set no drop rule would allow; nothing of its owner, listing, status or
// location exists on a snapshot to carry.
func TestResolveItemSnapshots_AnInstanceIsACopyAsItStands(t *testing.T) {
	ctx, db := catalogueDB(t)
	svc := NewService(NewRepository(db), db, nil, nil, nil)
	ring := seedRingTemplate(t, ctx, db, "Band of Embers", "fabled", 1, 1, "kill_frenzy", "Kills ignite.")
	// six tier-3 affixes on one ring, two of them the same stat: no rule rolls that
	source := seedUniqueRingInstance(t, ctx, db, ring, uuid.New(),
		`[{"stat":"intelligence","tier":0,"value":4},{"stat":"strength","tier":3,"value":500},{"stat":"strength","tier":3,"value":1},
		  {"stat":"crit_chance","tier":3,"value":90},{"stat":"max_health","tier":3,"value":999},{"stat":"move_speed","tier":3,"value":0}]`)

	got, err := svc.ResolveItemSnapshots(ctx, nil, []uuid.UUID{source})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}

	if len(got.Instances) != 1 || got.Instances[0] == nil {
		t.Fatalf("instances = %+v, want one snapshot", got.Instances)
	}
	s := got.Instances[0]
	if s.TemplateID != ring || s.Name != "Band of Embers" || s.ItemType != "ring" || s.Rarity != "fabled" {
		t.Errorf("identity = %s %q %q %q, want the ring's template, name, type, fabled", s.TemplateID, s.Name, s.ItemType, s.Rarity)
	}
	if s.Description == nil || *s.Description != "Warm to the touch." {
		t.Errorf("description = %v, want the instance's own", s.Description)
	}
	if s.ItemLevel != 77 || s.RequiredLevel != 9 {
		t.Errorf("item level %d required %d, want 77 / 9", s.ItemLevel, s.RequiredLevel)
	}
	want := Affixes{{"intelligence", 0, 4}, {"strength", 3, 500}, {"strength", 3, 1}, {"crit_chance", 3, 90}, {"max_health", 3, 999}, {"move_speed", 3, 0}}
	if len(s.Affixes) != len(want) {
		t.Fatalf("affixes = %+v, want %+v", s.Affixes, want)
	}
	for i := range want {
		if s.Affixes[i] != want[i] {
			t.Errorf("affix %d = %+v, want %+v", i, s.Affixes[i], want[i])
		}
	}
	if s.UniqueEffectText == nil || *s.UniqueEffectText != "Kills ignite." {
		t.Errorf("unique effect text = %v", s.UniqueEffectText)
	}
	if s.Durability != nil {
		t.Errorf("durability = %v, want the template's (none)", *s.Durability)
	}
	if len(got.UnrepresentableIDs) != 0 {
		t.Errorf("a well-formed copy is not unrepresentable: %v", got.UnrepresentableIDs)
	}
}

// FS-1GZGD A3, AC "Unknown template ids and unknown instance ids are reported
// as such; an item level of 0 is reported unrepresentable". A copy source
// with a malformed affix is unrepresentable too.
func TestResolveItemSnapshots_ReportsWhatDidNotResolve(t *testing.T) {
	ctx, db := catalogueDB(t)
	svc := NewService(NewRepository(db), db, nil, nil, nil)
	sword := seedWeaponTemplate(t, ctx, db, "Rusted Sword", 1, 1)
	ring := seedRingTemplate(t, ctx, db, "Band of Embers", "fabled", 1, 1, "", "")
	malformed := seedUniqueRingInstance(t, ctx, db, ring, uuid.New(), `[{"stat":"luck","tier":1,"value":1}]`)
	unknownTemplate, unknownInstance := uuid.New(), uuid.New()

	got, err := svc.ResolveItemSnapshots(ctx,
		[]TemplateSnapshotRequest{{TemplateID: unknownTemplate}, {TemplateID: sword, ItemLevel: intRef(0)}, {TemplateID: unknownTemplate}, {TemplateID: sword}},
		[]uuid.UUID{unknownInstance, malformed})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}

	if len(got.Templates) != 4 || got.Templates[0] != nil || got.Templates[1] != nil || got.Templates[2] != nil || got.Templates[3] == nil {
		t.Errorf("templates = %+v, want only the last resolved", got.Templates)
	}
	if len(got.Instances) != 2 || got.Instances[0] != nil || got.Instances[1] != nil {
		t.Errorf("instances = %+v, want neither resolved", got.Instances)
	}
	if len(got.UnknownTemplateIDs) != 1 || got.UnknownTemplateIDs[0] != unknownTemplate {
		t.Errorf("unknown templates = %v, want %s once", got.UnknownTemplateIDs, unknownTemplate)
	}
	if len(got.UnknownInstanceIDs) != 1 || got.UnknownInstanceIDs[0] != unknownInstance {
		t.Errorf("unknown instances = %v, want %s", got.UnknownInstanceIDs, unknownInstance)
	}
	if len(got.UnrepresentableIDs) != 2 || got.UnrepresentableIDs[0] != sword || got.UnrepresentableIDs[1] != malformed {
		t.Errorf("unrepresentable = %v, want the sword at item level 0, then the malformed copy", got.UnrepresentableIDs)
	}
}

// A resolve never makes a snapshot GrantItems refuses: whatever is checked at
// send is what the claim checks, or a letter could be sent that no one can
// claim. item_templates.required_level allows 0, which a minted instance
// (required_level >= 1) cannot carry, so such a template is reported
// unrepresentable at send. Every snapshot the resolve does answer grants.
func TestResolveItemSnapshots_NeverResolvesWhatAGrantRefuses(t *testing.T) {
	ctx, db := catalogueDB(t)
	svc := NewService(NewRepository(db), db, nil, nil, nil)
	levelZero := seedWeaponTemplate(t, ctx, db, "Training Sword", 1, 0)
	sword := seedWeaponTemplate(t, ctx, db, "Rusted Sword", 5, 3)
	ring := seedRingTemplate(t, ctx, db, "Band of Embers", "fabled", 1, 1, "kill_frenzy", "Kills ignite.")
	source := seedUniqueRingInstance(t, ctx, db, ring, uuid.New(), `[{"stat":"strength","tier":3,"value":500}]`)

	got, err := svc.ResolveItemSnapshots(ctx,
		[]TemplateSnapshotRequest{{TemplateID: levelZero}, {TemplateID: sword}, {TemplateID: sword, ItemLevel: intRef(40)}, {TemplateID: ring}},
		[]uuid.UUID{source})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}

	if got.Templates[0] != nil {
		t.Errorf("a template of required level 0 resolved to %+v, want it refused at send", got.Templates[0])
	}
	if len(got.UnrepresentableIDs) != 1 || got.UnrepresentableIDs[0] != levelZero {
		t.Errorf("unrepresentable = %v, want only the required-level-0 template", got.UnrepresentableIDs)
	}

	member := grantMember(t, ctx, db)
	for i, snap := range append(slices.Clone(got.Templates), got.Instances...) {
		if snap == nil {
			continue
		}
		if _, err := svc.GrantItems(ctx, member, "grant:"+uuid.NewString(), []GrantLine{{Snapshot: snap, Quantity: 1}}); err != nil {
			t.Errorf("snapshot %d (%s) resolved but its grant is refused: %v", i, snap.Name, err)
		}
	}
}

// FS-1GZGD AC "A copy enclosure x2 mints two new instances, each with its own
// id, owned by the claimer, in the stash, AVAILABLE, with no listing; the
// source instance is untouched", end to end through items: resolve, then
// grant from the snapshot.
func TestResolveThenGrant_ACopyLeavesItsSourceUntouched(t *testing.T) {
	ctx, db := catalogueDB(t)
	svc := NewService(NewRepository(db), db, nil, nil, nil)
	ring := seedRingTemplate(t, ctx, db, "Band of Embers", "fabled", 1, 1, "kill_frenzy", "Kills ignite.")
	seller, claimer := uuid.New(), grantMember(t, ctx, db)
	source := seedUniqueRingInstance(t, ctx, db, ring, seller, `[{"stat":"strength","tier":3,"value":500}]`)
	type sourceState struct {
		Owner     uuid.UUID  `db:"owner_member_id"`
		Status    string     `db:"status"`
		Location  string     `db:"location"`
		ListingID *uuid.UUID `db:"listing_id"`
		Affixes   Affixes    `db:"affixes"`
		UpdatedAt time.Time  `db:"updated_at"`
	}
	readSource := func() sourceState {
		var s sourceState
		if err := db.GetContext(ctx, &s, `SELECT owner_member_id, status, location, listing_id, affixes, updated_at FROM item_instances WHERE id = $1`, source); err != nil {
			t.Fatalf("read source: %v", err)
		}
		return s
	}
	before := readSource()

	resolved, err := svc.ResolveItemSnapshots(ctx, nil, []uuid.UUID{source})
	if err != nil || resolved.Instances[0] == nil {
		t.Fatalf("resolve: %+v, %v", resolved, err)
	}
	got, err := svc.GrantItems(ctx, claimer, "grant:"+uuid.NewString(), []GrantLine{{Snapshot: resolved.Instances[0], Quantity: 2}})
	if err != nil {
		t.Fatalf("grant: %v", err)
	}

	if len(got.ItemIDs) != 2 || got.ItemIDs[0] == got.ItemIDs[1] || got.ItemIDs[0] == source || got.ItemIDs[1] == source {
		t.Fatalf("ids = %v, want two new ids of their own", got.ItemIDs)
	}
	for id, r := range mintedRows(t, ctx, db, got.ItemIDs) {
		if r.Owner != claimer || r.Location != LocationStash || r.Status != itemStatusAvailable || r.ListingID != nil {
			t.Errorf("%s: owner %s location %s status %s listing %v, want the claimer's AVAILABLE stash item, no listing", id, r.Owner, r.Location, r.Status, r.ListingID)
		}
		if r.TemplateID != ring || r.Rarity != "fabled" || r.ItemLevel != 77 || len(r.Affixes) != 1 || r.Affixes[0] != (Affix{"strength", 3, 500}) {
			t.Errorf("%s: %+v, want the source's template, rarity, item level and affixes", id, r)
		}
	}
	after := readSource()
	if after.Owner != before.Owner || after.Status != before.Status || after.Location != before.Location ||
		after.ListingID == nil || *after.ListingID != *before.ListingID || !after.UpdatedAt.Equal(before.UpdatedAt) {
		t.Errorf("source changed: %+v -> %+v", before, after)
	}
}

// fakeResolveService records the ResolveItemSnapshots call the handler makes.
type fakeResolveService struct {
	Service
	calls       int
	templates   []TemplateSnapshotRequest
	instanceIDs []uuid.UUID
	result      *SnapshotResolution
	err         error
}

func (f *fakeResolveService) ResolveItemSnapshots(_ context.Context, templates []TemplateSnapshotRequest, instanceIDs []uuid.UUID) (*SnapshotResolution, error) {
	f.calls++
	f.templates, f.instanceIDs = templates, instanceIDs
	return f.result, f.err
}

// No token is read: a letter request has none. Results are index-aligned
// with the request, an unresolved one carrying its id and no snapshot.
func TestHandler_ResolveItemSnapshots_AnswersInRequestOrder(t *testing.T) {
	tpl, inst, unknown := uuid.New(), uuid.New(), uuid.New()
	attack := 6
	svc := &fakeResolveService{result: &SnapshotResolution{
		Templates:          []*ItemSnapshot{{TemplateID: tpl, Name: "Rusted Sword", ItemType: "weapon", Rarity: "normal", AttackPower: &attack, ItemLevel: 40, RequiredLevel: 3, Affixes: Affixes{}}, nil},
		Instances:          []*ItemSnapshot{{TemplateID: tpl, Name: "Copy", ItemType: "weapon", Rarity: "rare", ItemLevel: 7, RequiredLevel: 1, Affixes: Affixes{{"strength", 2, 3}}}},
		UnknownTemplateIDs: []uuid.UUID{unknown},
	}}

	got, err := NewHandler(svc, nil).ResolveItemSnapshots(context.Background(), &pb.ResolveItemSnapshotsRequest{
		Templates:   []*pb.TemplateSnapshotRequest{{TemplateId: tpl.String(), ItemLevel: proto32(40)}, {TemplateId: unknown.String()}},
		InstanceIds: []string{inst.String()},
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}

	if len(svc.templates) != 2 || svc.templates[0].ItemLevel == nil || *svc.templates[0].ItemLevel != 40 || svc.templates[1].ItemLevel != nil {
		t.Errorf("service got templates %+v, want the item level only where given", svc.templates)
	}
	if len(svc.instanceIDs) != 1 || svc.instanceIDs[0] != inst {
		t.Errorf("service got instances %v", svc.instanceIDs)
	}
	if len(got.Templates) != 2 || got.Templates[0].Id != tpl.String() || got.Templates[0].Snapshot == nil || got.Templates[1].Id != unknown.String() || got.Templates[1].Snapshot != nil {
		t.Fatalf("templates = %+v, want the sword then the unknown id without a snapshot", got.Templates)
	}
	if s := got.Templates[0].Snapshot; s.GetName() != "Rusted Sword" || s.GetItemLevel() != 40 || s.GetAttackPower() != 6 || s.DefenseRating != nil || s.GetRarity() != "normal" {
		t.Errorf("snapshot = %+v", s)
	}
	if len(got.Instances) != 1 || got.Instances[0].Id != inst.String() || len(got.Instances[0].Snapshot.GetAffixes()) != 1 {
		t.Errorf("instances = %+v", got.Instances)
	}
	if len(got.UnknownTemplateIds) != 1 || got.UnknownTemplateIds[0] != unknown.String() {
		t.Errorf("unknown templates = %v", got.UnknownTemplateIds)
	}
}

func proto32(v int32) *int32 { return &v }

func TestHandler_ResolveItemSnapshots_Refusals(t *testing.T) {
	many := &pb.ResolveItemSnapshotsRequest{}
	for range 101 {
		many.InstanceIds = append(many.InstanceIds, uuid.NewString())
	}
	manyTemplates := &pb.ResolveItemSnapshotsRequest{}
	for range 101 {
		manyTemplates.Templates = append(manyTemplates.Templates, &pb.TemplateSnapshotRequest{TemplateId: uuid.NewString()})
	}

	cases := []struct {
		name       string
		req        *pb.ResolveItemSnapshotsRequest
		serviceErr error
		wantCode   codes.Code
		reaches    bool
	}{
		{name: "malformed template id", req: &pb.ResolveItemSnapshotsRequest{Templates: []*pb.TemplateSnapshotRequest{{TemplateId: "x"}}}, wantCode: codes.InvalidArgument},
		{name: "malformed instance id", req: &pb.ResolveItemSnapshotsRequest{InstanceIds: []string{"x"}}, wantCode: codes.InvalidArgument},
		{name: "over 100 instance ids", req: many, wantCode: codes.InvalidArgument},
		{name: "over 100 templates", req: manyTemplates, wantCode: codes.InvalidArgument},
		{name: "store unavailable", req: &pb.ResolveItemSnapshotsRequest{InstanceIds: []string{uuid.NewString()}},
			serviceErr: fmt.Errorf("resolve instance snapshots: %w", commonconstants.ErrTransient), wantCode: codes.Unavailable, reaches: true},
		{name: "store fails", req: &pb.ResolveItemSnapshotsRequest{InstanceIds: []string{uuid.NewString()}}, serviceErr: errors.New("boom"), wantCode: codes.Internal, reaches: true},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			svc := &fakeResolveService{err: tt.serviceErr}

			_, err := NewHandler(svc, nil).ResolveItemSnapshots(context.Background(), tt.req)

			if got := status.Code(err); got != tt.wantCode {
				t.Fatalf("code = %v, want %v (err %v)", got, tt.wantCode, err)
			}
			if reached := svc.calls > 0; reached != tt.reaches {
				t.Errorf("service reached = %v, want %v", reached, tt.reaches)
			}
		})
	}
}

// An empty request asks nothing and is answered with nothing, without a read.
func TestHandler_ResolveItemSnapshots_EmptyRequest(t *testing.T) {
	svc := &fakeResolveService{}

	got, err := NewHandler(svc, nil).ResolveItemSnapshots(context.Background(), &pb.ResolveItemSnapshotsRequest{})

	if err != nil || len(got.GetTemplates())+len(got.GetInstances()) != 0 {
		t.Fatalf("got %+v, %v; want an empty answer", got, err)
	}
	if svc.calls != 0 {
		t.Errorf("an empty request reached the service")
	}
}
