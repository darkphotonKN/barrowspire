#!/usr/bin/env bash
# Seeds the marketplace with 120 live auctions for k6 (3 pages at the default
# limit of 50). Six dedicated seller accounts, 20 listings each (the per-seller
# cap). Prices start around 1,000,000 gold so no real player can win one.
#
# Accounts and listings go through the real API, so reservation, outbox and the
# settlement workflow all run. Only two things are SQL: marking the seed
# sellers' emails verified (listing needs the claim) and putting items in their
# stash (there is no grant endpoint), the same way seed-dev.sh does.
#
# Rarity mix: 1 fabled (Wightfang), 1 rare, 13 runed, the rest uncommon/normal.
#
# Auctions end 6-7 days out (the max is 7), then expire with no bids and the
# items go back to the stash. Re-run to relist: accounts and items are reused,
# only items not already listed are listed.
#
# Needs AUTH_DSN and ITEMS_DSN. Against prod, port-forward pg-relay first:
#   kubectl --context gke_barrowspire-512613_asia-east1_barrowspire-dev -n barrowspire \
#     port-forward pod/pg-relay 15432:5432
set -euo pipefail

API=${API_URL:-https://api.barrowspire.app/api}
: "${AUTH_DSN:?set AUTH_DSN}" "${ITEMS_DSN:?set ITEMS_DSN}" "${SEED_PASSWORD:?set SEED_PASSWORD}"
SELLERS="hrolf sigrun eadric wynn osric maelis"
PER_SELLER=20
TOKEN=

die() { echo "seed-listings: $*" >&2; exit 1; }
sql() { psql "$1" -v ON_ERROR_STOP=1 -qAt "${@:2}"; }
req() { # METHOD PATH [JSON] -> sets CODE, BODY
  BODY=$(curl -sS -X "$1" "$API$2" -H 'Content-Type: application/json' \
    ${TOKEN:+-H "Authorization: Bearer $TOKEN"} ${3:+-d "$3"} -w $'\n%{http_code}')
  CODE=${BODY##*$'\n'}; BODY=${BODY%$'\n'*}
}
email() { echo "market-seed-$1@barrowspire.dev"; }

# 1. Accounts, then verified by SQL (the claim is minted at sign-in).
for u in $SELLERS; do
  TOKEN=; req POST /member/signup "$(jq -nc --arg n "$u" --arg e "$(email "$u")" --arg p "$SEED_PASSWORD" \
    '{name:(($n[:1]|ascii_upcase)+$n[1:]), email:$e, password:$p}')"
  case $CODE in 201) echo "signed up $u";; 409) echo "$u exists";; *) die "signup $u: $CODE $BODY";; esac
done
emails=$(for u in $SELLERS; do printf "'%s'," "$(email "$u")"; done); emails=${emails%,}
sql "$AUTH_DSN" -c "UPDATE members SET email_verified_at = NOW() WHERE email IN ($emails) AND email_verified_at IS NULL"
ids=$(sql "$AUTH_DSN" -c "SELECT string_agg(quote_literal(id::text), ',') FROM members WHERE email IN ($emails)")

