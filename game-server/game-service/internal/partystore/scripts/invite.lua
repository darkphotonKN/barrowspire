-- invite: the inviter's party, created here if they have none, reserves a slot for target
-- (FS-NCC9J R3, R10). Every check comes before any write, so a refusal leaves nothing behind.
--
-- KEYS[1] the inviter's pointer, KEYS[2] the target's pointer
-- ARGV: new party id, inviter id, inviter name, inviter class, invite id, target id, target name,
--       size, now, expires at, invite TTL, party TTL

local new_pid, inviter, inviter_name, inviter_class = ARGV[1], ARGV[2], ARGV[3], ARGV[4]
local iid, target, target_name = ARGV[5], ARGV[6], ARGV[7]
local size, now, expires_at = tonumber(ARGV[8]), ARGV[9], ARGV[10]
local invite_ttl, party_ttl = ARGV[11], ARGV[12]

local pid = party_of(inviter)
local count = 1
if pid then
	if redis.call('HGET', party_key(pid), 'leader') ~= inviter then return refuse('not_leader') end
	prune(pid, now)
	count = #members_of(pid) + redis.call('ZCARD', invites_key(pid))
end
if count >= size then return refuse('party_full') end
if party_of(target) then return refuse('already_in_party') end
if pid then
	for _, open in ipairs(open_invites(pid)) do
		if redis.call('HGET', invite_key(open), 'target_id') == target then return refuse('pending') end
	end
end

local formed = false
if not pid then
	pid, formed = new_pid, true
	local leader = {player_id = inviter, name = inviter_name, class = inviter_class, joined_at = now}
	redis.call('HSET', party_key(pid), 'leader', inviter, 'created_at', now, 'members', cjson.encode({leader}), 'version', 1)
	redis.call('SET', pointer_key(inviter), pid)
	seen(pid, inviter, now)
else
	bump(pid)
end

redis.call('HSET', invite_key(iid), 'party_id', pid, 'target_id', target, 'target_name', target_name, 'expires_at', expires_at)
redis.call('PEXPIRE', invite_key(iid), invite_ttl)
redis.call('ZADD', invites_key(pid), expires_at, iid)
redis.call('ZADD', player_invites_key(target), expires_at, iid)
redis.call('PEXPIRE', player_invites_key(target), invite_ttl)
keep_alive(pid, party_ttl)

return reply({code = 'ok', formed = formed, party = snapshot(pid)})
