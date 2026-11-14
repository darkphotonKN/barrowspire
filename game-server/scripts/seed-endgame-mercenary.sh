#!/usr/bin/env bash
# Endgame test character: a level-20 Mercenary, "Ravek", for dunstan@barrowspire.dev,
# worn in a full set of Runed gear at item level 20 (no Fabled, so no uniques).
# For trying the deep-endgame Spire (FS-C8VM7, FS-3103M) and the dev endgame run
# (FS-BDRTJ, Change: Endgame test run). Needs a running local stack's databases and
# dunstan's member row (scripts/seed-dev.sh makes it).
# Re-runs skip what already exists; it never duplicates data.
#
# Values are ones the loot roll could have produced at ilvl 20, at the top of each range
# (game-service/internal/game/loot_tuning.go): Runed x1.15, ints = round(base * 1.2 * 1.15),
# crit = base + 0.02, four affixes at tier III (attribute 5-6, pool 13-18, percent 6-7,
# step 3), so required level 13 (tier III).
set -euo pipefail

AUTH_DSN=${AUTH_DSN:-postgres://auth_service:auth_service@localhost:5432/barrowspire_auth_service_db?sslmode=disable}
ITEMS_DSN=${ITEMS_DSN:-postgres://items_service:items_service@localhost:5432/barrowspire_items_service_db?sslmode=disable}
CHAR_DSN=${CHAR_DSN:-postgres://character_service:character_service@localhost:5432/barrowspire_character_service_db?sslmode=disable}
OWNER=${OWNER:-dunstan@barrowspire.dev}
NAME=${NAME:-Ravek}
LEVEL=20
EXP=38530 # total XP to reach 20 (FS-BDA7X R14)

die() { echo "seed-endgame-mercenary: $*" >&2; exit 1; }
sql() { psql "$1" -v ON_ERROR_STOP=1 -qAt "${@:2}"; }

mid=$(sql "$AUTH_DSN" -c "SELECT id FROM members WHERE email='$OWNER'")
[ -n "$mid" ] || die "no member $OWNER (run scripts/seed-dev.sh first)"

# 1. The character, at level 20. Kept at 20 if it already exists.
cid=$(sql "$CHAR_DSN" -v mid="$mid" -v name="$NAME" -v level="$LEVEL" -v exp="$EXP" <<'SQL'
WITH found AS (
  UPDATE characters SET level = :'level'::int, exp = GREATEST(exp, :'exp'::bigint), updated_at = NOW()
   WHERE lower(name) = lower(:'name') AND deleted_at IS NULL AND player_id = :'mid'::uuid
  RETURNING id
), added AS (
  INSERT INTO characters (player_id, class_id, name, level, exp)
  SELECT :'mid'::uuid, 'mercenary', :'name', :'level'::int, :'exp'::bigint
   WHERE NOT EXISTS (SELECT 1 FROM characters WHERE lower(name) = lower(:'name') AND deleted_at IS NULL)
  RETURNING id
)
SELECT id FROM found UNION ALL SELECT id FROM added;
SQL
)
[ -n "$cid" ] || die "a character named $NAME exists on another account"
echo "character $NAME (mercenary, level $LEVEL): $cid"

# 2. The gear, in the character's bag, then worn. Skipped if the character holds any.
n=$(sql "$ITEMS_DSN" -c "SELECT count(*) FROM item_instances WHERE character_id = '$cid'")
if [ "$n" != 0 ]; then echo "$NAME already holds $n instances, skipping gear"; else
  sql "$ITEMS_DSN" -v mid="$mid" -v cid="$cid" <<'SQL'
-- (slot key, base template, rolled name, ilvl, weapon attack | armor defense | healing,
--  crit | magic res, required level, affixes)
INSERT INTO item_instances (template_id, owner_member_id, character_id, location, source, status, item_type, name,
  rarity_id, description, attack_power, critical_rate, weapon_type, defense_rating, magic_resistance, armor_slot,
  healing_amount, mana_amount, buff_duration, item_level, affixes, required_level)
SELECT t.id, :'mid'::uuid, :'cid'::uuid, 'BAG', 'reward', 'AVAILABLE', t.item_type, v.name, ir.id,
  COALESCE(w.description, a.description, c.description, r.description),
  CASE WHEN w.id IS NOT NULL THEN v.a END, CASE WHEN w.id IS NOT NULL THEN v.b END, w.weapon_type,
  CASE WHEN a.id IS NOT NULL THEN v.a END, CASE WHEN a.id IS NOT NULL THEN v.b::int END, a.armor_slot,
  CASE WHEN c.id IS NOT NULL THEN v.a END, c.mana_amount, c.buff_duration,
  20, v.affixes::jsonb, v.req
FROM (VALUES
  -- atk 9 -> 12, crit 0.08 -> 0.10
  ('Blackiron Sword',       'Weeping Blackiron Sword of the Last Watch',  12, 0.10::numeric, 13, '[{"stat":"strength","tier":3,"value":6},{"stat":"agility","tier":3,"value":6},{"stat":"attack_speed","tier":3,"value":7},{"stat":"flat_damage","tier":3,"value":3}]'),
  -- def 13 -> 18, mr 1
  ('Blackiron Breastplate', 'Grave-cold Blackiron Breastplate of Ashes',  18, 1,    13, '[{"stat":"max_health","tier":3,"value":18},{"stat":"defense","tier":3,"value":6},{"stat":"strength","tier":3,"value":6},{"stat":"magic_resistance","tier":3,"value":6}]'),
  -- def 8 -> 11, mr 0
  ('Blackiron Helm',        'Notched Blackiron Helm of the Fen',          11, 0,    13, '[{"stat":"max_health","tier":3,"value":18},{"stat":"crit_chance","tier":3,"value":3},{"stat":"agility","tier":3,"value":6},{"stat":"defense","tier":3,"value":6}]'),
  -- def 5 -> 7, mr 0
  ('Blackiron Gauntlets',   'Ashen Blackiron Gauntlets of the Wight',     7,  0,    13, '[{"stat":"attack_speed","tier":3,"value":7},{"stat":"flat_damage","tier":3,"value":3},{"stat":"crit_chance","tier":3,"value":3},{"stat":"strength","tier":3,"value":6}]'),
  -- def 9 -> 12, mr 0
  ('Blackiron Greaves',     'Weathered Blackiron Greaves of the First Dark', 12, 0, 13, '[{"stat":"move_speed","tier":3,"value":7},{"stat":"max_health","tier":3,"value":18},{"stat":"defense","tier":3,"value":6},{"stat":"agility","tier":3,"value":6}]'),
  -- rings carry no base stats
  ('Barrow-gold Band',      'Tarnished Barrow-gold Band of the Hollow Oath', NULL, NULL, 13, '[{"stat":"strength","tier":3,"value":6},{"stat":"agility","tier":3,"value":6},{"stat":"attack_speed","tier":3,"value":7},{"stat":"max_health","tier":3,"value":18}]'),
  ('Barrow-gold Band',      'Riveted Barrow-gold Band of Barrowspire',    NULL, NULL, 13, '[{"stat":"crit_chance","tier":3,"value":3},{"stat":"flat_damage","tier":3,"value":3},{"stat":"move_speed","tier":3,"value":7},{"stat":"defense","tier":3,"value":6}]'),
  -- heal 25 -> 34; consumables take no affixes
  ('Greater Heal Potion',   'Greater Heal Potion',                        34, NULL, 1,  '[]'),
  ('Greater Heal Potion',   'Greater Heal Potion',                        34, NULL, 1,  '[]'),
  ('Greater Heal Potion',   'Greater Heal Potion',                        34, NULL, 1,  '[]')
) AS v(base, name, a, b, req, affixes)
JOIN item_templates t ON t.item_name = v.base
JOIN item_rarities ir ON ir.rarity_code = 'runed'
LEFT JOIN weapons w ON t.item_type = 'weapon' AND w.id = t.item_id
LEFT JOIN armors a ON t.item_type = 'armor' AND a.id = t.item_id
LEFT JOIN consumables c ON t.item_type = 'consumable' AND c.id = t.item_id
LEFT JOIN rings r ON t.item_type = 'ring' AND r.id = t.item_id;
SQL
  n=$(sql "$ITEMS_DSN" -c "SELECT count(*) FROM item_instances WHERE character_id = '$cid'")
  [ "$n" = 10 ] || die "expected 10 instances, inserted $n (a base item did not match?)"
  echo "inserted 10 Runed instances"
fi

# 3. Wear them: one loadout row per character, every slot filled.
sql "$ITEMS_DSN" -v mid="$mid" -v cid="$cid" <<'SQL'
WITH g AS (
  SELECT id, item_type, armor_slot, row_number() OVER (PARTITION BY item_type, armor_slot ORDER BY name, id) AS k
    FROM item_instances WHERE character_id = :'cid'::uuid
), pick AS (
  SELECT
    max(id::text) FILTER (WHERE item_type = 'weapon')::uuid AS weapon,
    max(id::text) FILTER (WHERE armor_slot = 'chest')::uuid AS chest,
    max(id::text) FILTER (WHERE armor_slot = 'head')::uuid AS head,
    max(id::text) FILTER (WHERE armor_slot = 'gloves')::uuid AS gloves,
    max(id::text) FILTER (WHERE armor_slot = 'legs')::uuid AS legs,
    max(id::text) FILTER (WHERE item_type = 'ring' AND k = 1)::uuid AS ring1,
    max(id::text) FILTER (WHERE item_type = 'ring' AND k = 2)::uuid AS ring2,
    max(id::text) FILTER (WHERE item_type = 'consumable' AND k = 1)::uuid AS c1,
    max(id::text) FILTER (WHERE item_type = 'consumable' AND k = 2)::uuid AS c2,
    max(id::text) FILTER (WHERE item_type = 'consumable' AND k = 3)::uuid AS c3
  FROM g
)
INSERT INTO player_loadouts (member_id, character_id, weapon_instance_id, chest_instance_id, head_instance_id,
  gloves_instance_id, legs_instance_id, ring_1_instance_id, ring_2_instance_id, consumable_1_id, consumable_2_id, consumable_3_id)
SELECT :'mid'::uuid, :'cid'::uuid, weapon, chest, head, gloves, legs, ring1, ring2, c1, c2, c3 FROM pick
ON CONFLICT (character_id) DO UPDATE SET
  weapon_instance_id = EXCLUDED.weapon_instance_id, chest_instance_id = EXCLUDED.chest_instance_id,
  head_instance_id = EXCLUDED.head_instance_id, gloves_instance_id = EXCLUDED.gloves_instance_id,
  legs_instance_id = EXCLUDED.legs_instance_id, ring_1_instance_id = EXCLUDED.ring_1_instance_id,
  ring_2_instance_id = EXCLUDED.ring_2_instance_id, consumable_1_id = EXCLUDED.consumable_1_id,
  consumable_2_id = EXCLUDED.consumable_2_id, consumable_3_id = EXCLUDED.consumable_3_id,
  updated_at = NOW();
SQL
echo "$NAME wears all ten"
