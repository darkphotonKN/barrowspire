-- remove: a member leaves, or the leader kicks them; a leader who goes is succeeded by the
-- earliest-joined member who remains, and the last member's going ends the party (FS-NCC9J R16;
-- FS-R82NV R19, R20, R22). An ended party's open invites keep their records until their TTL, so an
-- accept of one hears party_gone.
--
-- KEYS[1] the party's key, KEYS[2] the removed member's pointer
-- ARGV: party id, the removed member's id, the kicker's id ("" for a leave), party TTL

local pid, removed, kicker, party_ttl = ARGV[1], ARGV[2], ARGV[3], ARGV[4]

if redis.call('EXISTS', party_key(pid)) == 0 then return refuse('not_member') end
local leader = redis.call('HGET', party_key(pid), 'leader')
if kicker ~= '' and kicker ~= leader then return refuse('not_leader') end

local members, kept = members_of(pid), {}
local found = false
for _, m in ipairs(members) do
	if m.player_id == removed then found = true else kept[#kept + 1] = m end
end
if not found then return refuse('not_member') end

redis.call('DEL', pointer_key(removed))
if #kept == 0 then
	end_party(pid)
	return reply({code = 'ok', ended = true})
end

local succeeded = leader == removed
if succeeded then
	-- members are in join order: the first who remains joined earliest
	redis.call('HSET', party_key(pid), 'leader', kept[1].player_id)
end
redis.call('HSET', party_key(pid), 'members', cjson.encode(kept))
redis.call('HDEL', seen_key(pid), removed)
bump(pid)
keep_alive(pid, party_ttl)

return reply({code = 'ok', succeeded = succeeded, party = snapshot(pid)})
