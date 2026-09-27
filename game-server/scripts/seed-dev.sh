#!/usr/bin/env bash
# Dev seed (FS-F8T3H R16-R19). Meant for a FRESH DB: items migrated to 000020
# (five fantasy rarities, empty catalogue) and a running local stack.
# Creates 1 admin + 4 players (password $SEED_PASSWORD), the 24 base items via
# the real complete-* endpoints, 10,000 gold per player, and 20 owned instances.
# Re-runs skip what already exists; it never duplicates data.
#
# The instance names/stats below are hand-authored but follow the loot roll
# rules exactly (FS-F8T3H R9/R10; the word lists live in the game-service roll
# file): ints = round(base * 0.8..1.2 * tier), crit = base +-0.02 + 0.01*(tier-1).
set -euo pipefail

API=${API_URL:-http://localhost:7114/api}
AUTH_DSN=${AUTH_DSN:-postgres://user:password@localhost:5216/barrowspire_auth_service_db?sslmode=disable}
ITEMS_DSN=${ITEMS_DSN:-postgres://user:password@localhost:5217/barrowspire_items_service_db?sslmode=disable}
PASS=${SEED_PASSWORD:-barrowspire-dev}
NORMAL=f8700000-0000-0000-0000-000000000001
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

# 3. Base items, all at `normal`. item_code/type_id/durability/prices are
# required by the complete-* bodies and then discarded: dummy values.
n=$(sql "$ITEMS_DSN" -c "SELECT count(*) FROM item_templates")
if [ "$n" = 24 ]; then echo "24 base items present, skipping"
elif [ "$n" != 0 ]; then die "item_templates has $n rows (want 0 or 24): migrate a fresh DB"
else
  # weapon|name|weapon_type|attack|crit|desc  armor|name|slot|defense|magic_res|desc  consumable|name|healing|stack||desc
  while IFS='|' read -r kind name x y z desc; do
    slug=$(tr 'A-Z ' 'a-z_' <<<"$name")
    req POST "/items/complete-$kind" "$(jq -nc --arg k "$kind" --arg n "$name" --arg s "$slug" \
      --arg x "$x" --arg y "$y" --arg z "$z" --arg d "$desc" --arg r "$NORMAL" '
      {item_name:$n, item_code:$s, type_id:"legacy", rarity_id:$r, required_level:1,
       icon_url:"/icons/\($k)/\($s).png", description:$d, base_sell_price:0, base_buy_price:0}
      + if $k=="weapon" then {weapon_type:$x, attack_power:($y|tonumber), critical_rate:($z|tonumber), durability:1}
        elif $k=="armor" then {armor_slot:$x, defense_rating:($y|tonumber), magic_resistance:($z|tonumber), durability:1}
        else {healing_amount:($x|tonumber), max_stack_size:($y|tonumber)} end')"
    [ "$CODE" = 201 ] || die "create $name: $CODE $BODY"
  done <<'EOF'
weapon|Longsword|sword|6|0.08|A plain soldier's blade, nicked from old wars.
weapon|Seax|knife|3|0.15|A long single-edged knife, the kind men are buried with.
weapon|Flanged Mace|mace|9|0.02|An iron head of hammered flanges, made for breaking helms.
weapon|Boar Spear|spear|5|0.06|An ash haft with lugs below the blade, to hold back what charges.
weapon|Bearded Axe|axe|7|0.05|A hooked axe that drags shields down as readily as it splits them.
weapon|Iron Cestus|fist|4|0.10|Iron-studded hand wrappings, stiff with old blood.
armor|Leather Cap|head|2|1|A boiled-leather cap, cracked along the seams.
armor|Leather Jerkin|chest|4|1|A jerkin of layered hide, sweat-dark at the collar.
armor|Leather Leggings|legs|3|1|Hide leggings laced with gut, patched at both knees.
armor|Leather Gloves|gloves|1|1|Worn riding gloves, scarred across the back.
armor|Bone Helm|head|1|3|A helm pieced from old bone, scratched with warding marks.
armor|Bone Armor|chest|3|5|Ribs and shoulder blades bound on cord. The dead are said to look away.
armor|Bone Leggings|legs|2|4|Shin guards of carved bone, cold even in summer.
armor|Bone Gloves|gloves|1|2|Knuckle bones stitched to leather. They rattle faintly in the dark.
armor|Ringmail Coif|head|3|1|A hood of riveted rings, heavy on the neck.
armor|Ringmail Tunic|chest|6|2|A knee-length shirt of rings, rust at every link.
armor|Ringmail Leggings|legs|4|1|Ringmail chausses that clink with every step.
armor|Ringmail Gauntlets|gloves|2|1|Mail mittens over padded gloves, stiff to close.
armor|Plate Helm|head|5|0|A dented iron helm with a narrow eye-slit.
armor|Plate Breastplate|chest|8|1|A heavy breastplate, the smith's mark long since worn away.
armor|Plate Greaves|legs|6|0|Iron greaves strapped over the shins, loud on stone.
armor|Plate Gauntlets|gloves|3|0|Jointed iron gauntlets. The fingers bend, but grudgingly.
consumable|Lesser Heal Potion|10|20||A small vial of bitter herbs steeped in wine.
consumable|Greater Heal Potion|25|10||A stoppered flask of dark tincture that burns going down.
EOF
  echo "created 24 base items"
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

# 5. Instances: 5 per player, every tier 4x, all item types. Skipped if any exist.
owners="'$ID_aldric','$ID_brenna','$ID_corwin','$ID_dunstan'"
n=$(sql "$ITEMS_DSN" -c "SELECT count(*) FROM item_instances WHERE owner_member_id IN ($owners)")
if [ "$n" != 0 ]; then echo "players already own $n instances, skipping"
else
  sql "$ITEMS_DSN" -v aldric="$ID_aldric" -v brenna="$ID_brenna" -v corwin="$ID_corwin" -v dunstan="$ID_dunstan" <<'SQL'
-- (owner, base item, rolled name, tier sort_order, weapon attack | armor defense | healing, crit | magic res)
INSERT INTO item_instances (template_id, owner_member_id, source, status, item_type, name, rarity_id, description,
  attack_power, critical_rate, weapon_type, defense_rating, magic_resistance, armor_slot, healing_amount, mana_amount, buff_duration)
SELECT t.id, v.owner::uuid, 'reward', 'AVAILABLE', t.item_type, v.name,
  ('f8700000-0000-0000-0000-00000000000' || v.tier)::uuid, COALESCE(w.description, a.description, c.description),
  CASE WHEN w.id IS NOT NULL THEN v.a END, CASE WHEN w.id IS NOT NULL THEN v.b END, w.weapon_type,
  CASE WHEN a.id IS NOT NULL THEN v.a END, CASE WHEN a.id IS NOT NULL THEN v.b::int END, a.armor_slot,
  CASE WHEN c.id IS NOT NULL THEN v.a END, c.mana_amount, c.buff_duration
FROM (VALUES
  (:'aldric',  'Longsword',           'Longsword',                                    1, 6,  0.09::numeric),
  (:'aldric',  'Leather Jerkin',      'Stout Leather Jerkin',                         2, 5,  1),
  (:'aldric',  'Seax',                'Blackened Seax of Ashes',                      3, 4,  0.18),
  (:'aldric',  'Bone Helm',           'Grave-cold Bone Helm of the Last King',        4, 2,  5),
  (:'aldric',  'Greater Heal Potion', 'Greater Heal Potion',                          5, 48, NULL),
  (:'brenna',  'Plate Helm',          'Plate Helm',                                   1, 5,  0),
  (:'brenna',  'Boar Spear',          'Keen Boar Spear',                              2, 6,  0.08),
  (:'brenna',  'Lesser Heal Potion',  'Lesser Heal Potion',                           3, 14, NULL),
  (:'brenna',  'Flanged Mace',        'Weeping Flanged Mace of Barrowspire',          4, 15, 0.05),
  (:'brenna',  'Ringmail Tunic',      'Ashen Ringmail Tunic of the Drowned Crown',    5, 12, 4),
  (:'corwin',  'Lesser Heal Potion',  'Lesser Heal Potion',                           1, 11, NULL),
  (:'corwin',  'Ringmail Coif',       'Riveted Ringmail Coif',                        2, 4,  1),
  (:'corwin',  'Leather Leggings',    'Weathered Leather Leggings of the Fen',        3, 4,  2),
  (:'corwin',  'Bearded Axe',         'Notched Bearded Axe of the First Dark',        4, 11, 0.09),
  (:'corwin',  'Longsword',           'Barrow-touched Longsword of Old Blood',        5, 13, 0.13),
  (:'dunstan', 'Iron Cestus',         'Iron Cestus',                                  1, 4,  0.11),
  (:'dunstan', 'Greater Heal Potion', 'Greater Heal Potion',                          2, 29, NULL),
  (:'dunstan', 'Bearded Axe',         'Grim Bearded Axe of the Wight',                3, 9,  0.07),
  (:'dunstan', 'Plate Gauntlets',     'Tarnished Plate Gauntlets of the Hollow Oath', 4, 5,  0),
  (:'dunstan', 'Bone Armor',          'Grave-cold Bone Armor of Old Blood',           5, 6,  10)
) AS v(owner, base, name, tier, a, b)
JOIN item_templates t ON t.item_name = v.base
LEFT JOIN weapons w ON t.item_type = 'weapon' AND w.id = t.item_id
LEFT JOIN armors a ON t.item_type = 'armor' AND a.id = t.item_id
LEFT JOIN consumables c ON t.item_type = 'consumable' AND c.id = t.item_id;
SQL
  n=$(sql "$ITEMS_DSN" -c "SELECT count(*) FROM item_instances WHERE owner_member_id IN ($owners)")
  [ "$n" = 20 ] || die "expected 20 instances, inserted $n (a base item name did not match?)"
  echo "inserted 20 instances"
fi

# Summary
printf '\n%-26s %-36s %s\n' EMAIL MEMBER_ID INSTANCES
for u in admin $PLAYERS; do
  v=ID_$u; id=${!v}
  printf '%-26s %-36s %s\n' "$u@barrowspire.dev" "$id" \
    "$(sql "$ITEMS_DSN" -c "SELECT count(*) FROM item_instances WHERE owner_member_id='$id'")"
done
