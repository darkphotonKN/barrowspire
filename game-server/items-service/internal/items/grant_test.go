package items

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// seedWeaponTemplate inserts a weapon row (attack 6, crit 0.08, sword) and
// its template, removing both and their instances when the test ends.
func seedWeaponTemplate(t *testing.T, ctx context.Context, db *sqlx.DB, name string, minItemLevel, requiredLevel int) uuid.UUID {
	t.Helper()
	normal := rarityID(t, ctx, db, "normal")
	weaponID, templateID := uuid.New(), uuid.New()
	if _, err := db.ExecContext(ctx,
		`INSERT INTO weapons (id, rarity_id, attack_power, critical_rate, weapon_type, description)
		 VALUES ($1, $2, 6, 0.08, 'sword', 'A plain blade.')`, weaponID, normal); err != nil {
		t.Fatalf("weapon: %v", err)
	}
	if _, err := db.ExecContext(ctx,
		`INSERT INTO item_templates (id, item_name, rarity_id, item_type, item_id, required_level, min_item_level)
		 VALUES ($1, $2, $3, 'weapon', $4, $5, $6)`,
		templateID, name, normal, weaponID, requiredLevel, minItemLevel); err != nil {
		t.Fatalf("weapon template: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.ExecContext(ctx, `DELETE FROM item_instances WHERE template_id = $1`, templateID)
		_, _ = db.ExecContext(ctx, `DELETE FROM item_templates WHERE id = $1`, templateID)
		_, _ = db.ExecContext(ctx, `DELETE FROM weapons WHERE id = $1`, weaponID)
	})
	return templateID
}

// grantMember is a fresh member whose grants are removed when the test ends.
func grantMember(t *testing.T, ctx context.Context, db *sqlx.DB) uuid.UUID {
	t.Helper()
	member := uuid.New()
	t.Cleanup(func() {
		_, _ = db.ExecContext(ctx, `DELETE FROM item_grants WHERE member_id = $1`, member)
	})
	return member
}

// mintedRow is what a test reads back of a minted instance.
type mintedRow struct {
	TemplateID    uuid.UUID  `db:"template_id"`
	Owner         uuid.UUID  `db:"owner_member_id"`
	Source        string     `db:"source"`
	ItemType      string     `db:"item_type"`
	Name          string     `db:"name"`
	Description   *string    `db:"description"`
	Rarity        string     `db:"rarity"`
	AttackPower   *int       `db:"attack_power"`
	CriticalRate  *float64   `db:"critical_rate"`
	WeaponType    *string    `db:"weapon_type"`
	Status        string     `db:"status"`
	Location      string     `db:"location"`
	ListingID     *uuid.UUID `db:"listing_id"`
	ItemLevel     int        `db:"item_level"`
	RequiredLevel *int       `db:"required_level"`
	Affixes       Affixes    `db:"affixes"`
}

func mintedRows(t *testing.T, ctx context.Context, db *sqlx.DB, ids []uuid.UUID) map[uuid.UUID]mintedRow {
	t.Helper()
	var rows []struct {
		ID uuid.UUID `db:"id"`
		mintedRow
	}
	if err := db.SelectContext(ctx, &rows, `
		SELECT ii.id, ii.template_id, ii.owner_member_id, ii.source, ii.item_type, ii.name, ii.description,
		       COALESCE(r.rarity_code, '') AS rarity, ii.attack_power, ii.critical_rate, ii.weapon_type,
		       ii.status, ii.location, ii.listing_id, ii.item_level, ii.required_level, ii.affixes
		FROM item_instances AS ii
		LEFT JOIN item_rarities AS r ON r.id = ii.rarity_id
		WHERE ii.id = ANY($1::uuid[])`, pq.Array(ids)); err != nil {
		t.Fatalf("read minted rows: %v", err)
	}
	out := make(map[uuid.UUID]mintedRow, len(rows))
	for _, r := range rows {
		out[r.ID] = r.mintedRow
	}
	return out
}

func ownedCount(t *testing.T, ctx context.Context, db *sqlx.DB, member uuid.UUID) int {
	t.Helper()
	var n int
	if err := db.GetContext(ctx, &n, `SELECT COUNT(*) FROM item_instances WHERE owner_member_id = $1`, member); err != nil {
		t.Fatalf("count owned: %v", err)
	}
	return n
}

