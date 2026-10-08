#!/usr/bin/env bash
# Dev seed (FS-F8T3H R16-R19, FS-4R9M9 R62-R63). Meant for a FRESH DB: items
# migrated to 000024 (five fantasy rarities, empty catalogue, rings and
# unique_items tables) and a running local stack.
# Creates 1 admin + 4 players (password $SEED_PASSWORD), the 77-template v1
# catalogue (24 tier I + 44 tier II/III bases, 3 ring bases, 6 uniques with
# their unique rows), 10,000 gold per player, and 20 owned instances.
# Re-runs skip what already exists; it never duplicates data.
#
# The instances below are hand-authored but are ones the loot roll could have
# produced. The rules live in game-service, not here:
#   game-service/internal/game/loot_roll.go    base pick, stat roll, names, affixes,
#                                              required level, Fabled -> unique
#   game-service/internal/game/loot_tuning.go  rarity multipliers 1.00/1.05/1.10/1.15,
#                                              affix counts 0/1/2/3-4, affix table
#                                              and tier unlocks (ilvl 1/8/15, req 1/6/13)
# In short: ints = round(base * 0.8..1.2 * rarity mult), crit = base +-0.02
# (no tier step); a base needs min_item_level <= ilvl; an affix tier needs ilvl
# >= its unlock; required level = max(base req, highest affix tier req). There
# is no random Fabled: a Fabled instance is always a unique.
set -euo pipefail

