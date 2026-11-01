-- decline: the target refuses the invite; it is spent and its slot frees (FS-NCC9J R13). Also the
-- withdrawal of an invite that never reached its target (I-NCC9J-1 D6): then the party goes with
-- it if the invite created it and nothing else has joined or been invited since.
--
-- KEYS[1] the invite's record
-- ARGV: invite id, the decliner's id ("" for a withdrawal), now, "1" to end a party left alone

local iid, decliner, now, end_if_alone = ARGV[1], ARGV[2], ARGV[3], ARGV[4] == '1'

local inv = redis.call('HMGET', invite_key(iid), 'party_id', 'target_id', 'target_name', 'expires_at')
if not inv[1] then return refuse('no_invite') end
local pid = inv[1]
-- an invite answers only to its own target; an expired one is ignored, not spent (R12, R13)
if decliner ~= '' and inv[2] ~= decliner then return refuse('no_invite') end
if decliner ~= '' and tonumber(now) >= tonumber(inv[4]) then return refuse('no_invite') end

spend_invite(iid)
if redis.call('EXISTS', party_key(pid)) == 0 then return refuse('no_invite') end

if end_if_alone then
	local members = members_of(pid)
	prune(pid, now)
	if #members == 1 and redis.call('ZCARD', invites_key(pid)) == 0 then
		redis.call('DEL', party_key(pid), invites_key(pid), pointer_key(members[1].player_id))
		return reply({code = 'ok', ended = true, target_name = inv[3]})
	end
end

bump(pid)
return reply({code = 'ok', party = snapshot(pid), target_name = inv[3]})