func grantRecorded(t *testing.T, ctx context.Context, db *sqlx.DB, grantID string) bool {
	t.Helper()
	var n int
	if err := db.GetContext(ctx, &n, `SELECT COUNT(*) FROM item_grants WHERE grant_id = $1`, grantID); err != nil {
		t.Fatalf("count grants: %v", err)
	}
	return n == 1
}

func strPtr(s string) *string { return &s }

// twoSnapshots are a rare, affixed sword at item level 40 (above any drop
// band, with an affix set no drop rule would allow for its rarity) and a
// plain unique ring, both as a resolve would describe them.
func twoSnapshots(sword, ring uuid.UUID) (a, b *ItemSnapshot) {
	attack, crit := 9, 0.15
	a = &ItemSnapshot{
		TemplateID: sword, Name: "Rusted Sword", Description: strPtr("A notched blade."),
		ItemType: "weapon", WeaponType: strPtr("sword"), Rarity: "rare",
		AttackPower: &attack, CriticalRate: &crit,
		ItemLevel: 40, RequiredLevel: 12,
		Affixes: Affixes{{Stat: "strength", Tier: 3, Value: 99}, {Stat: "agility", Tier: 1, Value: 1}, {Stat: "defense", Tier: 2, Value: 4}, {Stat: "max_mana", Tier: 3, Value: 40}, {Stat: "move_speed", Tier: 1, Value: 2}},
	}
	b = &ItemSnapshot{
		TemplateID: ring, Name: "Band of Embers", Description: strPtr("A plain band."),
		ItemType: "ring", Rarity: "normal", ItemLevel: 3, RequiredLevel: 2,
		Affixes: Affixes{}, UniqueEffectText: strPtr("Kills ignite."),
	}
	return a, b
}

// FS-1GZGD R18, AC "GrantItems with (snapshot A x1, snapshot B x3)": four
// AVAILABLE stash instances owned by the member, each equal to its snapshot,
// with no listing; their ids come back in request order.
func TestGrantItems_MintsEachSnapshotIntoTheStash(t *testing.T) {
	ctx, db := catalogueDB(t)
	svc := NewService(NewRepository(db), db, nil, nil, nil)
	sword := seedWeaponTemplate(t, ctx, db, "Rusted Sword", 1, 1)
	ring := seedRingTemplate(t, ctx, db, "Band of Embers", "normal", 1, 1, "kill_frenzy", "Kills ignite.")
	member := grantMember(t, ctx, db)
	a, b := twoSnapshots(sword, ring)

	got, err := svc.GrantItems(ctx, member, "grant:"+uuid.NewString(), []GrantLine{{Snapshot: a, Quantity: 1}, {Snapshot: b, Quantity: 3}})
	if err != nil {
		t.Fatalf("grant: %v", err)
	}

	if got.AlreadyGranted {
		t.Errorf("a first grant is not already granted")
	}
	if len(got.ItemIDs) != 4 {
		t.Fatalf("minted %d ids, want 4", len(got.ItemIDs))
	}
	rows := mintedRows(t, ctx, db, got.ItemIDs)
	if len(rows) != 4 {
		t.Fatalf("found %d rows for the ids, want 4", len(rows))
	}
	for i, id := range got.ItemIDs {
		want := b
		if i == 0 {
			want = a
		}
		r := rows[id]
		if r.Owner != member || r.Status != itemStatusAvailable || r.Location != LocationStash || r.ListingID != nil || r.Source != "reward" {
			t.Errorf("%d: owner %s status %s location %s listing %v source %s, want the member's AVAILABLE stash item, no listing, a reward",
				i, r.Owner, r.Status, r.Location, r.ListingID, r.Source)
		}
		if r.TemplateID != want.TemplateID || r.Name != want.Name || r.ItemType != want.ItemType || r.Rarity != want.Rarity {
			t.Errorf("%d: template %s name %q type %q rarity %q, want %+v", i, r.TemplateID, r.Name, r.ItemType, r.Rarity, want)
		}
		if r.Description == nil || *r.Description != *want.Description {
			t.Errorf("%d: description = %v, want %q", i, r.Description, *want.Description)
		}
		if r.ItemLevel != want.ItemLevel || r.RequiredLevel == nil || *r.RequiredLevel != want.RequiredLevel {
			t.Errorf("%d: item level %d required %v, want %d / %d", i, r.ItemLevel, r.RequiredLevel, want.ItemLevel, want.RequiredLevel)
		}
		if len(r.Affixes) != len(want.Affixes) {
			t.Fatalf("%d: affixes = %v, want %v", i, r.Affixes, want.Affixes)
		}
		for j := range want.Affixes {
			if r.Affixes[j] != want.Affixes[j] {
				t.Errorf("%d: affix %d = %+v, want %+v", i, j, r.Affixes[j], want.Affixes[j])
			}
		}
	}
	if r := rows[got.ItemIDs[0]]; r.AttackPower == nil || *r.AttackPower != 9 || r.CriticalRate == nil || *r.CriticalRate != 0.15 || r.WeaponType == nil || *r.WeaponType != "sword" {
		t.Errorf("sword stats = %v %v %v, want the snapshot's 9 / 0.15 / sword", r.AttackPower, r.CriticalRate, r.WeaponType)
	}
	if r := rows[got.ItemIDs[1]]; r.AttackPower != nil || r.WeaponType != nil {
		t.Errorf("a ring carries no weapon stats: %v %v", r.AttackPower, r.WeaponType)
	}
}

