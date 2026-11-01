-- accept: the invite's reservation becomes a membership, and the accepter's other open invites
-- are voided (FS-NCC9J R3, R14). The reservation guarantees the place, so no count is checked.
--
-- KEYS[1] the invite's record, KEYS[2] the accepter's pointer
-- ARGV: invite id, accepter id, accepter name, accepter class, now, party TTL

local iid, accepter, name, class = ARGV[1], ARGV[2], ARGV[3], ARGV[4]
local now, party_ttl = ARGV[5], ARGV[6]

local inv = redis.call('HMGET', invite_key(iid), 'party_id', 'target_id', 'expires_at')
-- an invite answers only to its own target
if not inv[1] or inv[2] ~= accepter then return refuse('no_invite') end
local pid = inv[1]
if tonumber(now) >= tonumber(inv[3]) then
	spend_invite(iid)
	return refuse('expired')
end
if redis.call('EXISTS', party_key(pid)) == 0 then
	spend_invite(iid)
	return refuse('party_gone')
end
-- the invite stays open: they may accept once they can
if party_of(accepter) then return refuse('already_in_party') end

spend_invite(iid)
local voided = {}
for _, other in ipairs(redis.call('ZRANGE', player_invites_key(accepter), 0, -1)) do
	local o = redis.call('HMGET', invite_key(other), 'party_id', 'target_name', 'expires_at')
	local leader = o[1] and redis.call('HGET', party_key(o[1]), 'leader')
	local live = leader and tonumber(now) < tonumber(o[3])
	spend_invite(other)
	if live then
		bump(o[1])
		voided[#voided + 1] = {invite_id = other, party_id = o[1], leader_id = leader, target_name = o[2], party = snapshot(o[1])}
	end
end
redis.call('DEL', player_invites_key(accepter))

local members = members_of(pid)
members[#members + 1] = {player_id = accepter, name = name, class = class, joined_at = now}
redis.call('HSET', party_key(pid), 'members', cjson.encode(members))
redis.call('SET', pointer_key(accepter), pid)
bump(pid)
keep_alive(pid, party_ttl)

local out = {code = 'ok', party = snapshot(pid)}
if #voided > 0 then out.voided = voided end
return reply(out)
