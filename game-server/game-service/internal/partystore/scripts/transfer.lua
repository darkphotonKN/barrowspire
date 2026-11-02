-- transfer: the leader hands the lead to a member (FS-NCC9J R16; FS-R82NV R19).
--
-- KEYS[1] the party's key
-- ARGV: party id, the leader's id, the new leader's id, party TTL

local pid, leader, target, party_ttl = ARGV[1], ARGV[2], ARGV[3], ARGV[4]

if redis.call('EXISTS', party_key(pid)) == 0 then return refuse('not_leader') end
if redis.call('HGET', party_key(pid), 'leader') ~= leader then return refuse('not_leader') end

local found = false
for _, m in ipairs(members_of(pid)) do
	if m.player_id == target then found = true end
end
if not found then return refuse('not_member') end

redis.call('HSET', party_key(pid), 'leader', target)
bump(pid)
keep_alive(pid, party_ttl)

return reply({code = 'ok', party = snapshot(pid)})