// FS-1GZGD Guard 2 (R20, R26): a second call with the same grant id mints
// nothing and answers the first call's ids, already granted.
func TestGrantItems_SameGrantIDTwiceMintsOnce(t *testing.T) {
	ctx, db := catalogueDB(t)
	svc := NewService(NewRepository(db), db, nil, nil, nil)
	sword := seedWeaponTemplate(t, ctx, db, "Rusted Sword", 1, 1)
	ring := seedRingTemplate(t, ctx, db, "Band of Embers", "normal", 1, 1, "", "")
	member := grantMember(t, ctx, db)
	a, b := twoSnapshots(sword, ring)
	b.UniqueEffectText = nil
	lines := []GrantLine{{Snapshot: a, Quantity: 1}, {Snapshot: b, Quantity: 3}}
	grantID := "grant:" + uuid.NewString()

	first, err := svc.GrantItems(ctx, member, grantID, lines)
	if err != nil {
		t.Fatalf("first grant: %v", err)
	}
	second, err := svc.GrantItems(ctx, member, grantID, lines)
	if err != nil {
		t.Fatalf("second grant: %v", err)
	}

	if !second.AlreadyGranted {
		t.Errorf("the repeat is not marked already granted")
	}
	if len(second.ItemIDs) != len(first.ItemIDs) {
		t.Fatalf("repeat answered %d ids, want the first call's %d", len(second.ItemIDs), len(first.ItemIDs))
	}
	for i := range first.ItemIDs {
		if second.ItemIDs[i] != first.ItemIDs[i] {
			t.Errorf("id %d = %s, want the first call's %s, in order", i, second.ItemIDs[i], first.ItemIDs[i])
		}
	}
	if n := ownedCount(t, ctx, db, member); n != 4 {
		t.Errorf("member owns %d instances, want one set of 4", n)
	}
}

// FS-1GZGD Guard 2 (concurrent): two identical grants started together
// against a real database mint exactly one set; the unique grant id decides.
func TestGrantItems_ConcurrentSameGrantIDMintsOnce(t *testing.T) {
	ctx, db := catalogueDB(t)
	svc := NewService(NewRepository(db), db, nil, nil, nil)
	sword := seedWeaponTemplate(t, ctx, db, "Rusted Sword", 1, 1)
	member := grantMember(t, ctx, db)
	a, _ := twoSnapshots(sword, uuid.Nil)
	lines := []GrantLine{{Snapshot: a, Quantity: 3}}

	for round := range 5 {
		grantID := "grant:" + uuid.NewString()
		before := ownedCount(t, ctx, db, member)

		var (
			wg      sync.WaitGroup
			start   = make(chan struct{})
			results [2]*GrantResult
			errs    [2]error
		)
		for i := range 2 {
			wg.Add(1)
			go func() {
				defer wg.Done()
				<-start
				results[i], errs[i] = svc.GrantItems(ctx, member, grantID, lines)
			}()
		}
		close(start)
		wg.Wait()

		for i, err := range errs {
			if err != nil {
				t.Fatalf("round %d call %d: %v", round, i, err)
			}
		}
		if results[0].AlreadyGranted == results[1].AlreadyGranted {
			t.Errorf("round %d: already granted = %v / %v, want exactly one first grant", round, results[0].AlreadyGranted, results[1].AlreadyGranted)
		}
		for i := range results[0].ItemIDs {
			if results[0].ItemIDs[i] != results[1].ItemIDs[i] {
				t.Errorf("round %d: the two calls answer different ids", round)
				break
			}
		}
		if n := ownedCount(t, ctx, db, member) - before; n != 3 {
			t.Errorf("round %d: minted %d instances, want exactly one set of 3", round, n)
		}
	}
}