# 2. Items: 20 stash instances per seller, inserted once. Tier I bases only, so
# every affix is tier 1 and required level stays 1. Global slot g = 1..120
# picks rarity: 60 fabled, 33 rare, every 9th runed, even uncommon, odd normal.
n=$(sql "$ITEMS_DSN" -c "SELECT count(*) FROM item_instances WHERE owner_member_id IN ($ids)")
if [ "$n" != 0 ]; then echo "sellers already own $n instances, reusing them"
else
  seller_rows=$(i=0; for u in $SELLERS; do i=$((i+1)); printf "(%d,'%s')," "$i" "$(email "$u")"; done)
  # member ids live in auth's DB; pass them in as a VALUES list
  idmap=$(sql "$AUTH_DSN" -c "SELECT string_agg(format('(%s,%L::uuid)', s.n, m.id), ',')
    FROM (VALUES ${seller_rows%,}) s(n, email) JOIN members m ON m.email = s.email")
  sql "$ITEMS_DSN" <<SQL
WITH sellers(n, owner) AS (VALUES $idmap),
bases AS (
  SELECT t.id, t.item_id, t.item_name, t.item_type, row_number() OVER (ORDER BY t.item_name) - 1 AS k, count(*) OVER () AS total
  FROM item_templates t JOIN item_rarities ir ON ir.id = t.rarity_id
  WHERE ir.rarity_code = 'normal' AND t.required_level = 1 AND t.item_type IN ('weapon', 'armor')
),
slots AS (
  SELECT s.owner, (s.n - 1) * $PER_SELLER + k AS g
  FROM sellers s, generate_series(1, $PER_SELLER) k
),
picked AS (
  SELECT sl.owner, sl.g, b.*,
    CASE WHEN sl.g = 60 THEN 'fabled' WHEN sl.g = 33 THEN 'rare' WHEN sl.g % 9 = 0 THEN 'runed'
         WHEN sl.g % 2 = 0 THEN 'uncommon' ELSE 'normal' END AS rarity
  FROM slots sl JOIN bases b ON b.k = (sl.g * 7) % b.total
),
rolled AS (
  SELECT p.*,
    CASE p.rarity WHEN 'normal' THEN 1.00 WHEN 'uncommon' THEN 1.05 WHEN 'rare' THEN 1.10 ELSE 1.15 END AS mult,
    CASE p.rarity
      WHEN 'normal' THEN '[]'
      WHEN 'uncommon' THEN (ARRAY['[{"stat":"max_health","tier":1,"value":5}]','[{"stat":"strength","tier":1,"value":2}]','[{"stat":"move_speed","tier":1,"value":3}]'])[p.g % 3 + 1]
      WHEN 'rare' THEN '[{"stat":"agility","tier":1,"value":2},{"stat":"crit_chance","tier":1,"value":1}]'
      ELSE '[{"stat":"intelligence","tier":1,"value":2},{"stat":"max_health","tier":1,"value":6},{"stat":"agility","tier":1,"value":1}]'
    END AS affixes,
    CASE p.rarity
      WHEN 'uncommon' THEN 'Stout ' || p.item_name
      WHEN 'rare' THEN 'Grim ' || p.item_name || ' of the Wight'
      WHEN 'runed' THEN 'Grave-cold ' || p.item_name || ' of the ' || (ARRAY['First Dark','Hollow Oath','Last King','Fen'])[p.g % 4 + 1]
      ELSE p.item_name END AS rolled_name
  FROM picked p WHERE p.rarity <> 'fabled'
)
INSERT INTO item_instances (template_id, owner_member_id, source, status, item_type, name, rarity_id, description,
  attack_power, critical_rate, weapon_type, defense_rating, magic_resistance, armor_slot, item_level, affixes, required_level)
SELECT r.id, r.owner, 'reward', 'AVAILABLE', r.item_type, r.rolled_name, ir.id, COALESCE(w.description, a.description),
  CASE WHEN w.id IS NOT NULL THEN round(w.attack_power * r.mult)::int END, w.critical_rate, w.weapon_type,
  CASE WHEN a.id IS NOT NULL THEN round(a.defense_rating * r.mult)::int END, a.magic_resistance, a.armor_slot,
  1 + r.g % 7, r.affixes::jsonb, 1
FROM rolled r
JOIN item_rarities ir ON ir.rarity_code = r.rarity
LEFT JOIN weapons w ON r.item_type = 'weapon' AND w.id = r.item_id
LEFT JOIN armors a ON r.item_type = 'armor' AND a.id = r.item_id;

-- the one fabled: Wightfang, a unique (ilvl 7 >= min 6, req 5 from its template)
INSERT INTO item_instances (template_id, owner_member_id, source, status, item_type, name, rarity_id, description,
  attack_power, critical_rate, weapon_type, item_level, affixes, required_level)
SELECT t.id, s.owner, 'reward', 'AVAILABLE', 'weapon', t.item_name, t.rarity_id, w.description,
  5, w.critical_rate, w.weapon_type, 7,
  '[{"stat":"agility","tier":0,"value":3},{"stat":"attack_speed","tier":0,"value":5}]'::jsonb, t.required_level
FROM item_templates t JOIN weapons w ON w.id = t.item_id
JOIN (VALUES $idmap) s(n, owner) ON s.n = 3
WHERE t.item_name = 'Wightfang';
SQL
  n=$(sql "$ITEMS_DSN" -c "SELECT count(*) FROM item_instances WHERE owner_member_id IN ($ids)")
  [ "$n" = $((PER_SELLER * 6)) ] || die "expected $((PER_SELLER * 6)) instances, have $n"
  echo "inserted $n instances"
fi

# 3. Listings through the API. Start price by rarity with a spread, buyout on
# every other listing at 3x start. Ends 6-7 days out, staggered.
listed=0
for u in $SELLERS; do
  TOKEN=; req POST /member/signin "$(jq -nc --arg e "$(email "$u")" --arg p "$SEED_PASSWORD" '{email:$e,password:$p}')"
  [ "$CODE" = 200 ] || die "signin $u: $CODE $BODY"
  TOKEN=$(jq -r .result.access_token <<<"$BODY"); mid=$(jq -r .result.member_info.id <<<"$BODY")
  while IFS='|' read -r item rarity g; do
    case $rarity in
      fabled) start=25000000 ;;
      rare)   start=3500000 ;;
      runed)  start=$((2000000 + RANDOM % 4 * 500000)) ;;
      *)      start=$((800000 + RANDOM % 25 * 100000)) ;;   # 800k .. 3.2M
    esac
    ends=$(date -u -v+6d -v+$((g % 23))H +%Y-%m-%dT%H:%M:%SZ)
    body=$(jq -nc --arg i "$item" --argjson s "$start" --arg e "$ends" --argjson b $((g % 2)) \
      '{itemId:$i, startPrice:$s, endsAt:$e} + (if $b == 1 then {buyoutPrice:($s*3)} else {} end)')
    req POST /marketplace/listings "$body"
    [ "$CODE" = 202 ] || die "list $item for $u: $CODE $BODY"
    listed=$((listed + 1))
  done < <(sql "$ITEMS_DSN" -c "SELECT i.id, ir.rarity_code, row_number() OVER (ORDER BY i.created_at, i.id)
    FROM item_instances i JOIN item_rarities ir ON ir.id = i.rarity_id
    WHERE i.owner_member_id = '$mid' AND i.status = 'AVAILABLE' AND i.location = 'STASH'")
  echo "$u: listed"
done
echo "posted $listed listings (202s); they appear once marketplace confirms each reservation"
