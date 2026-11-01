-- Shared by every party script; prepended to each one when it is loaded.
--
-- Every key carries the {party} hash tag, so a script that touches a party, its invites and its
-- members' pointers stays in one slot in cluster mode (FS-NCC9J R1, R2; I-NCC9J-1 D3).
-- Times are milliseconds since the epoch, passed in by the caller and kept as strings.

local P = '{party}:'

local function party_key(pid) return P .. 'p:' .. pid end
local function invites_key(pid) return P .. 'p:' .. pid .. ':invites' end
local function invite_key(iid) return P .. 'inv:' .. iid end
local function pointer_key(player) return P .. 'pl:' .. player end
local function player_invites_key(player) return P .. 'pl:' .. player .. ':invites' end
-- each member's record (R17): player id → when the pod holding them last refreshed them
local function seen_key(pid) return P .. 'p:' .. pid .. ':seen' end

local function reply(t) return cjson.encode(t) end
local function refuse(code) return reply({code = code}) end

-- the party a player's pointer names, while that party still exists
local function party_of(player)
	local pid = redis.call('GET', pointer_key(player))
	if not pid then return nil end
	if redis.call('EXISTS', party_key(pid)) == 0 then return nil end
	return pid
end

local function members_of(pid)
	return cjson.decode(redis.call('HGET', party_key(pid), 'members'))
end

-- drops the party's expired invites from the counts; each invite's own record stays until its TTL,
-- so a late accept can still be told it expired (R12). An invite whose record has already lapsed
-- (the caller's clock behind Redis's) goes too.
local function prune(pid, now)
	local gone = redis.call('ZRANGEBYSCORE', invites_key(pid), '-inf', now)
	for _, iid in ipairs(gone) do
		local target = redis.call('HGET', invite_key(iid), 'target_id')
		if target then redis.call('ZREM', player_invites_key(target), iid) end
	end
	if #gone > 0 then redis.call('ZREMRANGEBYSCORE', invites_key(pid), '-inf', now) end
	for _, iid in ipairs(redis.call('ZRANGE', invites_key(pid), 0, -1)) do
		if redis.call('EXISTS', invite_key(iid)) == 0 then redis.call('ZREM', invites_key(pid), iid) end
	end
end

-- the open invites of a party, oldest first, after a prune
local function open_invites(pid)
	return redis.call('ZRANGE', invites_key(pid), 0, -1)
end

-- takes an invite out of its party's count and its target's list, and deletes it
local function spend_invite(iid)
	local inv = redis.call('HMGET', invite_key(iid), 'party_id', 'target_id')
	if inv[1] then redis.call('ZREM', invites_key(inv[1]), iid) end
	if inv[2] then redis.call('ZREM', player_invites_key(inv[2]), iid) end
	redis.call('DEL', invite_key(iid))
end

-- moves the party's version on: every change a script writes calls it once, so a pod can tell an
-- older party from a newer one whatever order its letters arrive in (I-NCC9J-3 review)
local function bump(pid)
	redis.call('HINCRBY', party_key(pid), 'version', 1)
end

-- deletes every key the party holds of its own, as it ends; open invites keep their records until
-- their TTL, so an accept of one hears party_gone
local function end_party(pid)
	redis.call('DEL', party_key(pid), invites_key(pid), seen_key(pid))
end

-- records that a member was seen at now: they joined, or the pod holding them refreshed them (R17).
-- A record never moves backwards: a refresh from a pod whose call landed late, the member having
-- moved on to another pod since, leaves the newer time standing.
local function seen(pid, player, now)
	local last = redis.call('HGET', seen_key(pid), player)
	if last and tonumber(last) >= tonumber(now) then return end
	redis.call('HSET', seen_key(pid), player, now)
end

-- keeps each member's record (R17). A member seated on the calling pod (a set of player ids) is
-- refreshed, and is no longer away; any other member is away once not refreshed for away_ms, and
-- removed once not for expire_ms, the lead passing to the earliest-joined who remains. A refresh
-- never brings back a record already expired: that member went expire_ms unseen. Writes once, and
-- returns what changed: removed, flipped (online either way), succeeded, ended.
local function keep_members(pid, now, away_ms, expire_ms, seated)
	local at = tonumber(now)
	local leader = redis.call('HGET', party_key(pid), 'leader')
	local kept, out, changed = {}, {}, false
	local function note(list, player)
		out[list] = out[list] or {}
		table.insert(out[list], player)
		changed = true
	end
	for _, m in ipairs(members_of(pid)) do
		local last = redis.call('HGET', seen_key(pid), m.player_id)
		if not last then
			-- a member from before records were kept: theirs starts now
			last = now
			seen(pid, m.player_id, now)
		end
		local idle = at - tonumber(last)
		if idle >= tonumber(expire_ms) then
			note('removed', m.player_id)
			if m.player_id == leader then out.succeeded = true end
			redis.call('HDEL', seen_key(pid), m.player_id)
			if redis.call('GET', pointer_key(m.player_id)) == pid then redis.call('DEL', pointer_key(m.player_id)) end
		else
			if seated[m.player_id] then
				seen(pid, m.player_id, now)
				if m.away then
					m.away = nil
					note('flipped', m.player_id)
				end
			elseif idle >= tonumber(away_ms) and not m.away then
				m.away = true
				note('flipped', m.player_id)
			end
			kept[#kept + 1] = m
		end
	end
	if not changed then return out end
	if #kept == 0 then
		end_party(pid)
		return {removed = out.removed, ended = true}
	end
	if out.succeeded then
		-- members are in join order: the first who remains joined earliest
		redis.call('HSET', party_key(pid), 'leader', kept[1].player_id)
	end
	redis.call('HSET', party_key(pid), 'members', cjson.encode(kept))
	bump(pid)
	return out
end

-- puts every key of the party back on its TTL
local function keep_alive(pid, ttl)
	redis.call('PEXPIRE', party_key(pid), ttl)
	redis.call('PEXPIRE', invites_key(pid), ttl)
	redis.call('PEXPIRE', seen_key(pid), ttl)
	for _, m in ipairs(members_of(pid)) do
		redis.call('PEXPIRE', pointer_key(m.player_id), ttl)
	end
end

-- the party as a reply carries it: open invites as reserved slots, oldest first; an empty list is
-- left out, since an empty Lua table cannot say whether it was a list. An invite whose record has
-- lapsed (the caller's clock behind Redis's) is no longer reserved, and leaves the party's count.
local function snapshot(pid)
	local fields = redis.call('HMGET', party_key(pid), 'leader', 'created_at', 'members', 'version')
	local party = {id = pid, leader = fields[1], created_at = fields[2], members = cjson.decode(fields[3]), version = fields[4] or '0'}
	for _, m in ipairs(party.members) do
		m.seen_at = redis.call('HGET', seen_key(pid), m.player_id) or m.joined_at
	end
	local reserved = {}
	for _, iid in ipairs(open_invites(pid)) do
		local inv = redis.call('HMGET', invite_key(iid), 'target_id', 'target_name', 'expires_at')
		if inv[1] then
			reserved[#reserved + 1] = {invite_id = iid, target_id = inv[1], target_name = inv[2], expires_at = inv[3]}
		else
			redis.call('ZREM', invites_key(pid), iid)
		end
	end
	if #reserved > 0 then party.reserved = reserved end
	return party
end