// FS-1GZGD R19, D7: with the stash 2 slots short, nothing is minted, the call
// is refused STASH_FULL and the grant id is not spent; after freeing slots the
// same grant succeeds.
func TestGrantItems_StashShortMintsNothing(t *testing.T) {
	ctx, db := catalogueDB(t)
	svc := NewService(NewRepository(db), db, nil, nil, nil)
	sword := seedWeaponTemplate(t, ctx, db, "Rusted Sword", 1, 1)
	member := grantMember(t, ctx, db)
	var stashed []uuid.UUID
	for range StashCapacity - 2 {
		stashed = append(stashed, seedAt(t, ctx, db, member, itemStatusAvailable, LocationStash))
	}
	a, _ := twoSnapshots(sword, uuid.Nil)
	lines := []GrantLine{{Snapshot: a, Quantity: 4}}
	grantID := "grant:" + uuid.NewString()

	_, err := svc.GrantItems(ctx, member, grantID, lines)

	var refusal *errcode.Refusal
	if !errors.As(err, &refusal) || refusal.Code != errcode.StashFull {
		t.Fatalf("err = %v, want a STASH_FULL refusal", err)
	}
	if n := ownedCount(t, ctx, db, member); n != StashCapacity-2 {
		t.Errorf("member owns %d instances, want the %d seeded and nothing minted", n, StashCapacity-2)
	}
	if grantRecorded(t, ctx, db, grantID) {
		t.Errorf("a refused grant recorded its grant id")
	}

	if _, err := db.ExecContext(ctx, `DELETE FROM item_instances WHERE id = ANY($1::uuid[])`, pq.Array(stashed[:2])); err != nil {
		t.Fatalf("free two slots: %v", err)
	}
	got, err := svc.GrantItems(ctx, member, grantID, lines)
	if err != nil {
		t.Fatalf("retry after freeing slots: %v", err)
	}
	if got.AlreadyGranted || len(got.ItemIDs) != 4 {
		t.Errorf("retry = %d ids, already granted %v; want 4 freshly minted", len(got.ItemIDs), got.AlreadyGranted)
	}
}

// FS-1GZGD R19 (S2 backstop): a snapshot of an unknown template, or one that
// is not representable, mints nothing (not even the good entries beside it)
// and records no grant.
func TestGrantItems_InvalidSnapshotMintsNothing(t *testing.T) {
	ctx, db := catalogueDB(t)
	svc := NewService(NewRepository(db), db, nil, nil, nil)
	sword := seedWeaponTemplate(t, ctx, db, "Rusted Sword", 1, 1)

	cases := []struct {
		name   string
		break_ func(s *ItemSnapshot)
	}{
		{"unknown template", func(s *ItemSnapshot) { s.TemplateID = uuid.New() }},
		{"unknown affix stat", func(s *ItemSnapshot) { s.Affixes = Affixes{{Stat: "luck", Tier: 1, Value: 1}} }},
		{"affix tier above 3", func(s *ItemSnapshot) { s.Affixes = Affixes{{Stat: "strength", Tier: 4, Value: 1}} }},
		{"negative affix value", func(s *ItemSnapshot) { s.Affixes = Affixes{{Stat: "strength", Tier: 1, Value: -1}} }},
		{"item level 0", func(s *ItemSnapshot) { s.ItemLevel = 0 }},
		{"required level 0", func(s *ItemSnapshot) { s.RequiredLevel = 0 }},
		{"unknown rarity", func(s *ItemSnapshot) { s.Rarity = "mythic" }},
		{"item type other than the template's", func(s *ItemSnapshot) { s.ItemType = "armor"; s.ArmorSlot = strPtr("head") }},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			member := grantMember(t, ctx, db)
			good, _ := twoSnapshots(sword, uuid.Nil)
			bad, _ := twoSnapshots(sword, uuid.Nil)
			tt.break_(bad)
			grantID := "grant:" + uuid.NewString()

			_, err := svc.GrantItems(ctx, member, grantID, []GrantLine{{Snapshot: good, Quantity: 1}, {Snapshot: bad, Quantity: 1}})

			if !errors.Is(err, ErrSnapshotInvalid) {
				t.Fatalf("err = %v, want ErrSnapshotInvalid", err)
			}
			if !errors.Is(err, commonconstants.ErrInvalidInput) {
				t.Errorf("err = %v, want it to read as invalid input too", err)
			}
			if n := ownedCount(t, ctx, db, member); n != 0 {
				t.Errorf("minted %d instances, want none", n)
			}
			if grantRecorded(t, ctx, db, grantID) {
				t.Errorf("a refused grant recorded its grant id")
			}
		})
	}
}

