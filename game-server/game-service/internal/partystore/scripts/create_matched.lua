-- create_matched: the host pod of a random match makes one party of every matched player, all
-- members at once, carrying the matched origin (FS-988SM R1, R3, R4, R8, R10; ADR-0039). The first
-- given leads, and the rest join in the order given, up to the size. All or nothing: if any matched
-- player already has a party, nothing is written, and the reply names every such player, so the
-- match is cancelled. Nobody is ever moved out of another party.
--
-- KEYS: each matched player's pointer, in the order given
-- ARGV: new party id, now, party TTL, size, then id, name, class for each matched player

local pid, now, party_ttl, size = ARGV[1], ARGV[2], ARGV[3], tonumber(ARGV[4])

local in_party = {}
for i = 5, #ARGV, 3 do
	if party_of(ARGV[i]) then in_party[#in_party + 1] = ARGV[i] end
end
if #in_party > 0 then return reply({code = 'already_in_party', in_party = in_party}) end

local members, no_room = {}, {}
for i = 5, #ARGV, 3 do
	if #members >= size then
		no_room[#no_room + 1] = ARGV[i]
	else
		members[#members + 1] = {player_id = ARGV[i], name = ARGV[i + 1], class = ARGV[i + 2], joined_at = now}
	end
end

redis.call('HSET', party_key(pid), 'leader', members[1].player_id, 'created_at', now,
	'members', cjson.encode(members), 'version', 1, 'origin', 'matched')
for _, m in ipairs(members) do
	redis.call('SET', pointer_key(m.player_id), pid)
	seen(pid, m.player_id, now)
end
keep_alive(pid, party_ttl)

local out = {code = 'ok', party = snapshot(pid)}
if #no_room > 0 then out.no_room = no_room end
return reply(out)