API=${API_URL:-http://localhost:7114/api}
AUTH_DSN=${AUTH_DSN:-postgres://user:password@localhost:5216/barrowspire_auth_service_db?sslmode=disable}
ITEMS_DSN=${ITEMS_DSN:-postgres://user:password@localhost:5217/barrowspire_items_service_db?sslmode=disable}
PASS=${SEED_PASSWORD:-barrowspire-dev}
NORMAL=f8700000-0000-0000-0000-000000000001
FABLED=f8700000-0000-0000-0000-000000000005
CATALOGUE=77 UNIQUES=6
PLAYERS="aldric brenna corwin dunstan"
TOKEN=

die() { echo "seed-dev: $*" >&2; exit 1; }
sql() { psql "$1" -v ON_ERROR_STOP=1 -qAt "${@:2}"; }
req() { # METHOD PATH [JSON] -> sets CODE, BODY
  BODY=$(curl -sS -X "$1" "$API$2" -H 'Content-Type: application/json' \
    ${TOKEN:+-H "Authorization: Bearer $TOKEN"} ${3:+-d "$3"} -w $'\n%{http_code}')
  CODE=${BODY##*$'\n'}; BODY=${BODY%$'\n'*}
}
signin() { # EMAIL -> sets TOKEN, MID
  TOKEN=; req POST /member/signin "$(jq -nc --arg e "$1" --arg p "$PASS" '{email:$e,password:$p}')"
  [ "$CODE" = 200 ] || die "signin $1: $CODE $BODY"
  TOKEN=$(jq -r .result.access_token <<<"$BODY"); MID=$(jq -r .result.member_info.id <<<"$BODY")
}

# 1. Accounts
for u in admin $PLAYERS; do
  TOKEN=; req POST /member/signup "$(jq -nc --arg u "$u" --arg p "$PASS" \
    '{name:(($u[:1]|ascii_upcase)+$u[1:]), email:"\($u)@barrowspire.dev", password:$p}')"
  case $CODE in 201) echo "signed up $u";; 409) echo "$u exists, continuing";; *) die "signup $u: $CODE $BODY";; esac
done

# 2. Admin: role is a token claim (FS-9KW9F), so sign in again after the UPDATE.
sql "$AUTH_DSN" -c "UPDATE members SET role='admin' WHERE email='admin@barrowspire.dev'"
signin admin@barrowspire.dev; ID_admin=$MID

# 3. Catalogue (FS-4R9M9 R1-R6, R31, R62). Weapons, armor and consumables go
# through the real complete-* endpoints; item_code/type_id/durability/prices
# are required by those bodies and then discarded: dummy values. Rings have no
# HTTP create (R9), so their `rings` row and template are SQL. Those endpoints
# never write min_item_level (default 1), so it is set by SQL afterwards.
# Each template is created only if no template has its name yet, so a run that
# died half-way resumes instead of duplicating.
n=$(sql "$ITEMS_DSN" -c "SELECT count(*) FROM item_templates")
u=$(sql "$ITEMS_DSN" -c "SELECT count(*) FROM unique_items")
if [ "$n" = "$CATALOGUE" ] && [ "$u" = "$UNIQUES" ]; then
  echo "$CATALOGUE templates and $UNIQUES uniques present, skipping"
else
  have=$(sql "$ITEMS_DSN" -c "SELECT item_name FROM item_templates")
  names=() created=0
  # kind|rarity|required_level|min_item_level|name|x|y|z|desc
  #   weapon: x=weapon_type y=attack z=crit · armor: x=slot y=defense z=magic_res
  #   consumable: x=healing y=stack · ring: no stats
  # Tier I: req 1, min ilvl 1 · tier II: req 6, min ilvl 8 · tier III: req 13, min ilvl 15.
  # Uniques (fabled) carry their own req / min ilvl (R31); desc is their lore.
  while IFS='|' read -r kind rar rl ml name x y z desc; do
    names+=("$name")
    if ! grep -Fxq -- "$name" <<<"$have"; then
      rid=$NORMAL; [ "$rar" = fabled ] && rid=$FABLED
      slug=$(tr 'A-Z ' 'a-z_' <<<"$name" | tr -d "'")
      if [ "$kind" = ring ]; then
        sql "$ITEMS_DSN" -v name="$name" -v rid="$rid" -v rl="$rl" -v desc="$desc" \
          -v icon="/icons/ring/$slug.png" <<'SQL'
WITH r AS (
  INSERT INTO rings (rarity_id, description) VALUES (:'rid'::uuid, :'desc') RETURNING id
)
INSERT INTO item_templates (item_name, rarity_id, item_type, item_id, icon_url, required_level)
SELECT :'name', :'rid'::uuid, 'ring', r.id, :'icon', :'rl'::int FROM r;
SQL
      else
        req POST "/items/complete-$kind" "$(jq -nc --arg k "$kind" --arg n "$name" --arg s "$slug" \
          --arg x "$x" --arg y "$y" --arg z "$z" --arg d "$desc" --arg r "$rid" --arg l "$rl" '
          {item_name:$n, item_code:$s, type_id:"legacy", rarity_id:$r, required_level:($l|tonumber),
           icon_url:"/icons/\($k)/\($s).png", description:$d, base_sell_price:0, base_buy_price:0}
          + if $k=="weapon" then {weapon_type:$x, attack_power:($y|tonumber), critical_rate:($z|tonumber), durability:1}
            elif $k=="armor" then {armor_slot:$x, defense_rating:($y|tonumber), magic_resistance:($z|tonumber), durability:1}
            else {healing_amount:($x|tonumber), max_stack_size:($y|tonumber)} end')"
        [ "$CODE" = 201 ] || die "create $name: $CODE $BODY"
      fi
      created=$((created + 1))
    fi
    sql "$ITEMS_DSN" -v name="$name" -v ml="$ml" <<'SQL'
UPDATE item_templates SET min_item_level = :'ml'::int WHERE item_name = :'name' AND min_item_level <> :'ml'::int;
SQL
  done <<'EOF'
weapon|normal|1|1|Longsword|sword|6|0.08|A plain soldier's blade, nicked from old wars.
weapon|normal|1|1|Seax|knife|3|0.15|A long single-edged knife, the kind men are buried with.
weapon|normal|1|1|Flanged Mace|mace|9|0.02|An iron head of hammered flanges, made for breaking helms.
weapon|normal|1|1|Boar Spear|spear|5|0.06|An ash haft with lugs below the blade, to hold back what charges.
weapon|normal|1|1|Bearded Axe|axe|7|0.05|A hooked axe that drags shields down as readily as it splits them.
weapon|normal|1|1|Iron Cestus|fist|4|0.10|Iron-studded hand wrappings, stiff with old blood.
armor|normal|1|1|Leather Cap|head|2|1|A boiled-leather cap, cracked along the seams.
armor|normal|1|1|Leather Jerkin|chest|4|1|A jerkin of layered hide, sweat-dark at the collar.
armor|normal|1|1|Leather Leggings|legs|3|1|Hide leggings laced with gut, patched at both knees.
armor|normal|1|1|Leather Gloves|gloves|1|1|Worn riding gloves, scarred across the back.
armor|normal|1|1|Bone Helm|head|1|3|A helm pieced from old bone, scratched with warding marks.
armor|normal|1|1|Bone Armor|chest|3|5|Ribs and shoulder blades bound on cord. The dead are said to look away.
armor|normal|1|1|Bone Leggings|legs|2|4|Shin guards of carved bone, cold even in summer.
armor|normal|1|1|Bone Gloves|gloves|1|2|Knuckle bones stitched to leather. They rattle faintly in the dark.
armor|normal|1|1|Ringmail Coif|head|3|1|A hood of riveted rings, heavy on the neck.
armor|normal|1|1|Ringmail Tunic|chest|6|2|A knee-length shirt of rings, rust at every link.
armor|normal|1|1|Ringmail Leggings|legs|4|1|Ringmail chausses that clink with every step.
armor|normal|1|1|Ringmail Gauntlets|gloves|2|1|Mail mittens over padded gloves, stiff to close.
armor|normal|1|1|Plate Helm|head|5|0|A dented iron helm with a narrow eye-slit.
armor|normal|1|1|Plate Breastplate|chest|8|1|A heavy breastplate, the smith's mark long since worn away.
armor|normal|1|1|Plate Greaves|legs|6|0|Iron greaves strapped over the shins, loud on stone.
armor|normal|1|1|Plate Gauntlets|gloves|3|0|Jointed iron gauntlets. The fingers bend, but grudgingly.
consumable|normal|1|1|Lesser Heal Potion|10|20||A small vial of bitter herbs steeped in wine.
consumable|normal|1|1|Greater Heal Potion|25|10||A stoppered flask of dark tincture that burns going down.
weapon|normal|6|8|Bastard Sword|sword|8|0.08|A longer blade on a hand-and-a-half grip, balanced for either.
weapon|normal|6|8|Langseax|knife|4|0.15|A seax grown near to a sword's length, still single-edged and cruel.
weapon|normal|6|8|Morning Star|mace|11|0.02|A spiked iron ball on a stout haft. Plain work, ugly results.
weapon|normal|6|8|Winged Spear|spear|6|0.06|A broad spearhead with flanged wings, so it never sinks too deep.
weapon|normal|6|8|Broad Axe|axe|9|0.05|A wide-bitted axe, as fit for timber as for men.
weapon|normal|6|8|Spiked Cestus|fist|5|0.10|Leather wrappings set with iron spikes over the knuckles.
weapon|normal|13|15|Blackiron Sword|sword|9|0.08|A sword of dark barrow iron that holds its edge through bone.
weapon|normal|13|15|Grave Seax|knife|5|0.15|A seax dug up beside its owner. The blade had kept better than the bones.
weapon|normal|13|15|Blackiron Mace|mace|14|0.02|A mace head of black barrow iron, heavy enough to fold plate.
weapon|normal|13|15|Partisan|spear|8|0.06|A long-bladed spear with side spikes, once carried by barrow wardens.
weapon|normal|13|15|Dane Axe|axe|11|0.05|A long-hafted axe swung in both hands. It clears a doorway in one stroke.
weapon|normal|13|15|Blackiron Cestus|fist|6|0.10|Plates of black iron riveted over the fist. Heavy, and meant to be.
armor|normal|6|8|Hardened Leather Cap|head|3|1|A leather cap boiled twice and waxed, hard as horn.
armor|normal|6|8|Hardened Leather Jerkin|chest|5|2|Hide hardened in hot wax, stiff enough to turn a knife.
armor|normal|6|8|Hardened Leather Leggings|legs|4|1|Waxed hide leggings that creak at every stride.
armor|normal|6|8|Hardened Leather Gloves|gloves|2|1|Hardened gloves with a ridge of horn over the knuckles.
armor|normal|6|8|Carved Bone Helm|head|1|4|Skull plates carved with marks cut deep and rubbed with ash.
armor|normal|6|8|Carved Bone Armor|chest|4|6|Bone plates carved with names. None of them are the wearer's.
armor|normal|6|8|Carved Bone Leggings|legs|3|5|Carved bone splints bound over the shins with sinew.
armor|normal|6|8|Carved Bone Gloves|gloves|1|3|Finger bones carved into small plates and sewn to hide.
armor|normal|6|8|Chainmail Coif|head|4|1|A close-woven mail hood, every ring riveted shut.
armor|normal|6|8|Chainmail Tunic|chest|8|2|A heavy mail shirt, patched with rings from other shirts.
armor|normal|6|8|Chainmail Leggings|legs|5|1|Mail leggings over quilted wool, warm and loud.
armor|normal|6|8|Chainmail Gauntlets|gloves|3|1|Fine mail mittens with leather palms, tight at the wrist.
armor|normal|6|8|Banded Helm|head|6|0|An iron helm with riveted bands across the crown.
armor|normal|6|8|Banded Breastplate|chest|10|1|Bands of iron strapped over a padded coat, heavy but sure.
armor|normal|6|8|Banded Greaves|legs|8|0|Banded iron greaves, buckled tight below the knee.
armor|normal|6|8|Banded Gauntlets|gloves|4|0|Banded gauntlets that close with a sound like a gate.
armor|normal|13|15|Studded Leather Cap|head|3|2|A heavy cap set with iron studs, each one hammered by hand.
armor|normal|13|15|Studded Leather Jerkin|chest|6|2|A jerkin crowded with iron studs, dark with old oil.
armor|normal|13|15|Studded Leather Leggings|legs|5|2|Studded leggings that have walked a long way and kept walking.
armor|normal|13|15|Studded Leather Gloves|gloves|2|2|Studded gloves, the rivets worn smooth from use.
armor|normal|13|15|Wight-bone Helm|head|2|5|Bone taken from a wight's barrow. It hums when the dead are near.
armor|normal|13|15|Wight-bone Armor|chest|5|8|A cuirass of wight-bone, grey as frost and twice as cold.
armor|normal|13|15|Wight-bone Leggings|legs|3|6|Wight-bone greaves that leave no tracks in the dust.
armor|normal|13|15|Wight-bone Gloves|gloves|2|3|Gloves of wight-bone knuckles. The hand inside never warms.
armor|normal|13|15|Scale Coif|head|5|2|A hood of overlapping iron scales, cold against the cheek.
armor|normal|13|15|Scale Tunic|chest|9|3|Iron scales sewn row on row, like the hide of some old fish.
armor|normal|13|15|Scale Leggings|legs|6|2|Scale leggings that rasp softly with each step.
armor|normal|13|15|Scale Gauntlets|gloves|3|2|Scaled gauntlets, each finger plated to the tip.
armor|normal|13|15|Blackiron Helm|head|8|0|A helm forged from black barrow iron. It never rusts.
armor|normal|13|15|Blackiron Breastplate|chest|13|1|A breastplate of black barrow iron, cold to the touch in any season.
armor|normal|13|15|Blackiron Greaves|legs|9|0|Black iron greaves, the smith's work too fine for the barrows.
armor|normal|13|15|Blackiron Gauntlets|gloves|5|0|Black iron gauntlets with a grip that does not tire.
ring|normal|1|1|Iron Band||||A plain band of black iron, worn thin on the inside.
ring|normal|1|8|Silver Band||||A tarnished silver band, taken from a grave offering.
ring|normal|1|15|Barrow-gold Band||||Dull gold from the deep barrows. Some say it should have stayed there.
weapon|fabled|5|6|Wightfang|knife|4|0.18|A seax pried from a wight's barrow. It is never quite cold.
armor|fabled|7|8|Gravewarden's Oath|chest|10|1|The mail of the barrow's last warden, who swore that no one would pass.
ring|fabled|9|10|Lantern of the Drowned||||A green-glass ring that glows under water, as if lit from within.
armor|fabled|10|12|The Hollow Crown|head|2|5|A crown of black iron, its stones long gone, worn by a king no one buried.
armor|fabled|12|14|Ashwalk Greaves|legs|4|2|Iron greaves scorched black. Ash falls from them with every stride.
ring|fabled|16|18|Ring of the Last King||||A heavy gold signet. The face cut into it has been scratched away.
EOF
  [ "${#names[@]}" = "$CATALOGUE" ] || die "catalogue list has ${#names[@]} rows (want $CATALOGUE)"

  # Unique rows (R6, R31): effect code, effect text, fixed affixes as ranges.
  # A unique's template is any `fabled` template; nothing else is ever fabled.
  # name|effect_code|fixed_affixes|effect_text
  while IFS='|' read -r name code fixed text; do
    sql "$ITEMS_DSN" -v name="$name" -v code="$code" -v fixed="$fixed" -v text="$text" -v rid="$FABLED" <<'SQL'
INSERT INTO unique_items (template_id, effect_code, effect_text, fixed_affixes)
SELECT id, :'code', :'text', :'fixed'::jsonb FROM item_templates
 WHERE item_name = :'name' AND rarity_id = :'rid'::uuid
ON CONFLICT (template_id) DO NOTHING;
SQL
  done <<'EOF'
Wightfang|kill_frenzy|[{"stat":"agility","min":2,"max":4},{"stat":"attack_speed","min":4,"max":6}]|Each kill grants +15% attack speed for 4 seconds, stacking up to 3 times.
Gravewarden's Oath|melee_reflect|[{"stat":"max_health","min":10,"max":16},{"stat":"strength","min":2,"max":3}]|Reflects 20% of melee damage taken back to the attacker.
Lantern of the Drowned|pierce|[{"stat":"intelligence","min":2,"max":4},{"stat":"max_mana","min":10,"max":16},{"stat":"magic_resistance","min":2,"max":3}]|Your projectiles pierce one extra target.
The Hollow Crown|kill_heal|[{"stat":"max_health","min":12,"max":18},{"stat":"defense","min":2,"max":3}]|Kills restore 4% of your maximum health.
Ashwalk Greaves|burning_dash|[{"stat":"move_speed","min":6,"max":8},{"stat":"agility","min":3,"max":4}]|Dashing leaves a burning trail that scorches monsters.
Ring of the Last King|floor_attributes|[{"stat":"strength","min":1,"max":2},{"stat":"agility","min":1,"max":2},{"stat":"intelligence","min":1,"max":2},{"stat":"crit_chance","min":1,"max":2}]|+1 to all attributes for each floor climbed this run.
EOF

  have=$(sql "$ITEMS_DSN" -c "SELECT item_name FROM item_templates")
  for name in "${names[@]}"; do
    grep -Fxq -- "$name" <<<"$have" || die "template '$name' missing after create"
  done
  u=$(sql "$ITEMS_DSN" -c "SELECT count(*) FROM unique_items")
  [ "$u" = "$UNIQUES" ] || die "unique_items has $u rows (want $UNIQUES)"
  echo "created $created templates; catalogue has all $CATALOGUE and $UNIQUES uniques"
fi

# 4. Gold. The wallet account is created asynchronously after signup
# (ADR-0014), so retry sign-in + read + deposit briefly, then fail loudly.
# If the account never appears (member.signedup not reaching wallet-service),
# create it directly: the endpoint derives the account from the caller.
for u in $PLAYERS; do
  ok=
  for _ in $(seq 1 20); do
    signin "$u@barrowspire.dev"; req GET /wallet/account
    [ "$CODE" = 404 ] && { req POST /wallet/account; req GET /wallet/account; }
    if [ "$CODE" = 200 ]; then
      gold=$(jq -r '.gold // 0' <<<"$BODY")
      [ "$gold" -ge 10000 ] && { ok=1; break; }
      req POST /wallet/deposit "{\"gold\":$((10000 - gold))}"
      [ "$CODE" = 200 ] && { ok=1; break; }
    fi
    sleep 1
  done
  [ -n "$ok" ] || die "$u: no wallet deposit after 20s (last: $CODE $BODY)"
  printf -v "ID_$u" %s "$MID"; echo "$u funded to 10,000 gold"
done

# 5. Instances (FS-4R9M9 R63): 5 per player; every tier from Normal to Runed,
# two uniques (the only Fabled instances), three rings. Skipped if any exist.
owners="'$ID_aldric','$ID_brenna','$ID_corwin','$ID_dunstan'"
n=$(sql "$ITEMS_DSN" -c "SELECT count(*) FROM item_instances WHERE owner_member_id IN ($owners)")
if [ "$n" != 0 ]; then echo "players already own $n instances, skipping"
else
  sql "$ITEMS_DSN" -v aldric="$ID_aldric" -v brenna="$ID_brenna" -v corwin="$ID_corwin" -v dunstan="$ID_dunstan" <<'SQL'
-- (owner, base template, rolled name, rarity, item level,
--  weapon attack | armor defense | healing, crit | magic res, required level, affixes)
-- Each comment: ilvl, base tier, the rolled stat ranges, affix tiers, and why
-- the required level is what it is. Ranges are round(base * 0.8..1.2 * mult).
INSERT INTO item_instances (template_id, owner_member_id, source, status, item_type, name, rarity_id, description,
  attack_power, critical_rate, weapon_type, defense_rating, magic_resistance, armor_slot, healing_amount, mana_amount, buff_duration,
  item_level, affixes, required_level)
SELECT t.id, v.owner::uuid, 'reward', 'AVAILABLE', t.item_type, v.name, ir.id,
  COALESCE(w.description, a.description, c.description, r.description),
  CASE WHEN w.id IS NOT NULL THEN v.a END, CASE WHEN w.id IS NOT NULL THEN v.b END, w.weapon_type,
  CASE WHEN a.id IS NOT NULL THEN v.a END, CASE WHEN a.id IS NOT NULL THEN v.b::int END, a.armor_slot,
  CASE WHEN c.id IS NOT NULL THEN v.a END, c.mana_amount, c.buff_duration,
  v.ilvl, v.affixes::jsonb, v.req
FROM (VALUES
  -- ilvl 3, tier I base; Normal x1.00: atk 6 -> 5..7, crit 0.06..0.10; no affixes; req 1
  (:'aldric',  'Longsword',               'Longsword',                                'normal',   3,  6,    0.09::numeric, 1,  '[]'),
  -- ilvl 4, tier I; Uncommon x1.05: def 4 -> 3..5, mr 1 -> 1; max_health T1 (4-7); req 1
  (:'aldric',  'Leather Jerkin',          'Stout Leather Jerkin',                     'uncommon', 4,  4,    1,    1,  '[{"stat":"max_health","tier":1,"value":6}]'),
  -- ilvl 9, tier I; Rare x1.10: atk 3 -> 3..4, crit 0.13..0.17; agility T2 (3-4), crit_chance T1 (1); req 6 (T2)
  (:'aldric',  'Seax',                    'Blackened Seax of Ashes',                  'rare',     9,  4,    0.17, 6,  '[{"stat":"agility","tier":2,"value":4},{"stat":"crit_chance","tier":1,"value":1}]'),
  -- ilvl 12, tier I; Runed x1.15: def 1 -> 1, mr 3 -> 3..4; intelligence T1 (1-2), max_mana T2 (8-12), magic_resistance T2 (3-4); req 6 (T2)
  (:'aldric',  'Bone Helm',               'Grave-cold Bone Helm of the Last King',    'runed',    12, 1,    4,    6,  '[{"stat":"intelligence","tier":1,"value":2},{"stat":"max_mana","tier":2,"value":10},{"stat":"magic_resistance","tier":2,"value":3}]'),
  -- ilvl 5, consumable; Runed x1.15: heal 25 -> 23..34; consumables take no affixes; req 1
  (:'aldric',  'Greater Heal Potion',     'Greater Heal Potion',                      'runed',    5,  31,   NULL, 1,  '[]'),
  -- ilvl 1, tier I; Normal: def 5 -> 4..6, mr 0 stays 0; req 1
  (:'brenna',  'Plate Helm',              'Plate Helm',                               'normal',   1,  5,    0,    1,  '[]'),
  -- ilvl 10, tier II base (min ilvl 8); Uncommon x1.05: atk 6 -> 5..8, crit 0.04..0.08; strength T1 (1-2); req 6 (base)
  (:'brenna',  'Winged Spear',            'Keen Winged Spear',                        'uncommon', 10, 7,    0.05, 6,  '[{"stat":"strength","tier":1,"value":2}]'),
  -- ilvl 2, consumable; Rare x1.10: heal 10 -> 9..13; req 1
  (:'brenna',  'Lesser Heal Potion',      'Lesser Heal Potion',                       'rare',     2,  12,   NULL, 1,  '[]'),
  -- ilvl 16, tier II base; Runed x1.15: atk 11 -> 10..15, crit 0.00..0.04; strength T3 (5-6), attack_speed T2 (4-5), flat_damage T1 (1), crit_chance T3 (3); req 13 (T3)
  (:'brenna',  'Morning Star',            'Weeping Morning Star of Barrowspire',      'runed',    16, 14,   0.03, 13, '[{"stat":"strength","tier":3,"value":6},{"stat":"attack_speed","tier":2,"value":5},{"stat":"flat_damage","tier":1,"value":1},{"stat":"crit_chance","tier":3,"value":3}]'),
  -- ilvl 11 >= min ilvl 8, unique; base at x1.15: def 10 -> 9..14, mr 1 -> 1; fixed T0 max_health 10-16, strength 2-3; req 7 (template)
  (:'brenna',  'Gravewarden''s Oath',     'Gravewarden''s Oath',                      'fabled',   11, 12,   1,    7,  '[{"stat":"max_health","tier":0,"value":14},{"stat":"strength","tier":0,"value":3}]'),
  -- ilvl 1, consumable; Normal: heal 10 -> 8..12; req 1
  (:'corwin',  'Lesser Heal Potion',      'Lesser Heal Potion',                       'normal',   1,  11,   NULL, 1,  '[]'),
  -- ilvl 3, ring tier I (a ring is never Normal); Uncommon: move_speed T1 (2-3); req 1
  (:'corwin',  'Iron Band',               'Riveted Iron Band',                        'uncommon', 3,  NULL, NULL, 1,  '[{"stat":"move_speed","tier":1,"value":3}]'),
  -- ilvl 9, tier II base; Rare x1.10: def 5 -> 4..7, mr 1 -> 1; move_speed T1 (2-3), defense T2 (3-4); req 6
  (:'corwin',  'Chainmail Leggings',      'Weathered Chainmail Leggings of the Fen',  'rare',     9,  6,    1,    6,  '[{"stat":"move_speed","tier":1,"value":2},{"stat":"defense","tier":2,"value":3}]'),
  -- ilvl 17, tier III base (min ilvl 15); Runed x1.15: atk 11 -> 10..15, crit 0.03..0.07; agility T1 (1-2), attack_speed T3 (6-7), flat_damage T2 (2); req 13
  (:'corwin',  'Dane Axe',                'Notched Dane Axe of the First Dark',       'runed',    17, 13,   0.06, 13, '[{"stat":"agility","tier":1,"value":1},{"stat":"attack_speed","tier":3,"value":7},{"stat":"flat_damage","tier":2,"value":2}]'),
  -- ilvl 13 >= min ilvl 10, unique ring (no base stats); fixed T0 intelligence 2-4, max_mana 10-16, magic_resistance 2-3; req 9 (template)
  (:'corwin',  'Lantern of the Drowned',  'Lantern of the Drowned',                   'fabled',   13, NULL, NULL, 9,  '[{"stat":"intelligence","tier":0,"value":3},{"stat":"max_mana","tier":0,"value":12},{"stat":"magic_resistance","tier":0,"value":2}]'),
  -- ilvl 2, tier I; Normal: atk 4 -> 3..5, crit 0.08..0.12; req 1
  (:'dunstan', 'Iron Cestus',             'Iron Cestus',                              'normal',   2,  4,    0.11, 1,  '[]'),
  -- ilvl 15, tier III base (min ilvl 15); Uncommon x1.05: def 2 -> 2..3, mr 2 -> 2..3; attack_speed T2 (4-5); req 13 (base)
  (:'dunstan', 'Studded Leather Gloves',  'Ashen Studded Leather Gloves',             'uncommon', 15, 2,    2,    13, '[{"stat":"attack_speed","tier":2,"value":4}]'),
  -- ilvl 5, tier I; Rare x1.10: atk 7 -> 6..9, crit 0.03..0.07; strength T1 (1-2), crit_chance T1 (1); req 1
  (:'dunstan', 'Bearded Axe',             'Grim Bearded Axe of the Wight',            'rare',     5,  8,    0.04, 1,  '[{"stat":"strength","tier":1,"value":1},{"stat":"crit_chance","tier":1,"value":1}]'),
  -- ilvl 15, ring tier II base (min ilvl 8); Runed: defense T3 (5-6), max_health T1 (4-7), agility T2 (3-4), intelligence T3 (5-6); req 13 (T3)
  (:'dunstan', 'Silver Band',             'Tarnished Silver Band of the Hollow Oath', 'runed',    15, NULL, NULL, 13, '[{"stat":"defense","tier":3,"value":5},{"stat":"max_health","tier":1,"value":6},{"stat":"agility","tier":2,"value":3},{"stat":"intelligence","tier":3,"value":6}]'),
  -- ilvl 6, consumable; Uncommon x1.05: heal 25 -> 21..31; req 1
  (:'dunstan', 'Greater Heal Potion',     'Greater Heal Potion',                      'uncommon', 6,  27,   NULL, 1,  '[]')
) AS v(owner, base, name, rarity, ilvl, a, b, req, affixes)
JOIN item_templates t ON t.item_name = v.base
JOIN item_rarities ir ON ir.rarity_code = v.rarity
LEFT JOIN weapons w ON t.item_type = 'weapon' AND w.id = t.item_id
LEFT JOIN armors a ON t.item_type = 'armor' AND a.id = t.item_id
LEFT JOIN consumables c ON t.item_type = 'consumable' AND c.id = t.item_id
LEFT JOIN rings r ON t.item_type = 'ring' AND r.id = t.item_id;
SQL
  n=$(sql "$ITEMS_DSN" -c "SELECT count(*) FROM item_instances WHERE owner_member_id IN ($owners)")
  [ "$n" = 20 ] || die "expected 20 instances, inserted $n (a base item or rarity code did not match?)"
  echo "inserted 20 instances"
fi

# Summary
printf '\n%-26s %-36s %s\n' EMAIL MEMBER_ID INSTANCES
for u in admin $PLAYERS; do
  v=ID_$u; id=${!v}
  printf '%-26s %-36s %s\n' "$u@barrowspire.dev" "$id" \
    "$(sql "$ITEMS_DSN" -c "SELECT count(*) FROM item_instances WHERE owner_member_id='$id'")"
done