// A grant id is one grant of one member: another member presenting it mints
// nothing and is not handed the first member's ids.
func TestGrantItems_AGrantIDOfAnotherMemberIsRefused(t *testing.T) {
	ctx, db := catalogueDB(t)
	svc := NewService(NewRepository(db), db, nil, nil, nil)
	sword := seedWeaponTemplate(t, ctx, db, "Rusted Sword", 1, 1)
	first, other := grantMember(t, ctx, db), grantMember(t, ctx, db)
	a, _ := twoSnapshots(sword, uuid.Nil)
	lines := []GrantLine{{Snapshot: a, Quantity: 1}}
	grantID := "grant:" + uuid.NewString()

	if _, err := svc.GrantItems(ctx, first, grantID, lines); err != nil {
		t.Fatalf("first grant: %v", err)
	}
	got, err := svc.GrantItems(ctx, other, grantID, lines)

	if !errors.Is(err, ErrGrantIDTaken) {
		t.Fatalf("got %+v, err = %v; want ErrGrantIDTaken", got, err)
	}
	if n := ownedCount(t, ctx, db, other); n != 0 {
		t.Errorf("the other member got %d instances, want none", n)
	}
}

// fakeGrantService records the GrantItems call the handler makes.
type fakeGrantService struct {
	Service
	calls   int
	member  uuid.UUID
	grantID string
	lines   []GrantLine
	result  *GrantResult
	err     error
}

func (f *fakeGrantService) GrantItems(_ context.Context, member uuid.UUID, grantID string, lines []GrantLine) (*GrantResult, error) {
	f.calls++
	f.member, f.grantID, f.lines = member, grantID, lines
	return f.result, f.err
}

func asGrantMember(id uuid.UUID) context.Context {
	return commonauth.EmbedIdentity(context.Background(), commonauth.Identity{MemberID: id})
}

func grantRequest(quantities ...int32) *pb.GrantItemsRequest {
	req := &pb.GrantItemsRequest{GrantId: "grant:1"}
	for _, q := range quantities {
		req.Items = append(req.Items, &pb.GrantItem{Quantity: q, Snapshot: &pb.ItemSnapshot{
			TemplateId: uuid.NewString(), Name: "Rusted Sword", ItemType: "weapon", Rarity: "rare",
			ItemLevel: 40, RequiredLevel: 12, Affixes: []*pb.Affix{{Stat: "strength", Tier: 3, Value: 99}},
		}})
	}
	return req
}

// FS-1GZGD D18, AC "No member field exists on the GrantItems request".
func TestGrantItemsRequest_NamesNoMember(t *testing.T) {
	fields := (&pb.GrantItemsRequest{}).ProtoReflect().Descriptor().Fields()
	for i := range fields.Len() {
		name := string(fields.Get(i).Name())
		if strings.Contains(name, "member") || strings.Contains(name, "owner") || strings.Contains(name, "account") {
			t.Errorf("GrantItemsRequest has field %q: the member must come from the token only", name)
		}
	}
}

// The member is the forwarded token's; the request is handed over as lines,
// and the minted ids and already-granted flag come back as they were.
func TestHandler_GrantItems_GrantsToTheTokensMember(t *testing.T) {
	member, minted := uuid.New(), []uuid.UUID{uuid.New(), uuid.New()}
	svc := &fakeGrantService{result: &GrantResult{ItemIDs: minted, AlreadyGranted: true}}
	req := grantRequest(2)

	got, err := NewHandler(svc, nil).GrantItems(asGrantMember(member), req)
	if err != nil {
		t.Fatalf("grant: %v", err)
	}

	if svc.member != member || svc.grantID != "grant:1" {
		t.Errorf("service got member %s grant %q, want the token's %s and the request's grant id", svc.member, svc.grantID, member)
	}
	if len(svc.lines) != 1 || svc.lines[0].Quantity != 2 {
		t.Fatalf("lines = %+v, want one line of quantity 2", svc.lines)
	}
	s := svc.lines[0].Snapshot
	if s.TemplateID.String() != req.Items[0].Snapshot.TemplateId || s.Name != "Rusted Sword" || s.Rarity != "rare" || s.ItemLevel != 40 || s.RequiredLevel != 12 {
		t.Errorf("snapshot = %+v, want the request's", s)
	}
	if len(s.Affixes) != 1 || s.Affixes[0] != (Affix{Stat: "strength", Tier: 3, Value: 99}) {
		t.Errorf("affixes = %+v, want the request's", s.Affixes)
	}
	if !got.AlreadyGranted || len(got.ItemIds) != 2 || got.ItemIds[0] != minted[0].String() || got.ItemIds[1] != minted[1].String() {
		t.Errorf("response = %+v, want the service's ids in order, already granted", got)
	}
}

func TestHandler_GrantItems_Refusals(t *testing.T) {
	member := uuid.New()
	tooLong := grantRequest(1)
	tooLong.GrantId = strings.Repeat("x", 201)
	noGrantID := grantRequest(1)
	noGrantID.GrantId = ""
	badTemplate := grantRequest(1)
	badTemplate.Items[0].Snapshot.TemplateId = "not-a-uuid"
	noSnapshot := grantRequest(1)
	noSnapshot.Items[0].Snapshot = nil
	tooManyLines := grantRequest()
	for range 61 {
		tooManyLines.Items = append(tooManyLines.Items, grantRequest(1).Items[0])
	}

	cases := []struct {
		name       string
		ctx        context.Context
		req        *pb.GrantItemsRequest
		serviceErr error
		wantCode   codes.Code
		wantReason errcode.Code
		reaches    bool
	}{
		{name: "no token", ctx: context.Background(), req: grantRequest(1), wantCode: codes.Unauthenticated},
		{name: "no grant id", ctx: asGrantMember(member), req: noGrantID, wantCode: codes.InvalidArgument},
		{name: "grant id over 200 characters", ctx: asGrantMember(member), req: tooLong, wantCode: codes.InvalidArgument},
		{name: "no items", ctx: asGrantMember(member), req: grantRequest(), wantCode: codes.InvalidArgument},
		{name: "more than 60 entries", ctx: asGrantMember(member), req: tooManyLines, wantCode: codes.InvalidArgument},
		{name: "quantity 0", ctx: asGrantMember(member), req: grantRequest(0), wantCode: codes.InvalidArgument},
		{name: "quantity 61", ctx: asGrantMember(member), req: grantRequest(61), wantCode: codes.InvalidArgument},
		{name: "malformed template id", ctx: asGrantMember(member), req: badTemplate, wantCode: codes.InvalidArgument},
		{name: "no snapshot", ctx: asGrantMember(member), req: noSnapshot, wantCode: codes.InvalidArgument},
		{name: "stash full", ctx: asGrantMember(member), req: grantRequest(1), serviceErr: errcode.Refuse(errcode.StashFull),
			wantCode: codes.FailedPrecondition, wantReason: errcode.StashFull, reaches: true},
		{name: "invalid snapshot", ctx: asGrantMember(member), req: grantRequest(1), serviceErr: ErrSnapshotInvalid,
			wantCode: codes.InvalidArgument, reaches: true},
		{name: "grant id of another member", ctx: asGrantMember(member), req: grantRequest(1), serviceErr: ErrGrantIDTaken,
			wantCode: codes.AlreadyExists, reaches: true},
		{name: "store down", ctx: asGrantMember(member), req: grantRequest(1), serviceErr: commonconstants.ErrTransient,
			wantCode: codes.Unavailable, reaches: true},
		{name: "anything else", ctx: asGrantMember(member), req: grantRequest(1), serviceErr: errors.New("boom"),
			wantCode: codes.Internal, reaches: true},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			svc := &fakeGrantService{err: tt.serviceErr}

			_, err := NewHandler(svc, nil).GrantItems(tt.ctx, tt.req)

			if got := status.Code(err); got != tt.wantCode {
				t.Fatalf("code = %v, want %v (err %v)", got, tt.wantCode, err)
			}
			if tt.wantReason != "" {
				if reason, ok := errcode.RefusalReason(status.Convert(err)); !ok || reason != tt.wantReason {
					t.Errorf("reason = %q, want %q", reason, tt.wantReason)
				}
			}
			if reached := svc.calls > 0; reached != tt.reaches {
				t.Errorf("service reached = %v, want %v", reached, tt.reaches)
			}
		})
	}
}
